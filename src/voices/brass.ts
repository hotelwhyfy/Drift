import { Adsr } from '@/dsp/env.ts'
import { Phasor, sawFrom } from '@/dsp/osc.ts'
import { Svf } from '@/dsp/svf.ts'
import { Noise, SmoothRandom } from '@/dsp/noise.ts'
import { panGains, clamp01, lerp } from '@/core/curves.ts'
import { midiToHz } from '@/core/theory.ts'
import type { Rng } from '@/core/rng.ts'
import type { Stereo } from '@/core/types.ts'

export interface BrassParams {
  attack: number
  release: number
  /** Lowpass ceiling, Hz — where the note's filter ends up once it has fully opened. */
  brightness: number
  /** 0..1 — how hard the sound is driven: the edge of a section leaning in. */
  edge: number
  /** 0..1 — how far each note starts flat and climbs into pitch. */
  scoop: number
  /** 0..1 — the breath of the lips at the start of a note. */
  chiff: number
  /** Vibrato depth in cents, once it has arrived. */
  vibrato: number
  /** 0..1 — how far the players on one note disagree in pitch. */
  ensemble: number
  /** 0..1 — how far the section spreads across the field. */
  width: number
  level: number
}

const UNISON = 3
const DETUNE = [-1, 0.2, 0.85] as const
/** Resonances of a bell, shared by the whole section. */
const BELL_A = 620
const BELL_B = 1650
/** Seconds a scooped note takes to find its pitch. */
const SCOOP_TIME = 0.14
const CHIFF_TIME = 0.16

/**
 * One horn: a few slightly disagreeing saws through a lowpass that follows the
 * note's own loudness. That coupling is the whole instrument — a brass tone
 * gets brighter as it gets louder, so a swell is a note opening, not a sound
 * turned up.
 */
class BrassVoice {
  private phasors: Phasor[] = []
  private amp: Adsr
  private filter: Svf
  private drift: SmoothRandom
  private hz = 220
  /** Cutoff scaling for the note's pitch; fixed for the life of a note. */
  private track = 1
  private age = 0
  private velocity = 0
  private vibPhase = 0
  private panL = 0.7
  private panR = 0.7
  midi = -1

  constructor(private readonly sampleRate: number, rng: Rng) {
    for (let i = 0; i < UNISON; i++) this.phasors.push(new Phasor(sampleRate, rng()))
    this.amp = new Adsr(sampleRate)
    this.filter = new Svf(sampleRate)
    this.drift = new SmoothRandom(sampleRate, rng, 0.35)
  }

  get active(): boolean {
    return this.amp.active
  }

  get held(): boolean {
    return this.amp.gated
  }

  /** The phasors follow `hz` every sample, so moving it is enough. */
  retune(referenceHz: number): void {
    if (this.midi >= 0) this.hz = midiToHz(this.midi, referenceHz)
  }

  start(midi: number, velocity: number, p: BrassParams, referenceHz: number, rng: Rng): void {
    this.midi = midi
    this.hz = midiToHz(midi, referenceHz)
    this.track = Math.pow(this.hz / 220, 0.25)
    this.velocity = velocity
    this.age = 0
    this.vibPhase = rng()
    this.amp.set(p.attack, p.attack, 0.9, p.release)
    this.amp.gate()
    // A section sits where it sits; a wide spread would read as a pad.
    const g = panGains((rng() - 0.5) * p.width)
    this.panL = g[0]
    this.panR = g[1]
  }

  release(): void {
    this.amp.release()
  }

