import { Adsr } from '../dsp/env.ts'
import { SmoothRandom } from '../dsp/noise.ts'
import { panGains, clamp, clamp01, lerp } from '../core/curves.ts'
import { midiToHz } from '../core/theory.ts'
import type { Rng } from '../core/rng.ts'
import type { Stereo } from '../core/types.ts'

export interface DroneParams {
  attack: number
  release: number
  /** 0..1 — how slowly the harmonics fall away; the drone's only tone control. */
  brightness: number
  /** Hz between each partial and its twin. Absolute, so the beating is as slow low down as high up. */
  beat: number
  /** 0..1 — how far each harmonic's level wanders while the note is held. */
  evolve: number
  /** How fast the harmonics wander, Hz. */
  evolveHz: number
  /** 0..1 — how far the partials and their twins fan across the field. */
  width: number
  level: number
}

const PARTIALS = 8
const TWO_PI = Math.PI * 2
/** Where each harmonic sits across the field at full width; the twin takes the mirror. */
const FAN = [0, 0.6, -0.45, 0.8, -0.75, 0.3, -0.25, 0.95] as const

/**
 * One held note, built out of its harmonics.
 *
 * Every harmonic is a pair of sines a fraction of a hertz apart, so each one
 * beats slowly on its own clock, and its level wanders on a random walk of its
 * own. Nothing about the note is periodic for longer than a few seconds — the
 * shimmer of a tanpura or a harmonium, where the pitch never moves and the
 * colour never stops.
 *
 * The harmonics are the note's own timbre, not more notes: they fall away in
 * level the way any held tone's do, and the resolver chose the fundamental.
 */
class DroneVoice {
  private amp: Adsr
  private wander: SmoothRandom[] = []
  private phase = new Float64Array(PARTIALS)
  private twinPhase = new Float64Array(PARTIALS)
  private inc = new Float64Array(PARTIALS)
  private twinInc = new Float64Array(PARTIALS)
  /** Each harmonic's share of the twin's offset, fixed per note so no two beat alike. */
  private beatShare = new Float64Array(PARTIALS)
  private gainL = new Float64Array(PARTIALS)
  private gainR = new Float64Array(PARTIALS)
  private twinL = new Float64Array(PARTIALS)
  private twinR = new Float64Array(PARTIALS)
  /** Harmonics below Nyquist, worked out when the note starts or is retuned. */
  private count = PARTIALS
  private hz = 110
  private beat = 0
  private velocity = 0
  private pan = 0
  midi = -1

  constructor(private readonly sampleRate: number, rng: Rng) {
    this.amp = new Adsr(sampleRate)
    for (let k = 0; k < PARTIALS; k++) {
      this.wander.push(new SmoothRandom(sampleRate, rng, 0.1))
      this.phase[k] = rng()
      this.twinPhase[k] = rng()
    }
  }

  get active(): boolean {
    return this.amp.active
  }

  get held(): boolean {
    return this.amp.gated
  }

  retune(referenceHz: number): void {
    if (this.midi < 0) return
    this.hz = midiToHz(this.midi, referenceHz)
    this.tune(this.beat)
  }

  /** Partial frequencies. Control rate: when a note starts, is retuned, or the beat moves. */
  tune(beat: number): void {
    this.beat = beat
    const limit = this.sampleRate * 0.45
    this.count = 0
    for (let k = 0; k < PARTIALS; k++) {
      const f = this.hz * (k + 1)
      if (f + beat >= limit) break
      this.inc[k] = f / this.sampleRate
      this.twinInc[k] = (f + beat * this.beatShare[k]) / this.sampleRate
      this.count = k + 1
    }
  }

  start(midi: number, velocity: number, p: DroneParams, referenceHz: number, rng: Rng): void {
    this.midi = midi
    this.hz = midiToHz(midi, referenceHz)
    this.velocity = velocity
    for (let k = 0; k < PARTIALS; k++) {
      this.beatShare[k] = lerp(0.55, 1.45, rng()) * (rng() < 0.5 ? -1 : 1)
      this.wander[k].setHz(p.evolveHz * lerp(0.6, 1.4, rng()))
    }
    this.tune(p.beat)
    this.amp.set(p.attack, p.attack, 0.9, p.release)
    this.amp.gate()
    this.pan = (rng() - 0.5) * 0.6
    this.place(p.width)
  }

