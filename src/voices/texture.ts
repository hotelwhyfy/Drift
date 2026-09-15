import { Svf } from '../dsp/svf.ts'
import { Noise, SmoothRandom } from '../dsp/noise.ts'
import { Decay } from '../dsp/env.ts'
import { clamp01, lerp } from '../core/curves.ts'
import type { Rng } from '../core/rng.ts'
import type { Stereo } from './types.ts'

export type TextureKind = 'rain' | 'air' | 'ocean'

export interface TextureParams {
  kind: TextureKind
  /** 0..1 — brightness of the bed. */
  tone: number
  /** 0..1 — how much the bed swells and recedes. */
  motion: number
  level: number
}

const DROPS = 10

/**
 * Environmental beds. Three kinds, all built from filtered noise plus, for
 * rain, individual droplets.
 *
 * `air` is the most useful and the least obvious: a very quiet, slowly-shifting
 * resonant band that never announces itself. It reads as the room the music is
 * in, and its absence is far more noticeable than its presence.
 */
export class Texture {
  private noise: Noise
  private dropNoise: Noise
  private bandL: Svf
  private bandR: Svf
  private hpL: Svf
  private hpR: Svf
  private swell: SmoothRandom
  private sweep: SmoothRandom
  private drops: Decay[] = []
  private dropFilters: Svf[] = []
  private dropPan: number[] = []
  private params: TextureParams

  constructor(private readonly sampleRate: number, private readonly rng: Rng) {
    this.noise = new Noise(rng)
    this.dropNoise = new Noise(rng)
    this.bandL = new Svf(sampleRate)
    this.bandR = new Svf(sampleRate)
    this.hpL = new Svf(sampleRate)
    this.hpR = new Svf(sampleRate)
    this.swell = new SmoothRandom(sampleRate, rng, 0.05)
    this.sweep = new SmoothRandom(sampleRate, rng, 0.033)
    for (let i = 0; i < DROPS; i++) {
      this.drops.push(new Decay(sampleRate))
      this.dropFilters.push(new Svf(sampleRate))
      this.dropPan.push(0)
    }
    this.params = { kind: 'air', tone: 0.5, motion: 0.5, level: 0.12 }
  }

  set(p: TextureParams): void {
    this.params = p
  }

  process(out: Stereo): void {
    const p = this.params
    if (p.level < 0.0005) return
    const swell = 1 + this.swell.process() * p.motion * 0.55
    const sweep = this.sweep.process()
    let l = 0
    let r = 0

    if (p.kind === 'rain') {
      const cut = lerp(2200, 7000, clamp01(p.tone))
      this.bandL.set(cut, 0.5)
      this.bandR.set(cut * 1.03, 0.5)
      this.hpL.set(600, 0.5)
      this.hpR.set(620, 0.5)
      l += this.hpL.highpass(this.bandL.lowpass(this.noise.white())) * 0.28
      r += this.hpR.highpass(this.bandR.lowpass(this.noise.white())) * 0.28
      // Individual drops over the bed — a sheet of noise alone reads as static.
      const rate = 40 + clamp01(p.tone) * 90
      if (this.rng() < rate / this.sampleRate) {
        for (let i = 0; i < DROPS; i++) {
          if (!this.drops[i].active) {
            this.drops[i].set(lerp(0.004, 0.03, this.rng()))
            this.drops[i].trigger(0.35 + this.rng() * 0.65)
            this.dropFilters[i].set(lerp(1800, 8000, this.rng()), lerp(3, 9, this.rng()))
            this.dropPan[i] = (this.rng() - 0.5) * 1.7
            break
          }
        }
      }
      for (let i = 0; i < DROPS; i++) {
        if (!this.drops[i].active) continue
        const s = this.dropFilters[i].bandpass(this.dropNoise.white()) * this.drops[i].process() * 0.7
        l += s * (0.5 - this.dropPan[i] * 0.5)
        r += s * (0.5 + this.dropPan[i] * 0.5)
      }
    } else if (p.kind === 'ocean') {
      // Brown noise through a low band that opens and closes very slowly: the
      // shape of a wave rather than the sound of one.
      const cut = lerp(180, 900, clamp01(p.tone)) * (1 + sweep * 0.5)
      this.bandL.set(cut, 0.8)
      this.bandR.set(cut * 1.07, 0.8)
      const surge = 0.35 + Math.pow(clamp01(swell * 0.6), 1.6)
      l += this.bandL.lowpass(this.noise.brown()) * surge * 0.6
      r += this.bandR.lowpass(this.noise.brown()) * surge * 0.6
    } else {
      // air: a wide, quiet resonance drifting through the low mids.
      const centre = lerp(240, 1600, clamp01(p.tone)) * Math.pow(2, sweep * 0.55 * p.motion)
      this.bandL.set(centre, 1.6)
      this.bandR.set(centre * 1.09, 1.6)
      l += this.bandL.bandpass(this.noise.pink()) * 0.9
      r += this.bandR.bandpass(this.noise.pink()) * 0.9
    }

    const g = p.level * swell
    out[0] += l * g
    out[1] += r * g
  }
}
