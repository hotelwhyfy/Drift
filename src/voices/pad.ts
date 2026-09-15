import { Adsr } from '../dsp/env.ts'
import { Phasor, sawFrom, Triangle } from '../dsp/osc.ts'
import { Svf } from '../dsp/svf.ts'
import { SmoothRandom } from '../dsp/noise.ts'
import { panGains, clamp01, lerp } from '../core/curves.ts'
import { midiToHz } from '../core/theory.ts'
import type { Rng } from '../core/rng.ts'
import type { Stereo } from './types.ts'

export interface PadParams {
  attack: number
  release: number
  /** Base cutoff in Hz; the filter wanders around it. */
  cutoff: number
  resonance: number
  /** 0..1 — how far the per-oscillator detuning spreads. */
  detune: number
  /** Mix between triangle (0) and saw (1). */
  shape: number
  /** 0..1 — depth of the slow filter wander. */
  motion: number
  motionHz: number
  spread: number
  level: number
}

const UNISON = 5
/** Detune offsets in cents, deliberately uneven so no two beat at one rate. */
const SPREAD = [-1, -0.42, 0.11, 0.55, 1] as const

/**
 * The bed. Five detuned oscillators per note through a slowly wandering filter.
 *
 * The wander is per-voice and randomly phased, so the chord never breathes in
 * unison — which is the difference between a pad that sounds like one patch and
 * one that sounds like several players holding a note.
 */
class PadVoice {
  private phasors: Phasor[] = []
  private tris: Triangle[] = []
  private amp: Adsr
  private filter: Svf
  private wander: SmoothRandom
  private hz = 220
  private panL = 0.7
  private panR = 0.7
  private detuneRatios = new Float64Array(UNISON)

  constructor(sampleRate: number, rng: Rng) {
    for (let i = 0; i < UNISON; i++) {
      this.phasors.push(new Phasor(sampleRate, rng()))
      this.tris.push(new Triangle())
    }
    this.amp = new Adsr(sampleRate)
    this.filter = new Svf(sampleRate)
    this.wander = new SmoothRandom(sampleRate, rng, 0.08)
  }

  get active(): boolean {
    return this.amp.active
  }

  start(midi: number, velocity: number, p: PadParams, referenceHz: number, rng: Rng): void {
    this.hz = midiToHz(midi, referenceHz)
    const cents = lerp(2, 26, clamp01(p.detune))
    for (let i = 0; i < UNISON; i++) {
      this.detuneRatios[i] = Math.pow(2, (SPREAD[i] * cents) / 1200)
      this.phasors[i].setHz(this.hz * this.detuneRatios[i])
    }
    this.velocity = velocity
    this.amp.set(p.attack, p.attack * 1.5, 0.8, p.release)
    this.amp.gate()
    this.wander.setHz(p.motionHz * (0.6 + rng() * 0.8))
    const g = panGains((rng() - 0.5) * 2 * p.spread)
    this.panL = g[0]
    this.panR = g[1]
  }

  private velocity = 0

  release(): void {
    this.amp.release()
  }

  process(out: Stereo, p: PadParams): void {
    if (!this.amp.active) return
    let s = 0
    for (let i = 0; i < UNISON; i++) {
      const ph = this.phasors[i]
      const phase = ph.step()
      const saw = sawFrom(phase, ph.increment)
      const tri = this.tris[i].process(phase, ph.increment)
      s += lerp(tri, saw, p.shape)
    }
    s /= UNISON
    // Track the note so high chords are not dull and low ones are not harsh.
    const track = Math.pow(this.hz / 220, 0.35)
    const wobble = 1 + this.wander.process() * p.motion * 0.7
    this.filter.set(p.cutoff * track * wobble, 0.5 + p.resonance * 3.5)
    s = this.filter.lowpass(s)
    const a = this.amp.process() * this.velocity
    out[0] += s * a * this.panL
    out[1] += s * a * this.panR
  }
}

export class Pad {
  private voices: PadVoice[] = []
  private held: { voice: PadVoice; until: number }[] = []
  private params: PadParams
  private sample = 0
  private acc: Stereo = [0, 0]

  constructor(
    private readonly sampleRate: number,
    private readonly rng: Rng,
    polyphony = 10,
  ) {
    for (let i = 0; i < polyphony; i++) this.voices.push(new PadVoice(sampleRate, rng))
    this.params = {
      attack: 1.6, release: 3.5, cutoff: 900, resonance: 0.15, detune: 0.4,
      shape: 0.45, motion: 0.5, motionHz: 0.08, spread: 0.8, level: 0.3,
    }
  }

  set(p: PadParams): void {
    this.params = p
  }

  noteOn(midi: number, velocity: number, durationSec: number, referenceHz: number): void {
    const voice = this.steal()
    voice.start(midi, velocity, this.params, referenceHz, this.rng)
    this.held.push({ voice, until: this.sample + durationSec * this.sampleRate })
  }

  private steal(): PadVoice {
    for (let i = 0; i < this.voices.length; i++) {
      if (!this.voices[i].active) return this.voices[i]
    }
    const oldest = this.held.shift()
    return oldest ? oldest.voice : this.voices[0]
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
    out[0] += acc[0] * this.params.level
    out[1] += acc[1] * this.params.level
  }
}
