import { Svf } from '../dsp/svf.ts'
import { Noise, SmoothRandom } from '../dsp/noise.ts'
import { Decay } from '../dsp/env.ts'
import { clamp01, lerp } from '../core/curves.ts'
import { sineFrom } from '../dsp/osc.ts'
import type { Rng } from '../core/rng.ts'
import type { Stereo } from './types.ts'

export type TextureKind = 'ocean' | 'air' | 'wind' | 'rain'

/** In the order the kind knob and the brightness rules walk them: dark to bright. */
export const TEXTURE_KINDS: readonly TextureKind[] = ['ocean', 'air', 'wind', 'rain']

export interface TextureParams {
  kind: TextureKind
  /** 0..1 — brightness of the bed. */
  tone: number
  /** 0..1 — how much the bed swells and recedes. */
  motion: number
  level: number
}

const DROPS = 10
/** Seconds for one kind of bed to become another. */
const CROSSFADE = 2.5

/**
 * Environmental beds, all built from filtered noise plus, for rain,
 * individual droplets.
 *
 * `air` is the most useful and the least obvious: a very quiet, slowly-shifting
 * resonant band that never announces itself. It reads as the room the music is
 * in, and its absence is far more noticeable than its presence.
 *
 * Each kind has its own filters, and changing kind crossfades between them
 * over a couple of seconds. A lane or a knob can move the kind mid-piece, and
 * a hard switch from ocean to rain is a click followed by a different room.
 */
export class Texture {
  private noise: Noise
  private rainL: Svf
  private rainR: Svf
  private hpL: Svf
  private hpR: Svf
  private oceanL: Svf
  private oceanR: Svf
  private airL: Svf
  private airR: Svf
  private windL: Svf
  private windR: Svf
  private swell: SmoothRandom
  private sweep: SmoothRandom
  private gust: SmoothRandom
  private washL: Svf
  private washR: Svf
  private drops: Decay[] = []
  private dropHz = new Float64Array(DROPS)
  private dropRise = new Float64Array(DROPS)
  private dropPhase = new Float64Array(DROPS)
  private dropPan = new Float64Array(DROPS)
  private params: TextureParams
  /** Current mix of each kind, easing towards 1 for the chosen one. */
  private mix = new Float64Array(TEXTURE_KINDS.length)
  private readonly fade: number

  constructor(private readonly sampleRate: number, private readonly rng: Rng) {
    this.noise = new Noise(rng)
    this.rainL = new Svf(sampleRate)
    this.rainR = new Svf(sampleRate)
    this.hpL = new Svf(sampleRate)
    this.hpR = new Svf(sampleRate)
    this.oceanL = new Svf(sampleRate)
    this.oceanR = new Svf(sampleRate)
    this.airL = new Svf(sampleRate)
    this.airR = new Svf(sampleRate)
    this.windL = new Svf(sampleRate)
    this.windR = new Svf(sampleRate)
    this.swell = new SmoothRandom(sampleRate, rng, 0.05)
    this.sweep = new SmoothRandom(sampleRate, rng, 0.033)
    this.gust = new SmoothRandom(sampleRate, rng, 0.11)
    this.washL = new Svf(sampleRate)
    this.washR = new Svf(sampleRate)
    for (let i = 0; i < DROPS; i++) this.drops.push(new Decay(sampleRate))
    this.params = { kind: 'air', tone: 0.5, motion: 0.5, level: 0.12 }
    this.mix[TEXTURE_KINDS.indexOf('air')] = 1
    this.fade = 1 - Math.exp(-1 / (CROSSFADE * 0.3 * sampleRate))
  }

  /** One raindrop landing: mostly tiny, occasionally not, either polarity. */
  private impact(): number {
    const a = Math.pow(this.rng(), 3)
    return this.rng() < 0.5 ? -a : a
  }

  set(p: TextureParams): void {
    this.params = p
  }

