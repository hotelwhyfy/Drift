import { Svf } from '../dsp/svf.ts'
import { Noise, SmoothRandom } from '../dsp/noise.ts'
import { Decay } from '../dsp/env.ts'
import { Bubbles } from '../dsp/bubbles.ts'
import { panGains, clamp01, lerp } from '../core/curves.ts'
import type { Rng } from '../core/rng.ts'
import type { Stereo } from './types.ts'

export type FieldKind = 'rumble' | 'fire' | 'stream' | 'night'

/** In the order the kind knob and the brightness rules walk them: dark to bright. */
export const FIELD_KINDS: readonly FieldKind[] = ['rumble', 'fire', 'stream', 'night']

export interface FieldParams {
  kind: FieldKind
  /** 0..1 — brightness of the place. */
  tone: number
  /** 0..1 — how much happens: crackles, bubbles, crickets, rolls of thunder. */
  activity: number
  /** 0..1 — how much the whole place swells and recedes. */
  swell: number
  level: number
}

const CROSSFADE = 2.5
const CRICKETS = 4
const BUBBLES = 24
const TWO_PI = Math.PI * 2

/**
 * Places rather than weather: somewhere outside, at night, by a fire or a
 * stream, or with thunder a long way off.
 *
 * Where the bed is a continuous sheet, a field is mostly events — a crackle, a
 * bubble, a chirp — and `activity` is how many of them there are. Kinds
 * crossfade as the bed's do, so a lane can walk from the fire to the stream
 * without a click.
 */
export class Field {
  private noise: Noise
  private params: FieldParams
  private mix = new Float64Array(FIELD_KINDS.length)
  private readonly fade: number
  private swell: SmoothRandom
  private frame: Stereo = [0, 0]

  // rumble
  private rumbleL: Svf
  private rumbleR: Svf
  private roll: Decay
  private rollLevel = 0
  private readonly rollEase: number

  // fire
  private roarL: Svf
  private roarR: Svf
  private crackleL: Svf
  private crackleR: Svf
  private flicker: SmoothRandom
  private popsLeft = 0
  private popWait = 0
  private popPan = 0

  // stream
  private babbleL: Svf
  private babbleR: Svf
  private babbleHiL: Svf
  private babbleHiR: Svf
  private churn: SmoothRandom
  private churnHi: SmoothRandom
  private bubbles: Bubbles

  // night
  private floorL: Svf
  private floorR: Svf
  private cricketInc = new Float64Array(CRICKETS)
  private cricketPhase = new Float64Array(CRICKETS)
  /** Samples since the current chirp began. */
  private cricketAt = new Float64Array(CRICKETS)
  /** Samples from one chirp to the next. */
  private cricketPeriod = new Float64Array(CRICKETS)
  /** Samples per pulse within a chirp. */
  private cricketPulse = new Float64Array(CRICKETS)
  private cricketPulses = new Int32Array(CRICKETS)
  private cricketL = new Float64Array(CRICKETS)
  private cricketR = new Float64Array(CRICKETS)
  private cricketGain = new Float64Array(CRICKETS)

