import { Adsr } from '@/dsp/env.ts'
import { Phasor, sineFrom } from '@/dsp/osc.ts'
import { Svf } from '@/dsp/svf.ts'
import { Reverb } from '@/dsp/reverb.ts'
import { Noise, SmoothRandom } from '@/dsp/noise.ts'
import { panGains, clamp01, lerp } from '@/core/curves.ts'
import { midiToHz } from '@/core/theory.ts'
import type { Rng } from '@/core/rng.ts'
import type { Stereo } from '@/core/types.ts'

export interface WindParams {
  attack: number
  release: number
  /** 0..1 — harmonics in the tone: a pure, low flute at 0, an overblown one at 1. */
  tone: number
  /** 0..1 — air in the sound. */
  breath: number
  /** Vibrato depth in cents, once it has arrived. */
  vibrato: number
  /** Seconds before the vibrato comes in. */
  vibratoDelay: number
  /** 0..1 — where in the field the player stands. */
  width: number
  /** 0..1 — how much of the room's tail is mixed in, and how long it rings. */
  space: number
  level: number
}

const HARMONICS = [1, 0.32, 0.12] as const
/** The air's resonance, as a multiple of the note: a pipe sings on its own pitch. */
const AIR_Q = 6
const CHIFF_TIME = 0.09

/**
 * One breath through a pipe. A near-sine, with harmonics that tone lets in,
 * and noise run through a resonance on the note's own pitch — which is how a
 * flute's air becomes a pitched airiness instead of a hiss.
 *
 * The player is monophonic: a new note takes over from the last, which is
 * released as it enters, the way one breath cannot carry two notes.
 */
class WindVoice {
  private phasor: Phasor
  private amp: Adsr
  private air: Svf
  private tilt: Svf
  private drift: SmoothRandom
  private hz = 440
  private age = 0
  private velocity = 0
  private vibPhase = 0
  private panL = 0.7
  private panR = 0.7
  midi = -1

  constructor(private readonly sampleRate: number, rng: Rng) {
    this.phasor = new Phasor(sampleRate, rng())
    this.amp = new Adsr(sampleRate)
    this.air = new Svf(sampleRate)
    this.tilt = new Svf(sampleRate)
    this.drift = new SmoothRandom(sampleRate, rng, 0.5)
  }

  get active(): boolean {
    return this.amp.active
  }

  get held(): boolean {
    return this.amp.gated
  }

  retune(referenceHz: number): void {
    if (this.midi >= 0) this.hz = midiToHz(this.midi, referenceHz)
  }

  start(midi: number, velocity: number, p: WindParams, referenceHz: number, rng: Rng): void {
    this.midi = midi
    this.hz = midiToHz(midi, referenceHz)
    this.velocity = velocity
    this.age = 0
    this.vibPhase = rng()
    this.amp.set(p.attack, p.attack * 1.5, 0.8, p.release)
    this.amp.gate()
    const g = panGains((rng() - 0.5) * p.width)
    this.panL = g[0]
    this.panR = g[1]
    this.air.set(Math.min(this.hz * 2, this.sampleRate * 0.4), AIR_Q)
    // The tone control, scaled to the note: a high note is already bright.
    this.tilt.set(Math.min(this.hz * lerp(2.2, 6, clamp01(p.tone)), this.sampleRate * 0.4), 0.7)
  }

  release(): void {
    this.amp.release()
  }

  process(out: Stereo, p: WindParams, breath: number): void {
    if (!this.amp.active) return
    this.age++
    const seconds = this.age / this.sampleRate
    const settle = clamp01((seconds - p.vibratoDelay) / 0.9)
    this.vibPhase += 5.3 / this.sampleRate
    if (this.vibPhase >= 1) this.vibPhase -= 1
    const cents = Math.sin(this.vibPhase * 2 * Math.PI) * p.vibrato * settle + this.drift.process() * 6
    this.phasor.setHz(this.hz * (1 + cents * 0.000578))
    const ph = this.phasor.step()
    const h2 = ph * 2 - Math.floor(ph * 2)
    const h3 = ph * 3 - Math.floor(ph * 3)
    const bright = clamp01(p.tone)
    let s = sineFrom(ph) * HARMONICS[0]
    s += sineFrom(h2) * HARMONICS[1] * bright
    s += sineFrom(h3) * HARMONICS[2] * bright * bright
    const a = this.amp.process()
    // Air is loudest as the note starts, and settles to a fraction of itself.
    const puff = 0.35 + 0.65 * Math.exp(-seconds / CHIFF_TIME)
    const air = this.air.bandpass(breath) * p.breath * puff * 0.45
    s = this.tilt.lowpass(s + air)
    const g = a * this.velocity
    out[0] += s * g * this.panL
    out[1] += s * g * this.panR
  }
}

export class Wind {
  private voices: WindVoice[] = []
  private held: { voice: WindVoice; until: number }[] = []
  private params: WindParams
  private noise: Noise
  private sample = 0
  private acc: Stereo = [0, 0]
  private wet: Stereo = [0, 0]
  private room: Reverb
  private roomSpace = -1

  constructor(private readonly sampleRate: number, private readonly rng: Rng, polyphony = 3) {
    for (let i = 0; i < polyphony; i++) this.voices.push(new WindVoice(sampleRate, rng))
    this.noise = new Noise(rng)
    // The player's own room. A breath into a pipe is dry and dies the moment
    // the note ends; the tail is what lets a phrase hang.
    this.room = new Reverb(sampleRate, rng)
    this.params = {
      attack: 0.12, release: 1.6, tone: 0.3, breath: 0.3, vibrato: 14,
      vibratoDelay: 0.5, width: 0.5, space: 0.5, level: 0.25,
    }
  }

  set(p: WindParams): void {
    this.params = p
    // Only touched when the knob moves: setting the room re-derives its feedback.
    if (p.space !== this.roomSpace) {
      this.roomSpace = p.space
      this.room.set(0.55 + p.space * 0.3, 2.2 + p.space * 3.5, 0.55, 0.025, 1)
    }
  }

  retune(referenceHz: number): void {
    for (let i = 0; i < this.voices.length; i++) this.voices[i].retune(referenceHz)
  }

  noteOn(midi: number, velocity: number, durationSec: number, referenceHz: number): void {
    const until = this.sample + durationSec * this.sampleRate
    // One player: whatever is still sounding lets go as the new note enters.
    for (let i = 0; i < this.held.length; i++) this.held[i].voice.release()
    this.held.length = 0
    const voice = this.voices.find((v) => !v.active) ?? this.voices[0]
    voice.start(midi, velocity, this.params, referenceHz, this.rng)
    this.held.push({ voice, until })
  }

  process(out: Stereo): void {
    this.sample++
    for (let i = this.held.length - 1; i >= 0; i--) {
      if (this.sample >= this.held[i].until) {
        this.held[i].voice.release()
        this.held.splice(i, 1)
      }
    }
    const breath = this.noise.white()
    const acc = this.acc
    acc[0] = 0
    acc[1] = 0
    for (let i = 0; i < this.voices.length; i++) this.voices[i].process(acc, this.params, breath)
    this.room.process(acc[0], acc[1], this.wet)
    const mix = this.params.space * 0.9
    out[0] += (acc[0] + this.wet[0] * mix) * this.params.level
    out[1] += (acc[1] + this.wet[1] * mix) * this.params.level
  }
}