  /** Each harmonic's gains. Control rate: never in the sample loop. */
  place(width: number): void {
    const w = clamp01(width)
    for (let k = 0; k < PARTIALS; k++) {
      const a = panGains(clamp(this.pan + FAN[k] * w, -1, 1))
      const b = panGains(clamp(this.pan - FAN[k] * w, -1, 1))
      this.gainL[k] = a[0]
      this.gainR[k] = a[1]
      this.twinL[k] = b[0]
      this.twinR[k] = b[1]
    }
  }

  release(): void {
    this.amp.release()
  }

  process(out: Stereo, p: DroneParams, rolloff: number, norm: number): void {
    if (!this.amp.active) return
    let l = 0
    let r = 0
    let level = 1
    for (let k = 0; k < this.count; k++) {
      // The walk can take a harmonic almost to nothing and back, but never
      // below it: a negative level would flip its phase against its twin.
      const w = 1 + this.wander[k].process() * p.evolve
      const g = level * (w < 0 ? 0 : w)
      level *= rolloff
      let ph = this.phase[k] + this.inc[k]
      if (ph >= 1) ph -= 1
      this.phase[k] = ph
      let tw = this.twinPhase[k] + this.twinInc[k]
      if (tw >= 1) tw -= 1
      else if (tw < 0) tw += 1
      this.twinPhase[k] = tw
      const a = Math.sin(ph * TWO_PI) * g
      const b = Math.sin(tw * TWO_PI) * g
      l += a * this.gainL[k] + b * this.twinL[k]
      r += a * this.gainR[k] + b * this.twinR[k]
    }
    const env = this.amp.process() * this.velocity * norm
    out[0] += l * env
    out[1] += r * env
  }
}

export class Drone {
  private voices: DroneVoice[] = []
  private held: { voice: DroneVoice; until: number }[] = []
  private params: DroneParams
  private sample = 0
  private acc: Stereo = [0, 0]
  private rolloff = 0.5
  private norm = 0.5

  constructor(
    private readonly sampleRate: number,
    private readonly rng: Rng,
    polyphony = 6,
  ) {
    for (let i = 0; i < polyphony; i++) this.voices.push(new DroneVoice(sampleRate, rng))
    this.params = {
      attack: 4, release: 6, brightness: 0.4, beat: 0.6, evolve: 0.5,
      evolveHz: 0.08, width: 0.7, level: 0.2,
    }
    this.shape(this.params)
  }

  /** Each harmonic is this much quieter than the one below it. */
  private shape(p: DroneParams): void {
    this.rolloff = lerp(0.35, 0.8, clamp01(p.brightness))
    // Divide out the sum of the harmonics' levels, so brightening does not
    // also mean louder.
    let sum = 0
    let level = 1
    for (let k = 0; k < PARTIALS; k++) {
      sum += level
      level *= this.rolloff
    }
    this.norm = 1 / sum
  }

  set(p: DroneParams): void {
    const rewiden = p.width !== this.params.width
    const retune = p.beat !== this.params.beat
    this.params = p
    this.shape(p)
    for (let i = 0; i < this.voices.length; i++) {
      const v = this.voices[i]
      if (!v.active) continue
      if (rewiden) v.place(p.width)
      if (retune) v.tune(p.beat)
    }
  }

  retune(referenceHz: number): void {
    for (let i = 0; i < this.voices.length; i++) this.voices[i].retune(referenceHz)
  }

  noteOn(midi: number, velocity: number, durationSec: number, referenceHz: number): void {
    const until = this.sample + durationSec * this.sampleRate
    // A drone that re-attacks on the bar line is a pulse. A note already
    // sustaining is held on instead, so while the chord stays, nothing moves
    // but the colour.
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
    const acc = this.acc
    acc[0] = 0
    acc[1] = 0
    for (let i = 0; i < this.voices.length; i++) {
      this.voices[i].process(acc, this.params, this.rolloff, this.norm)
    }
    out[0] += acc[0] * this.params.level
    out[1] += acc[1] * this.params.level
  }
}