  process(out: Stereo): void {
    const p = this.params
    if (p.level < 0.0005) return
    const swell = 1 + this.swell.process() * p.motion * 0.55
    const sweep = this.sweep.process()
    const tone = clamp01(p.tone)
    let l = 0
    let r = 0

    for (let k = 0; k < TEXTURE_KINDS.length; k++) {
      const kind = TEXTURE_KINDS[k]
      const target = kind === p.kind ? 1 : 0
      const m = this.mix[k] + (target - this.mix[k]) * this.fade
      this.mix[k] = m < 1e-4 && target === 0 ? 0 : m
      if (this.mix[k] === 0) continue
      const g = this.mix[k]

      if (kind === 'rain') {
        // Rain is thousands of tiny impacts, not a hiss: a sheet of filtered
        // noise reads as static. Each channel gets its own patter so the sheet
        // is wide, and the tone opens both how often and how bright it lands.
        const patter = lerp(1400, 4200, tone) / this.sampleRate
        const pL = this.rng() < patter ? this.impact() : 0
        const pR = this.rng() < patter ? this.impact() : 0
        const cut = lerp(3000, 9000, tone)
        this.rainL.set(cut, 0.6)
        this.rainR.set(cut * 1.04, 0.6)
        this.hpL.set(900, 0.6)
        this.hpR.set(940, 0.6)
        l += this.hpL.highpass(this.rainL.lowpass(pL)) * 1.7 * g
        r += this.hpR.highpass(this.rainR.lowpass(pR)) * 1.7 * g
        // The rain further off: no detail left, only a soft low wash.
        const far = lerp(600, 1500, tone)
        this.washL.set(far, 0.5)
        this.washR.set(far * 1.06, 0.5)
        l += this.washL.lowpass(this.noise.pink()) * 0.34 * g
        r += this.washR.lowpass(this.noise.pink()) * 0.34 * g
        // A few drops land in water nearby. A drop rings as a small bubble
        // whose pitch rises as it closes, and that chirp is what makes it
        // water. A fixed resonance just pings like electronics.
        const rate = lerp(5, 22, tone)
        if (this.rng() < (rate * g) / this.sampleRate) {
          for (let i = 0; i < DROPS; i++) {
            if (!this.drops[i].active) {
              const seconds = lerp(0.008, 0.035, this.rng())
              this.drops[i].set(seconds)
              this.drops[i].trigger(0.15 + Math.pow(this.rng(), 2) * 0.85)
              this.dropHz[i] = lerp(1300, 4200, Math.pow(this.rng(), 1.5))
              this.dropRise[i] = Math.pow(lerp(1.5, 2.4, this.rng()), 1 / (seconds * this.sampleRate))
              this.dropPhase[i] = 0
              this.dropPan[i] = (this.rng() - 0.5) * 1.6
              break
            }
          }
        }
        for (let i = 0; i < DROPS; i++) {
          if (!this.drops[i].active) continue
          this.dropPhase[i] += this.dropHz[i] / this.sampleRate
          if (this.dropPhase[i] >= 1) this.dropPhase[i] -= 1
          this.dropHz[i] *= this.dropRise[i]
          const s = sineFrom(this.dropPhase[i]) * this.drops[i].process() * 0.25 * g
          l += s * (0.5 - this.dropPan[i] * 0.5)
          r += s * (0.5 + this.dropPan[i] * 0.5)
        }
      } else if (kind === 'ocean') {
        // Brown noise through a low band that opens and closes very slowly:
        // the shape of a wave rather than the sound of one.
        const cut = lerp(180, 900, tone) * (1 + sweep * 0.5)
        this.oceanL.set(cut, 0.8)
        this.oceanR.set(cut * 1.07, 0.8)
        const surge = 0.35 + Math.pow(clamp01(swell * 0.6), 1.6)
        l += this.oceanL.lowpass(this.noise.brown()) * surge * 0.6 * g
        r += this.oceanR.lowpass(this.noise.brown()) * surge * 0.6 * g
      } else if (kind === 'wind') {
        // A narrow resonance blown about by gusts: the whistle of air past an
        // edge, rising as it strengthens.
        const gust = clamp01(0.5 + this.gust.process() * (0.3 + p.motion * 0.5))
        const centre = lerp(300, 1400, tone) * Math.pow(2, gust * 1.3 + sweep * 0.3)
        this.windL.set(centre, 5)
        this.windR.set(centre * 1.12, 5)
        const force = 0.25 + gust * gust * 1.1
        l += this.windL.bandpass(this.noise.pink()) * force * 0.8 * g
        r += this.windR.bandpass(this.noise.pink()) * force * 0.8 * g
      } else {
        // air: a wide, quiet resonance drifting through the low mids.
        const centre = lerp(240, 1600, tone) * Math.pow(2, sweep * 0.55 * p.motion)
        this.airL.set(centre, 1.6)
        this.airR.set(centre * 1.09, 1.6)
        l += this.airL.bandpass(this.noise.pink()) * 0.9 * g
        r += this.airR.bandpass(this.noise.pink()) * 0.9 * g
      }
    }

    const g = p.level * swell
    out[0] += l * g
    out[1] += r * g
  }
}
