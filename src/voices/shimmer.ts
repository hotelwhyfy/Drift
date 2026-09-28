import { Adsr } from '../dsp/env.ts'
import { Svf } from '../dsp/svf.ts'
import { clamp01, lerp } from '../core/curves.ts'
import { midiToHz } from '../core/theory.ts'
import type { Rng } from '../core/rng.ts'
import type { Stereo } from './types.ts'

export interface ShimmerParams {
  /** Seconds per grain. */
  grainSize: number
  /** Grains per second, across the whole cloud. */
  grainRate: number
  /** 0..1 — scatter in each grain's pitch and placement. */
  spray: number
  /** 0..1 — how often a grain jumps up one or two octaves. */
  octaves: number
  /** Lowpass on the cloud, Hz. */
  tone: number
  /** 0..1 — how far the grains scatter across the field. */
  width: number
  attack: number
  release: number
  level: number
}

const NOTES = 6
const GRAINS = 32
const WINDOW = 1024

/** One Hann window, shared by every grain. */
const HANN = new Float32Array(WINDOW)
for (let i = 0; i < WINDOW; i++) HANN[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (WINDOW - 1))

/**
 * A cloud of tiny grains of sine, each at one of the notes the resolver chose
 * or an octave above it.
 *
 * Octaves only, never fifths: a grain a fifth above a chord's third can land
 * on a note outside the chord, and the resolver would never have seen it — a
 * way around the one rule that keeps every instrument in tune with every
 * other. Octaves of a resolved note are the same note.
 *
 * Each held note fades in and out slowly, and while it sounds it feeds grains
 * to the cloud; the cloud has no pitch of its own.
 */
export class Shimmer {
  private notes: { hz: number; amp: Adsr; until: number; midi: number; velocity: number }[] = []
  // Grain state lives in flat typed arrays: a grain is born dozens of times a
  // second, and allocating one per birth is garbage in the audio thread.
  private gPhase = new Float64Array(GRAINS)
  private gInc = new Float64Array(GRAINS)
  private gPos = new Float64Array(GRAINS)
  private gStep = new Float64Array(GRAINS)
  private gAmp = new Float64Array(GRAINS)
  private gL = new Float64Array(GRAINS)
  private gR = new Float64Array(GRAINS)
  private gNote = new Int32Array(GRAINS).fill(-1)
  private filterL: Svf
  private filterR: Svf
  private params: ShimmerParams
  private sample = 0

  constructor(private readonly sampleRate: number, private readonly rng: Rng) {
    for (let i = 0; i < NOTES; i++) {
      this.notes.push({ hz: 440, amp: new Adsr(sampleRate), until: 0, midi: -1, velocity: 0 })
    }
    this.filterL = new Svf(sampleRate)
    this.filterR = new Svf(sampleRate)
    this.params = {
      grainSize: 0.18, grainRate: 12, spray: 0.3, octaves: 0.4, tone: 5000,
      width: 0.8, attack: 2, release: 4, level: 0.2,
    }
  }

  set(p: ShimmerParams): void {
    this.params = p
  }

  noteOn(midi: number, velocity: number, durationSec: number, referenceHz: number): void {
    const until = this.sample + durationSec * this.sampleRate
    for (const n of this.notes) {
      if (n.midi === midi && n.amp.gated) {
        n.until = Math.max(n.until, until)
        return
      }
    }
    const free = this.notes.find((n) => !n.amp.active) ??
      this.notes.reduce((a, b) => (a.until < b.until ? a : b))
    free.midi = midi
    free.hz = midiToHz(midi, referenceHz)
    free.velocity = velocity
    free.until = until
    free.amp.set(this.params.attack, this.params.attack, 1, this.params.release)
    free.amp.gate()
  }

  private spawn(): void {
    const p = this.params
    // Weighted towards the notes sounding loudest, so a note fading out thins
    // from the cloud rather than stopping in it.
    let total = 0
    for (let i = 0; i < NOTES; i++) if (this.notes[i].amp.active) total += 1
    if (total === 0) return
    let pick = Math.floor(this.rng() * total)
    let note = -1
    for (let i = 0; i < NOTES; i++) {
      if (!this.notes[i].amp.active) continue
      if (pick-- === 0) { note = i; break }
    }
    if (note < 0) return
    let slot = -1
    for (let g = 0; g < GRAINS; g++) {
      if (this.gNote[g] < 0) { slot = g; break }
    }
    if (slot < 0) return
    const up = this.rng() < p.octaves ? (this.rng() < p.octaves * 0.5 ? 4 : 2) : 1
    const cents = (this.rng() - 0.5) * p.spray * 14
    const hz = this.notes[note].hz * up * Math.pow(2, cents / 1200)
    const size = p.grainSize * (1 + (this.rng() - 0.5) * p.spray)
    const pan = (this.rng() - 0.5) * 2 * p.width
    const a = (pan + 1) * 0.25 * Math.PI
    this.gNote[slot] = note
    this.gPhase[slot] = this.rng()
    this.gInc[slot] = hz / this.sampleRate
    this.gPos[slot] = 0
    this.gStep[slot] = WINDOW / Math.max(16, size * this.sampleRate)
    // Higher grains are quieter, the way overtones are.
    this.gAmp[slot] = this.notes[note].velocity / up
    this.gL[slot] = Math.cos(a)
    this.gR[slot] = Math.sin(a)
  }

  process(out: Stereo): void {
    this.sample++
    const p = this.params
    for (let i = 0; i < NOTES; i++) {
      const n = this.notes[i]
      if (n.amp.gated && this.sample >= n.until) n.amp.release()
    }
    if (this.rng() < p.grainRate / this.sampleRate) this.spawn()

    let l = 0
    let r = 0
    for (let g = 0; g < GRAINS; g++) {
      const note = this.gNote[g]
      if (note < 0) continue
      const pos = this.gPos[g]
      if (pos >= WINDOW - 1) {
        this.gNote[g] = -1
        continue
      }
      const w = HANN[pos | 0]
      const s = Math.sin(this.gPhase[g] * 2 * Math.PI) * w * this.gAmp[g]
      this.gPhase[g] += this.gInc[g]
      if (this.gPhase[g] >= 1) this.gPhase[g] -= 1
      this.gPos[g] = pos + this.gStep[g]
      l += s * this.gL[g]
      r += s * this.gR[g]
    }
    // Every note's envelope scales the whole cloud together: simpler than
    // enveloping each grain by its parent, and indistinguishable in a wash.
    let env = 0
    for (let i = 0; i < NOTES; i++) env = Math.max(env, this.notes[i].amp.process())
    this.filterL.set(p.tone, 0.6)
    this.filterR.set(p.tone, 0.6)
    const gain = p.level * env * lerp(0.5, 0.22, clamp01(p.grainRate / 40))
    out[0] += this.filterL.lowpass(l) * gain
    out[1] += this.filterR.lowpass(r) * gain
  }
}
