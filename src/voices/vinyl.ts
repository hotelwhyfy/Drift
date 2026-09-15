import { Svf } from '../dsp/svf.ts'
import { Noise, SmoothRandom } from '../dsp/noise.ts'
import { Decay } from '../dsp/env.ts'
import { Phasor, sineFrom } from '../dsp/osc.ts'
import { clamp01, lerp } from '../core/curves.ts'
import type { Rng } from '../core/rng.ts'
import type { Stereo } from './types.ts'

export interface VinylParams {
  /** 0..1 — density of surface crackle. */
  crackle: number
  /** 0..1 — broadband surface hiss. */
  hiss: number
  /** 0..1 — mains hum, the sound of old equipment. */
  hum: number
  humHz: number
  level: number
}

const POPS = 6

/**
 * Record surface noise.
 *
 * The crackle is not filtered noise — it is discrete events. Real surface noise
 * is a sparse Poisson process of individual clicks, each ringing a slightly
 * different resonance, and the ear is very good at telling that apart from a
 * continuous hiss. Modelling the clicks individually is why this reads as a
 * record rather than as static.
 */
export class Vinyl {
  private hissNoise: Noise
  private popNoise: Noise
  private hissFilterL: Svf
  private hissFilterR: Svf
  private hissHpL: Svf
  private hissHpR: Svf
  private pops: Decay[] = []
  private popFilters: Svf[] = []
  private popPan: number[] = []
  private humPhase: Phasor
  private humPhase3: Phasor
  private wander: SmoothRandom
  private params: VinylParams

  constructor(private readonly sampleRate: number, private readonly rng: Rng) {
    this.hissNoise = new Noise(rng)
    this.popNoise = new Noise(rng)
    this.hissFilterL = new Svf(sampleRate)
    this.hissFilterR = new Svf(sampleRate)
    this.hissHpL = new Svf(sampleRate)
    this.hissHpR = new Svf(sampleRate)
    for (let i = 0; i < POPS; i++) {
      this.pops.push(new Decay(sampleRate))
      this.popFilters.push(new Svf(sampleRate))
      this.popPan.push(0)
    }
    this.humPhase = new Phasor(sampleRate)
    this.humPhase3 = new Phasor(sampleRate)
    this.wander = new SmoothRandom(sampleRate, rng, 0.13)
    this.params = { crackle: 0.4, hiss: 0.25, hum: 0.05, humHz: 50, level: 0.2 }
    this.hissFilterL.set(5200, 0.6)
    this.hissFilterR.set(5000, 0.6)
    this.hissHpL.set(700, 0.5)
    this.hissHpR.set(720, 0.5)
  }

  set(p: VinylParams): void {
    this.params = p
    this.humPhase.setHz(p.humHz)
    this.humPhase3.setHz(p.humHz * 3)
  }

  process(out: Stereo): void {
    const p = this.params
    let l = 0
    let r = 0

    if (p.hiss > 0.001) {
      // Band-limited: a record's noise floor has no deep bottom and rolls off
      // well before the top, unlike white noise.
      const nL = this.hissNoise.pink()
      const nR = this.hissNoise.pink()
      l += this.hissHpL.highpass(this.hissFilterL.lowpass(nL)) * p.hiss * 0.5
      r += this.hissHpR.highpass(this.hissFilterR.lowpass(nR)) * p.hiss * 0.5
    }

    if (p.crackle > 0.001) {
      // Density drifts, because a record is not uniformly worn.
      const density = clamp01(p.crackle) * (0.7 + this.wander.process() * 0.3)
      const rate = density * density * 900 // events per second
      if (this.rng() < rate / this.sampleRate) {
        for (let i = 0; i < POPS; i++) {
          if (!this.pops[i].active) {
            // Bigger pops are rarer, and ring lower and longer.
            const size = Math.pow(this.rng(), 2.6)
            this.pops[i].set(lerp(0.0012, 0.02, size))
            this.pops[i].trigger(lerp(0.25, 1, size))
            this.popFilters[i].set(lerp(6500, 900, size), lerp(1.4, 6, size))
            this.popPan[i] = (this.rng() - 0.5) * 1.4
            break
          }
        }
      }
      for (let i = 0; i < POPS; i++) {
        if (!this.pops[i].active) continue
        const s = this.popFilters[i].bandpass(this.popNoise.white()) * this.pops[i].process() * 1.6
        const pan = this.popPan[i]
        l += s * (0.5 - pan * 0.5)
        r += s * (0.5 + pan * 0.5)
      }
    }

    if (p.hum > 0.001) {
      const h = (sineFrom(this.humPhase.step()) + sineFrom(this.humPhase3.step()) * 0.22) * p.hum * 0.05
      l += h
      r += h
    }

    out[0] += l * p.level
    out[1] += r * p.level
  }
}