  constructor(private readonly sampleRate: number, private readonly rng: Rng) {
    this.noise = new Noise(rng)
    this.params = { kind: 'night', tone: 0.5, activity: 0.5, swell: 0.5, level: 0.12 }
    this.mix[FIELD_KINDS.indexOf('night')] = 1
    this.fade = 1 - Math.exp(-1 / (CROSSFADE * 0.3 * sampleRate))
    this.swell = new SmoothRandom(sampleRate, rng, 0.05)

    this.rumbleL = new Svf(sampleRate)
    this.rumbleR = new Svf(sampleRate)
    this.roll = new Decay(sampleRate)
    // A roll of thunder builds over a second or so; only its tail is long.
    this.rollEase = 1 - Math.exp(-1 / (0.9 * sampleRate))

    this.roarL = new Svf(sampleRate)
    this.roarR = new Svf(sampleRate)
    this.crackleL = new Svf(sampleRate)
    this.crackleR = new Svf(sampleRate)
    this.flicker = new SmoothRandom(sampleRate, rng, 2.5)

    this.babbleL = new Svf(sampleRate)
    this.babbleR = new Svf(sampleRate)
    this.babbleHiL = new Svf(sampleRate)
    this.babbleHiR = new Svf(sampleRate)
    this.churn = new SmoothRandom(sampleRate, rng, 3)
    this.churnHi = new SmoothRandom(sampleRate, rng, 4.5)
    this.bubbles = new Bubbles(sampleRate, rng, BUBBLES)

    this.floorL = new Svf(sampleRate)
    this.floorR = new Svf(sampleRate)
    for (let c = 0; c < CRICKETS; c++) {
      // Each its own species, more or less: its own pitch, pulse rate and
      // patience, and its own place in the dark.
      this.cricketInc[c] = lerp(3800, 5400, rng()) / sampleRate
      this.cricketPulse[c] = sampleRate / lerp(28, 60, rng())
      this.cricketPulses[c] = 3 + Math.floor(rng() * 3)
      this.cricketPeriod[c] = sampleRate * lerp(0.45, 1.2, rng())
      this.cricketAt[c] = Math.floor(rng() * this.cricketPeriod[c])
      const g = panGains((rng() - 0.5) * 1.7)
      this.cricketL[c] = g[0]
      this.cricketR[c] = g[1]
      // Some near, most further off.
      this.cricketGain[c] = lerp(0.25, 1, Math.pow(rng(), 2))
    }
  }

  set(p: FieldParams): void {
    this.params = p
  }

