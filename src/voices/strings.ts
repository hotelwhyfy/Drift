import { Adsr } from '../dsp/env.ts'
import { Phasor, sawFrom } from '../dsp/osc.ts'
import { Svf } from '../dsp/svf.ts'
import { SmoothRandom } from '../dsp/noise.ts'
import { clamp01, lerp } from '../core/curves.ts'
import { midiToHz } from '../core/theory.ts'
import type { Rng } from '../core/rng.ts'
import type { Stereo } from './types.ts'

export interface StringsParams {
  attack: number
  release: number
  /** Lowpass, Hz. */
  brightness: number
  /** 0..1 — ensemble detune. */
  ensemble: number
  /** Vibrato depth in cents, once it has arrived. */
  vibrato: number
  /** Seconds before the vibrato comes in, the way a player lets a note settle first. */
  vibratoDelay: number
  /** 0..1 — how much each note grows over its length. */
  swell: number
  /** 0..1 — how far the section spreads across the field. */
  width: number
  level: number
}

const UNISON = 5
const DETUNE = [-1, -0.5, 0, 0.45, 1] as const
const BODY_A = 480
const BODY_B = 1250

/**
 * A string section: a handful of detuned saws per note, a delayed vibrato, and
 * a bow that can swell through the note rather than simply sustain it.
 *
 * Two fixed resonances on the shared bus stand in for the body of the
 * instruments. They are what stop a saw ensemble reading as a synthesiser —
 * and, being fixed, they colour every note the same way, as a real body does.
 */
class StringVoice {
  private phasors: Phasor[] = []
  private amp: Adsr
  private filter: Svf
  private drift: SmoothRandom
  private hz = 220
  private age = 0
  private length = 1
  private velocity = 0
  private vibPhase = 0
  private panL = 0.7
  private panR = 0.7
  midi = -1

  constructor(private readonly sampleRate: number, rng: Rng) {
    for (let i = 0; i < UNISON; i++) this.phasors.push(new Phasor(sampleRate, rng()))
    this.amp = new Adsr(sampleRate)
    this.filter = new Svf(sampleRate)
    this.drift = new SmoothRandom(sampleRate, rng, 0.3)
  }

  get active(): boolean {
    return this.amp.active
  }

  get held(): boolean {
    return this.amp.gated
  }

  start(midi: number, velocity: number, seconds: number, p: StringsParams, referenceHz: number, rng: Rng): void {
    this.midi = midi
    this.hz = midiToHz(midi, referenceHz)
    this.velocity = velocity
    this.age = 0
    this.length = Math.max(0.5, seconds) * this.sampleRate
    this.vibPhase = rng()
    this.amp.set(p.attack, p.attack, 0.85, p.release)
    this.amp.gate()
    const pan = (rng() - 0.5) * 2 * p.width
    const a = (pan + 1) * 0.25 * Math.PI
    this.panL = Math.cos(a)
    this.panR = Math.sin(a)
  }

  extend(seconds: number): void {
    this.length = Math.max(this.length, this.age + seconds * this.sampleRate)
  }

  release(): void {
    this.amp.release()
  }

  process(out: Stereo, p: StringsParams): void {
    if (!this.amp.active) return
    this.age++
    const settle = clamp01((this.age / this.sampleRate - p.vibratoDelay) / 1.2)
    this.vibPhase += 5.2 / this.sampleRate
    if (this.vibPhase >= 1) this.vibPhase -= 1
    const vib = Math.sin(this.vibPhase * 2 * Math.PI) * p.vibrato * settle + this.drift.process() * 3
    const cents = lerp(3, 18, clamp01(p.ensemble))
    let s = 0
    for (let i = 0; i < UNISON; i++) {
      const ph = this.phasors[i]
      ph.setHz(this.hz * (1 + (DETUNE[i] * cents + vib) * 0.000578))
      s += sawFrom(ph.step(), ph.increment)
    }
    s /= UNISON
    this.filter.set(p.brightness * Math.pow(this.hz / 330, 0.3), 0.6)
    s = this.filter.lowpass(s)
    // The bow: an optional crescendo across the note's length.
    const through = clamp01(this.age / this.length)
    const bow = 1 - p.swell + p.swell * (0.35 + 0.65 * through)
    const a = this.amp.process() * this.velocity * bow
    out[0] += s * a * this.panL
    out[1] += s * a * this.panR
  }
}

export class Strings {
  private voices: StringVoice[] = []
  private held: { voice: StringVoice; until: number }[] = []
  private params: StringsParams
  private sample = 0
  private acc: Stereo = [0, 0]
  private bodyAL: Svf
  private bodyAR: Svf
  private bodyBL: Svf
  private bodyBR: Svf

  constructor(private readonly sampleRate: number, private readonly rng: Rng, polyphony = 8) {
    for (let i = 0; i < polyphony; i++) this.voices.push(new StringVoice(sampleRate, rng))
    this.bodyAL = new Svf(sampleRate)
    this.bodyAR = new Svf(sampleRate)
    this.bodyBL = new Svf(sampleRate)
    this.bodyBR = new Svf(sampleRate)
    this.bodyAL.set(BODY_A, 1.4)
    this.bodyAR.set(BODY_A * 1.04, 1.4)
    this.bodyBL.set(BODY_B, 1.8)
    this.bodyBR.set(BODY_B * 0.97, 1.8)
    this.params = {
      attack: 2.5, release: 3, brightness: 2800, ensemble: 0.5, vibrato: 12,
      vibratoDelay: 0.8, swell: 0.4, width: 0.7, level: 0.25,
    }
  }

  set(p: StringsParams): void {
    this.params = p
  }

  noteOn(midi: number, velocity: number, durationSec: number, referenceHz: number): void {
    const until = this.sample + durationSec * this.sampleRate
    for (const h of this.held) {
      if (h.voice.midi === midi && h.voice.held) {
        h.until = Math.max(h.until, until)
        h.voice.extend(durationSec)
        return
      }
    }
    const voice = this.voices.find((v) => !v.active) ?? this.held.shift()?.voice ?? this.voices[0]
    voice.start(midi, velocity, durationSec, this.params, referenceHz, this.rng)
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
    const acc = this.acc
    acc[0] = 0
    acc[1] = 0
    for (let i = 0; i < this.voices.length; i++) this.voices[i].process(acc, this.params)
    const l = acc[0] * 0.7 + this.bodyAL.bandpass(acc[0]) * 0.5 + this.bodyBL.bandpass(acc[0]) * 0.35
    const r = acc[1] * 0.7 + this.bodyAR.bandpass(acc[1]) * 0.5 + this.bodyBR.bandpass(acc[1]) * 0.35
    out[0] += l * this.params.level
    out[1] += r * this.params.level
  }
}
