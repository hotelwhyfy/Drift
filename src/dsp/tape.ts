import { DelayLine } from './delay.ts'
import { SmoothRandom } from './noise.ts'
import { Lfo } from './osc.ts'
import { DcBlock } from './svf.ts'
import type { Rng } from '../core/rng.ts'
import { clamp01 } from '../core/curves.ts'

/**
 * Wow and flutter — a delay line whose length wanders.
 *
 * Wow is the slow drift of a warped record (fractions of a Hz); flutter is the
 * faster unevenness of a tape transport (5-12 Hz). Both are needed: wow alone
 * sounds seasick, flutter alone sounds like a broken sample player. The random
 * component matters more than the periodic one — real transports are not LFOs.
 */
export class WowFlutter {
  private line: DelayLine
  private wow: SmoothRandom
  private flutterLfo: Lfo
  private flutterRand: SmoothRandom
  private base: number
  private wowDepth = 0
  private flutterDepth = 0

  constructor(private readonly sampleRate: number, rng: Rng) {
    this.base = sampleRate * 0.012
    this.line = new DelayLine(Math.ceil(sampleRate * 0.06))
    this.wow = new SmoothRandom(sampleRate, rng, 0.6)
    this.flutterLfo = new Lfo(sampleRate, 8.3, rng())
    this.flutterRand = new SmoothRandom(sampleRate, rng, 11)
  }

  /** Both amounts 0..1. */
  set(wowAmount: number, flutterAmount: number): void {
    this.wowDepth = clamp01(wowAmount) * this.sampleRate * 0.0042
    this.flutterDepth = clamp01(flutterAmount) * this.sampleRate * 0.00035
  }

  process(x: number): number {
    const w = this.wow.process() * this.wowDepth
    const f = (this.flutterLfo.process() * 0.6 + this.flutterRand.process() * 0.4) * this.flutterDepth
    this.line.push(x)
    return this.line.read(this.base + w + f)
  }
}

/**
 * Tape-style saturation. Asymmetric on purpose: a symmetric transfer curve
 * generates only odd harmonics, which reads as fuzz. Adding a little second
 * harmonic is what people actually mean by "warm".
 */
export class Saturator {
  private dc = new DcBlock()
  private drive = 1
  private makeup = 1
  private asymmetry = 0.12

  set(drive: number, asymmetry = 0.12): void {
    this.drive = Math.max(0.01, drive)
    this.asymmetry = asymmetry
    // Compensate so raising drive changes tone, not level.
    this.makeup = 1 / Math.tanh(this.drive * 0.85 + 0.15)
  }

  process(x: number): number {
    const d = x * this.drive
    const shaped = Math.tanh(d + this.asymmetry * d * d)
    return this.dc.process(shaped * this.makeup * 0.85)
  }
}

/**
 * Lookahead peak limiter on the master. Not a sound-design device — it is the
 * safety net that lets the macros be swept freely without the output ever
 * clipping, which is a precondition for "every position sounds good".
 */
export class Limiter {
  private lineL: DelayLine
  private lineR: DelayLine
  private lookahead: number
  private gain = 1
  private releaseCoef: number
  private ceiling = 0.891 // -1 dBFS

  constructor(sampleRate: number) {
    this.lookahead = Math.max(4, Math.floor(sampleRate * 0.004))
    this.lineL = new DelayLine(this.lookahead + 8)
    this.lineR = new DelayLine(this.lookahead + 8)
    this.releaseCoef = Math.exp(-1 / (0.18 * sampleRate))
  }

  process(l: number, r: number, out: [number, number]): void {
    const peak = Math.max(Math.abs(l), Math.abs(r))
    const target = peak > this.ceiling ? this.ceiling / peak : 1
    // The detector reads the signal `lookahead` samples before the output does,
    // so the attack can be instantaneous: the gain is already down by the time
    // the peak emerges, and the drop happens 4 ms early where nothing hears it.
    // A smoothed attack would lag the peak and let it through, which is the one
    // failure mode a safety limiter must not have.
    if (target < this.gain) this.gain = target
    else this.gain = target + this.releaseCoef * (this.gain - target)

    this.lineL.push(l)
    this.lineR.push(r)
    const outL = this.lineL.read(this.lookahead) * this.gain
    const outR = this.lineR.read(this.lookahead) * this.gain
    // Backstop. Interpolated reads can land a hair above the sample the
    // detector saw, so the ceiling is enforced rather than merely aimed at.
    out[0] = outL > this.ceiling ? this.ceiling : outL < -this.ceiling ? -this.ceiling : outL
    out[1] = outR > this.ceiling ? this.ceiling : outR < -this.ceiling ? -this.ceiling : outR
  }
}
