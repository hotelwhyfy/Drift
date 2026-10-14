import { Decay } from './env.ts'
import { sineFrom } from './osc.ts'
import { lerp } from '../core/curves.ts'
import type { Rng } from '../core/rng.ts'
import type { Stereo } from '../voices/types.ts'

/**
 * A pool of small bubbles in water. A bubble rings as a short sine whose pitch
 * rises as it closes, and that chirp is what makes it read as water — a fixed
 * resonance just pings like electronics.
 *
 * Rain uses a few of them for drops landing nearby; a stream is made of
 * hundreds a second.
 */
export class Bubbles {
  private env: Decay[] = []
  private hz: Float64Array
  private rise: Float64Array
  private phase: Float64Array
  private pan: Float64Array

  constructor(private readonly sampleRate: number, private readonly rng: Rng, count: number) {
    for (let i = 0; i < count; i++) this.env.push(new Decay(sampleRate))
    this.hz = new Float64Array(count)
    this.rise = new Float64Array(count)
    this.phase = new Float64Array(count)
    this.pan = new Float64Array(count)
  }

  /**
   * Start one bubble in a free slot, if there is one. Pitches lean towards the
   * low end of the range: big bubbles are rarer than small ones, but a range
   * full of high chirps sounds like birds.
   */
  spawn(loHz: number, hiHz: number, minSec: number, maxSec: number, spread: number): void {
    for (let i = 0; i < this.env.length; i++) {
      if (this.env[i].active) continue
      const seconds = lerp(minSec, maxSec, this.rng())
      this.env[i].set(seconds)
      this.env[i].trigger(0.15 + Math.pow(this.rng(), 2) * 0.85)
      this.hz[i] = lerp(loHz, hiHz, Math.pow(this.rng(), 1.5))
      this.rise[i] = Math.pow(lerp(1.5, 2.4, this.rng()), 1 / (seconds * this.sampleRate))
      this.phase[i] = 0
      this.pan[i] = (this.rng() - 0.5) * spread
      return
    }
  }

  /** Adds every sounding bubble into `out`, scaled by `gain`. */
  process(out: Stereo, gain: number): void {
    for (let i = 0; i < this.env.length; i++) {
      if (!this.env[i].active) continue
      this.phase[i] += this.hz[i] / this.sampleRate
      if (this.phase[i] >= 1) this.phase[i] -= 1
      this.hz[i] *= this.rise[i]
      const s = sineFrom(this.phase[i]) * this.env[i].process() * gain
      out[0] += s * (0.5 - this.pan[i] * 0.5)
      out[1] += s * (0.5 + this.pan[i] * 0.5)
    }
  }
}