  process(out: Stereo, p: BrassParams, chiff: number): void {
    if (!this.amp.active) return
    this.age++
    const seconds = this.age / this.sampleRate
    const settle = clamp01((seconds - 0.9) / 1.4)
    this.vibPhase += 4.8 / this.sampleRate
    if (this.vibPhase >= 1) this.vibPhase -= 1
    const scoop = -p.scoop * 60 * Math.exp(-seconds / (SCOOP_TIME * 0.4))
    const vib = Math.sin(this.vibPhase * 2 * Math.PI) * p.vibrato * settle + this.drift.process() * 5 + scoop
    const cents = lerp(4, 16, clamp01(p.ensemble))
    let s = 0
    for (let i = 0; i < UNISON; i++) {
      const ph = this.phasors[i]
      ph.setHz(this.hz * (1 + (DETUNE[i] * cents + vib) * 0.000578))
      s += sawFrom(ph.step(), ph.increment)
    }
    s /= UNISON
    const a = this.amp.process()
    // Edge: soft-clip a driven signal, which adds the odd harmonics a lip
    // buzz has without a second oscillator.
    const drive = 1 + p.edge * 3
    s *= drive
    s = s / (1 + Math.abs(s))
    s += chiff * Math.exp(-seconds / CHIFF_TIME)
    // Louder is brighter: the cutoff rides the envelope's own level.
    const open = 0.12 + 0.88 * a * a
    this.filter.set(p.brightness * this.track * open * (0.8 + this.velocity * 0.4), 0.7)
    s = this.filter.lowpass(s)
    const g = a * this.velocity
    out[0] += s * g * this.panL
    out[1] += s * g * this.panR
  }
}

/**
 * A brass section that plays swells: a few notes rising out of nothing, held,
 * and let go. Not a fanfare — the attack is slow and the filter opens with it.
 */
export class Brass {
  private voices: BrassVoice[] = []
  private held: { voice: BrassVoice; until: number }[] = []
  private params: BrassParams
  private noise: Noise
  private sample = 0
  private acc: Stereo = [0, 0]
  private bellAL: Svf
  private bellAR: Svf
  private bellBL: Svf
  private bellBR: Svf

  constructor(private readonly sampleRate: number, private readonly rng: Rng, polyphony = 6) {
    for (let i = 0; i < polyphony; i++) this.voices.push(new BrassVoice(sampleRate, rng))
    this.noise = new Noise(rng)
    this.bellAL = new Svf(sampleRate)
    this.bellAR = new Svf(sampleRate)
    this.bellBL = new Svf(sampleRate)
    this.bellBR = new Svf(sampleRate)
    this.bellAL.set(BELL_A, 1.6)
    this.bellAR.set(BELL_A * 1.03, 1.6)
    this.bellBL.set(BELL_B, 2)
    this.bellBR.set(BELL_B * 0.97, 2)
    this.params = {
      attack: 2.5, release: 2.5, brightness: 1800, edge: 0.3, scoop: 0.3,
      chiff: 0.15, vibrato: 6, ensemble: 0.4, width: 0.5, level: 0.25,
    }
  }

  set(p: BrassParams): void {
    this.params = p
  }

  retune(referenceHz: number): void {
    for (let i = 0; i < this.voices.length; i++) this.voices[i].retune(referenceHz)
  }

  noteOn(midi: number, velocity: number, durationSec: number, referenceHz: number): void {
    const until = this.sample + durationSec * this.sampleRate
    for (let i = 0; i < this.held.length; i++) {
      const h = this.held[i]
      if (h.voice.midi === midi && h.voice.held) {
        h.until = Math.max(h.until, until)
        return
      }
    }
    const voice = this.voices.find((v) => !v.active) ?? this.held.shift()?.voice ?? this.voices[0]
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
    // One breath shared by the section, as in the choir; scaled so a note's
    // own onset decides how much of it is heard.
    const chiff = this.noise.white() * this.params.chiff * 0.5
    const acc = this.acc
    acc[0] = 0
    acc[1] = 0
    for (let i = 0; i < this.voices.length; i++) this.voices[i].process(acc, this.params, chiff)
    const l = acc[0] * 0.7 + this.bellAL.bandpass(acc[0]) * 0.45 + this.bellBL.bandpass(acc[0]) * 0.3
    const r = acc[1] * 0.7 + this.bellAR.bandpass(acc[1]) * 0.45 + this.bellBR.bandpass(acc[1]) * 0.3
    out[0] += l * this.params.level
    out[1] += r * this.params.level
  }
}
