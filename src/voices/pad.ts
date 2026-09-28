import { Adsr } from '../dsp/env.ts'
import { Phasor, sawFrom, Triangle } from '../dsp/osc.ts'
import { Svf } from '../dsp/svf.ts'
import { SmoothRandom } from '../dsp/noise.ts'
import { panGains, clamp, clamp01, lerp } from '../core/curves.ts'
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
  /** 0..1 — how far apart the notes of a chord are placed in the stereo field. */
  spread: number
  /** 0..1 — how far each note's own unison oscillators fan out across the field. */
  width: number
  /** 0..1 — how much the timbre and the detune slowly breathe while a note is held. */
  evolve: number
  level: number
}

const UNISON = 5
/** Detune offsets in cents, deliberately uneven so no two beat at one rate. */
const SPREAD = [-1, -0.42, 0.11, 0.55, 1] as const
/** Where each oscillator sits across the field at full width: alternating, so
 *  neighbours in pitch land on opposite sides and the beating reads as space. */
const FAN = [-1, 0.55, -0.2, 0.2, -0.55] as const

/**
 * The bed. Five detuned oscillators per note through a slowly wandering filter.
 *
 * The wander is per-voice and randomly phased, so the chord never breathes in
 * unison — which is the difference between a pad that sounds like one patch and
 * one that sounds like several players holding a note.
 *
 * Width fans the five oscillators themselves across the field, which is a
 * different thing from panning the note: a wide pad is one note that fills the
 * room, not five notes in five places. It needs a filter per channel, because
 * the two sides now carry different signals.
 */
class PadVoice {
  private phasors: Phasor[] = []
  private tris: Triangle[] = []
  private amp: Adsr
  private filterL: Svf
  private filterR: Svf
  private wander: SmoothRandom
  private breath: SmoothRandom
  private hz = 220
  private pan = 0
  private gainL = new Float64Array(UNISON)
  private gainR = new Float64Array(UNISON)
  private detuneRatios = new Float64Array(UNISON)
  private velocity = 0
  midi = -1

  constructor(sampleRate: number, rng: Rng) {
    for (let i = 0; i < UNISON; i++) {
      this.phasors.push(new Phasor(sampleRate, rng()))
      this.tris.push(new Triangle())
    }
    this.amp = new Adsr(sampleRate)
    this.filterL = new Svf(sampleRate)
    this.filterR = new Svf(sampleRate)
    this.wander = new SmoothRandom(sampleRate, rng, 0.08)
    this.breath = new SmoothRandom(sampleRate, rng, 0.045)
  }

  get active(): boolean {
    return this.amp.active
  }

  /** Still gated — sustaining, not releasing. */
  get held(): boolean {
    return this.amp.gated
  }

  start(midi: number, velocity: number, p: PadParams, referenceHz: number, rng: Rng): void {
    this.midi = midi
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
    this.pan = (rng() - 0.5) * 2 * p.spread
    this.place(p.width)
  }

  /** Work out each oscillator's gains. Control rate: never in the sample loop. */
  place(width: number): void {
    // Equal-power across the fan, so widening does not also make it louder.
    const norm = 1 / Math.sqrt(UNISON)
    for (let i = 0; i < UNISON; i++) {
      const g = panGains(clamp(this.pan + FAN[i] * clamp01(width), -1, 1))
      this.gainL[i] = g[0] * norm
      this.gainR[i] = g[1] * norm
    }
  }

  release(): void {
    this.amp.release()
  }

  process(out: Stereo, p: PadParams): void {
    if (!this.amp.active) return
    // Evolve: the saw blend and the detune drift slowly and independently per
    // note, so a chord held for sixteen bars is not the same sound at the end.
    const breath = p.evolve > 0 ? this.breath.process() * p.evolve : 0
    const shape = clamp01(p.shape + breath * 0.35)
    const stretch = 1 + breath * 1.4
    let l = 0
    let r = 0
    for (let i = 0; i < UNISON; i++) {
      const ph = this.phasors[i]
      if (breath !== 0) ph.setHz(this.hz * (1 + (this.detuneRatios[i] - 1) * stretch))
      const phase = ph.step()
      const saw = sawFrom(phase, ph.increment)
      const tri = this.tris[i].process(phase, ph.increment)
      const s = tri + (saw - tri) * shape
      l += s * this.gainL[i]
      r += s * this.gainR[i]
    }
    // Track the note so high chords are not dull and low ones are not harsh.
    const track = Math.pow(this.hz / 220, 0.35)
    const wobble = 1 + this.wander.process() * p.motion * 0.7
    const cut = p.cutoff * track * wobble
    const q = 0.5 + p.resonance * 3.5
    this.filterL.set(cut, q)
    this.filterR.set(cut, q)
    const a = this.amp.process() * this.velocity / Math.sqrt(UNISON)
    out[0] += this.filterL.lowpass(l) * a
    out[1] += this.filterR.lowpass(r) * a
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
    polyphony = 12,
  ) {
    for (let i = 0; i < polyphony; i++) this.voices.push(new PadVoice(sampleRate, rng))
    this.params = {
      attack: 1.6, release: 3.5, cutoff: 900, resonance: 0.15, detune: 0.4,
      shape: 0.45, motion: 0.5, motionHz: 0.08, spread: 0.8, width: 0.5, evolve: 0.3, level: 0.3,
    }
  }

  set(p: PadParams): void {
    const rewiden = p.width !== this.params.width
    this.params = p
    if (rewiden) {
      for (let i = 0; i < this.voices.length; i++) {
        if (this.voices[i].active) this.voices[i].place(p.width)
      }
    }
  }

  noteOn(midi: number, velocity: number, durationSec: number, referenceHz: number): void {
    const until = this.sample + durationSec * this.sampleRate
    // Legato: a note already sustaining is held on rather than struck again.
    // The pad restates its chord every bar, and re-attacking a held chord on
    // every bar line is a pulse — the one thing a pad is there not to have.
    for (let i = 0; i < this.held.length; i++) {
      const h = this.held[i]
      if (h.voice.midi === midi && h.voice.held) {
        h.until = Math.max(h.until, until)
        return
      }
    }
    const voice = this.steal()
    voice.start(midi, velocity, this.params, referenceHz, this.rng)
    this.held.push({ voice, until })
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
