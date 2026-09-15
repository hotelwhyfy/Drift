import { DelayLine } from './delay.ts'
import { SmoothRandom } from './noise.ts'
import type { Rng } from '../core/rng.ts'
import { clamp } from '../core/curves.ts'

/**
 * Feedback delay network, 8 lines with a Hadamard mixing matrix.
 *
 * Three things make it sound like a room rather than a metal box: the delay
 * lengths are mutually prime so their echoes never line up, each line is damped
 * so the tail darkens as it decays the way air and soft furnishings do, and the
 * lengths are slowly modulated so the standing modes never settle into a ring.
 * The modulation is the difference between "reverb" and "lush".
 */
const LINE_MS = [23.7, 31.1, 41.3, 53.9, 67.1, 79.3, 89.7, 101.9] as const
const N = 8
const HADAMARD_SCALE = 1 / Math.sqrt(N)

export class Reverb {
  private lines: DelayLine[] = []
  private delaySamples = new Float64Array(N)
  private dampState = new Float64Array(N)
  private lowCutState = new Float64Array(N)
  private mod: SmoothRandom[] = []
  private modDepth = new Float64Array(N)
  private v = new Float64Array(N)
  private preL: DelayLine
  private preR: DelayLine
  private preDelaySamples = 0
  private feedback = 0.85
  private dampCoef = 0.3
  private lowCutCoef = 0.02
  private sizeScale = 1
  private width = 1

  constructor(private readonly sampleRate: number, rng: Rng) {
    const maxLine = Math.ceil((LINE_MS[N - 1] * 2.2 * sampleRate) / 1000)
    for (let i = 0; i < N; i++) {
      this.lines.push(new DelayLine(maxLine))
      this.mod.push(new SmoothRandom(sampleRate, rng, 0.09 + i * 0.017))
      this.modDepth[i] = (sampleRate / 1000) * 1.6
    }
    this.preL = new DelayLine(Math.ceil(sampleRate * 0.25))
    this.preR = new DelayLine(Math.ceil(sampleRate * 0.25))
    this.set(0.7, 3, 0.4, 0.02, 1)
  }

  /**
   * @param size      0..1 — scales every line length, so the room grows.
   * @param decaySec  RT60 in seconds.
   * @param damping   0..1 — how fast the tail loses its top.
   * @param preDelay  seconds before the tail begins.
   * @param width     0..1 stereo spread of the taps.
   */
  set(size: number, decaySec: number, damping: number, preDelay: number, width: number): void {
    this.sizeScale = 0.45 + clamp(size, 0, 1) * 1.35
    const spr = this.sampleRate / 1000
    let mean = 0
    for (let i = 0; i < N; i++) {
      this.delaySamples[i] = LINE_MS[i] * this.sizeScale * spr
      mean += this.delaySamples[i]
    }
    mean /= N
    // Feedback that yields the requested RT60 for the average line length.
    const rt = Math.max(0.15, decaySec)
    this.feedback = Math.pow(10, (-3 * (mean / this.sampleRate)) / rt)
    this.feedback = clamp(this.feedback, 0, 0.999)
    // Damping as a one-pole coefficient: 0 keeps the tail bright, 1 swallows it.
    this.dampCoef = 0.05 + clamp(damping, 0, 1) * 0.85
    this.preDelaySamples = Math.max(1, preDelay * this.sampleRate)
    this.width = clamp(width, 0, 1)
  }

  /** Returns the wet signal only; the caller decides the mix. */
  process(inL: number, inR: number, out: [number, number]): void {
    this.preL.push(inL)
    this.preR.push(inR)
    const dl = this.preL.read(this.preDelaySamples)
    const dr = this.preR.read(this.preDelaySamples)

    const v = this.v
    for (let i = 0; i < N; i++) {
      const wobble = this.mod[i].process() * this.modDepth[i]
      v[i] = this.lines[i].read(this.delaySamples[i] + wobble)
    }

    let outL = 0
    let outR = 0
    for (let i = 0; i < N; i += 2) {
      outL += v[i]
      outR += v[i + 1]
    }
    outL *= 0.5
    outR *= 0.5
    // Narrowing folds the two halves together rather than attenuating one side.
    const mid = (outL + outR) * 0.5
    outL = mid + (outL - mid) * this.width
    outR = mid + (outR - mid) * this.width

    // Hadamard butterfly: every line feeds every other, which is what turns
    // eight echoes into a diffuse field instead of eight audible repeats.
    for (let step = 1; step < N; step *= 2) {
      for (let i = 0; i < N; i += step * 2) {
        for (let j = i; j < i + step; j++) {
          const a = v[j]
          const b = v[j + step]
          v[j] = a + b
          v[j + step] = a - b
        }
      }
    }

    for (let i = 0; i < N; i++) {
      let x = v[i] * HADAMARD_SCALE * this.feedback
      // Damp the top of the tail...
      this.dampState[i] += this.dampCoef * (x - this.dampState[i])
      x = this.dampState[i]
      // ...and bleed off the bottom, or the network slowly fills with rumble.
      this.lowCutState[i] += this.lowCutCoef * (x - this.lowCutState[i])
      x -= this.lowCutState[i]
      this.lines[i].push(x + (i % 2 === 0 ? dl : dr) * 0.5)
    }

    out[0] = outL
    out[1] = outR
  }

  clear(): void {
    for (let i = 0; i < N; i++) {
      this.lines[i].clear()
      this.dampState[i] = 0
      this.lowCutState[i] = 0
    }
    this.preL.clear()
    this.preR.clear()
  }
}