  process(out: Stereo): void {
    const p = this.params
    if (p.level < 0.0005) return
    const swell = 1 + this.swell.process() * p.swell * 0.55
    const tone = clamp01(p.tone)
    const activity = clamp01(p.activity)
    let l = 0
    let r = 0

    for (let k = 0; k < FIELD_KINDS.length; k++) {
      const kind = FIELD_KINDS[k]
      const target = kind === p.kind ? 1 : 0
      const m = this.mix[k] + (target - this.mix[k]) * this.fade
      this.mix[k] = m < 1e-4 && target === 0 ? 0 : m
      if (this.mix[k] === 0) continue
      const g = this.mix[k]

      if (kind === 'rumble') {
        // Weight a long way off: the low end of a storm or a city, with
        // nothing above it. Now and then a roll comes through, slowly.
        const cut = lerp(60, 150, tone)
        this.rumbleL.set(cut, 0.7)
        this.rumbleR.set(cut * 1.08, 0.7)
        if (this.rng() < lerp(1 / 40, 1 / 9, activity) / this.sampleRate) {
          this.roll.set(lerp(5, 12, this.rng()))
          this.roll.trigger(lerp(0.5, 1, this.rng()))
        }
        this.rollLevel += (this.roll.process() - this.rollLevel) * this.rollEase
        const body = (0.55 + this.rollLevel * 1.8) * 0.55 * g
        l += this.rumbleL.lowpass(this.noise.brown()) * body
        r += this.rumbleR.lowpass(this.noise.brown()) * body
      } else if (kind === 'fire') {
        // A fire is a soft roar underneath and wood giving way on top. The
        // roar flickers; the crackles are single clicks, and a pop is a few
        // in quick succession, the way a pocket of sap goes.
        const flicker = 0.65 + this.flicker.process() * 0.35
        const roar = lerp(220, 520, tone)
        this.roarL.set(roar, 0.6)
        this.roarR.set(roar * 1.06, 0.6)
        l += this.roarL.lowpass(this.noise.brown()) * flicker * 0.35 * g
        r += this.roarR.lowpass(this.noise.brown()) * flicker * 0.35 * g

        const crackle = lerp(4, 45, activity) / this.sampleRate
        let cL = this.rng() < crackle ? this.crack() : 0
        let cR = this.rng() < crackle ? this.crack() : 0
        if (this.popsLeft === 0 && this.rng() < lerp(0.08, 0.7, activity) / this.sampleRate) {
          this.popsLeft = 3 + Math.floor(this.rng() * 4)
          this.popWait = 0
          this.popPan = this.rng()
        }
        if (this.popsLeft > 0 && this.popWait-- <= 0) {
          const pop = this.crack() * 1.6
          cL += pop * (1 - this.popPan)
          cR += pop * this.popPan
          this.popsLeft--
          this.popWait = Math.floor(this.sampleRate * lerp(0.003, 0.03, this.rng()))
        }
        const hp = lerp(1200, 3500, tone)
        this.crackleL.set(hp, 0.8)
        this.crackleR.set(hp * 1.05, 0.8)
        l += this.crackleL.highpass(cL) * 1.5 * g
        r += this.crackleR.highpass(cR) * 1.5 * g
      } else if (kind === 'stream') {
        // Running water: two churning bands of noise for the body of it,
        // and on top the bubbles that make it water rather than wind.
        const centre = lerp(450, 1100, tone) * Math.pow(2, this.churn.process() * 0.7)
        this.babbleL.set(centre, 1.4)
        this.babbleR.set(centre * 1.1, 1.4)
        const hi = lerp(1600, 3400, tone) * Math.pow(2, this.churnHi.process() * 0.6)
        this.babbleHiL.set(hi, 2)
        this.babbleHiR.set(hi * 0.93, 2)
        l += (this.babbleL.bandpass(this.noise.pink()) * 0.55 + this.babbleHiL.bandpass(this.noise.pink()) * 0.2) * g
        r += (this.babbleR.bandpass(this.noise.pink()) * 0.55 + this.babbleHiR.bandpass(this.noise.pink()) * 0.2) * g
        if (this.rng() < (lerp(25, 140, activity) * g) / this.sampleRate) {
          this.bubbles.spawn(lerp(400, 700, tone), lerp(1300, 2200, tone), 0.01, 0.045, 1.4)
        }
        const frame = this.frame
        frame[0] = 0
        frame[1] = 0
        this.bubbles.process(frame, 0.12 * g)
        l += frame[0]
        r += frame[1]
      } else {
        // night: a still, dark floor of air and the crickets in it. Each
        // chirp is a few pulses of one high tone, shaped smoothly so a pulse
        // is a chirp and not a click.
        const floor = lerp(250, 700, tone)
        this.floorL.set(floor, 0.6)
        this.floorR.set(floor * 1.07, 0.6)
        l += this.floorL.lowpass(this.noise.pink()) * 0.6 * g
        r += this.floorR.lowpass(this.noise.pink()) * 0.6 * g
        // Activity decides how many are singing; the rest wait their turn.
        const singing = 1 + activity * (CRICKETS - 1)
        for (let c = 0; c < CRICKETS; c++) {
          const voice = clamp01(singing - c)
          let at = this.cricketAt[c] + 1
          if (at >= this.cricketPeriod[c]) {
            at = 0
            // A cricket's timing wanders a little chirp to chirp.
            this.cricketPeriod[c] *= lerp(0.94, 1.06, this.rng())
            if (this.cricketPeriod[c] < this.sampleRate * 0.35) this.cricketPeriod[c] = this.sampleRate * 0.35
            if (this.cricketPeriod[c] > this.sampleRate * 1.4) this.cricketPeriod[c] = this.sampleRate * 1.4
          }
          this.cricketAt[c] = at
          let ph = this.cricketPhase[c] + this.cricketInc[c]
          if (ph >= 1) ph -= 1
          this.cricketPhase[c] = ph
          if (voice === 0) continue
          const pulse = at / this.cricketPulse[c]
          const n = Math.floor(pulse)
          if (n >= this.cricketPulses[c]) continue
          const frac = (pulse - n) / 0.6
          if (frac >= 1) continue
          const shape = Math.sin(frac * Math.PI)
          const s = Math.sin(ph * TWO_PI) * shape * shape * this.cricketGain[c] * voice * 0.14 * g
          l += s * this.cricketL[c]
          r += s * this.cricketR[c]
        }
      }
    }

    const level = p.level * swell
    out[0] += l * level
    out[1] += r * level
  }

  /** One crack of wood: mostly small, occasionally sharp, either polarity. */
  private crack(): number {
    const a = Math.pow(this.rng(), 2.5)
    return this.rng() < 0.5 ? -a : a
  }
}
