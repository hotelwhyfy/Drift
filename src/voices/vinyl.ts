import { Svf } from '../dsp/svf.ts'
import { Noise, SmoothRandom } from '../dsp/noise.ts'
import { Phasor, sineFrom } from '../dsp/osc.ts'
import { clamp01 } from '../core/curves.ts'
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

/** Clicks per second at full density. Most of them are tiny. */
const MAX_RATE = 140
/** Seconds per turn of a 33⅓ record. */
const REVOLUTION = 1.8

/**
 * Record surface noise.
 *
 * A click is a stylus hitting a speck of dust: an impulse a sample or two
 * wide, not a burst of noise. Every click then goes through the same
 * cartridge — one highpass and one lowpass per channel — so they come out
 * as dry ticks with no pitch. Giving each click its own resonance is what
 * rain sounds like, and it was the mistake here before.
 *
 * Sizes are heavy-tailed: nearly every click is faint and a few are loud,
 * and only those few get a low thump underneath. One scratch comes round
 * once per revolution, which more than anything is what makes it a record.
 */
export class Vinyl {
  private hissNoiseL: Noise
  private hissNoiseR: Noise
  private hissHpL: Svf
  private hissHpR: Svf
  private hissLpL: Svf
  private hissLpR: Svf
  private clickHpL: Svf
  private clickHpR: Svf
  private clickLpL: Svf
  private clickLpR: Svf
  private thumpL: Svf
  private thumpR: Svf
  private humPhase: Phasor
  private humPhase3: Phasor
  private wander: SmoothRandom
  private params: VinylParams
  /** The click being written: its value and how many more samples it lasts. */
  private clickValue = 0
  private clickPan = 0
  private clickThump = 0
  private clickLeft = 0
  private revolution = 0
  private readonly revolutionInc: number
  /** Where on the turn the scratch sits, and which way it faces. */
  private readonly scratchAt: number
  private readonly scratchSign: number

  constructor(private readonly sampleRate: number, private readonly rng: Rng) {
    this.hissNoiseL = new Noise(rng)
    this.hissNoiseR = new Noise(rng)
    this.hissHpL = new Svf(sampleRate)
    this.hissHpR = new Svf(sampleRate)
    this.hissLpL = new Svf(sampleRate)
    this.hissLpR = new Svf(sampleRate)
    this.clickHpL = new Svf(sampleRate)
    this.clickHpR = new Svf(sampleRate)
    this.clickLpL = new Svf(sampleRate)
    this.clickLpR = new Svf(sampleRate)
    this.thumpL = new Svf(sampleRate)
    this.thumpR = new Svf(sampleRate)
    this.humPhase = new Phasor(sampleRate)
    this.humPhase3 = new Phasor(sampleRate)
    this.wander = new SmoothRandom(sampleRate, rng, 0.13)
    this.params = { crackle: 0.4, hiss: 0.25, hum: 0.05, humHz: 50, level: 0.2 }
    this.hissHpL.set(1300, 0.5)
    this.hissHpR.set(1350, 0.5)
    this.hissLpL.set(9000, 0.5)
    this.hissLpR.set(8700, 0.5)
    this.clickHpL.set(700, 0.6)
    this.clickHpR.set(720, 0.6)
    this.clickLpL.set(7500, 0.6)
    this.clickLpR.set(7200, 0.6)
    this.thumpL.set(260, 0.7)
    this.thumpR.set(250, 0.7)
    this.revolutionInc = 1 / (REVOLUTION * sampleRate)
    this.scratchAt = rng()
    this.scratchSign = rng() < 0.5 ? -1 : 1
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

    // The turn advances whatever is audible, so the scratch keeps its place.
    const before = this.revolution
    this.revolution += this.revolutionInc
    if (this.revolution >= 1) this.revolution -= 1
    // Surface noise swells a little once per turn: records are never flat.
    const turn = 1 + 0.12 * sineFrom(this.revolution)

    if (p.hiss > 0.001) {
      const hL = this.hissLpL.lowpass(this.hissHpL.highpass(this.hissNoiseL.pink()))
      const hR = this.hissLpR.lowpass(this.hissHpR.highpass(this.hissNoiseR.pink()))
      l += hL * p.hiss * 0.62 * turn
      r += hR * p.hiss * 0.62 * turn
    }

    let clickL = 0
    let clickR = 0
    let thump = 0
    if (p.crackle > 0.001) {
      const crackle = clamp01(p.crackle)
      if (this.clickLeft === 0) {
        // Density drifts, because a record is not uniformly worn.
        const density = crackle * (0.75 + this.wander.process() * 0.25)
        const rate = density * density * MAX_RATE * turn
        const passed = before < this.scratchAt && this.revolution >= this.scratchAt
        if (passed && crackle > 0.35) {
          this.startClick(this.scratchSign * clamp01((crackle - 0.35) * 1.6) * 0.8, 3, 0.1, 0.5)
        } else if (this.rng() < rate / this.sampleRate) {
          const size = Math.pow(this.rng(), 5)
          const sign = this.rng() < 0.5 ? -1 : 1
          const width = 1 + Math.floor(size * 3)
          const body = size > 0.35 ? (size - 0.35) * 1.5 : 0
          this.startClick(sign * (0.08 + size * 0.92), width, (this.rng() - 0.5) * 1.5, body)
        }
      } else {
        this.wander.process()
      }
      if (this.clickLeft > 0) {
        const v = this.clickValue
        clickL = v * (1 - this.clickPan)
        clickR = v * (1 + this.clickPan)
        thump = v * this.clickThump
        this.clickLeft--
      }
    }
    // The cartridge filters run every sample so their tails finish naturally.
    l += this.clickLpL.lowpass(this.clickHpL.highpass(clickL)) * 1.5
    r += this.clickLpR.lowpass(this.clickHpR.highpass(clickR)) * 1.5
    l += this.thumpL.lowpass(thump) * 2
    r += this.thumpR.lowpass(thump) * 2

    if (p.hum > 0.001) {
      const h = (sineFrom(this.humPhase.step()) + sineFrom(this.humPhase3.step()) * 0.22) * p.hum * 0.05
      l += h
      r += h
    }

    out[0] += l * p.level
    out[1] += r * p.level
  }

  private startClick(value: number, width: number, pan: number, body: number): void {
    this.clickValue = value
    this.clickLeft = width
    this.clickPan = pan * 0.8
    this.clickThump = body
  }
}
