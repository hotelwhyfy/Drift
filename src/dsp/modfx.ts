import { DelayLine } from './delay.ts'
import { Lfo } from './osc.ts'
import { Svf } from './svf.ts'
import type { Rng } from '../core/rng.ts'
import { clamp01 } from '../core/curves.ts'

/**
 * Three-tap chorus. Its real job here is not the 80s effect but stereo width:
 * a mono pad through slightly different delays on each side stops sounding like
 * a point source and starts sounding like something occupying a space.
 */
export class Chorus {
  private line: DelayLine
  private lfos: Lfo[]
  private base: number
  private depth = 0
  private mix = 0

  constructor(private readonly sampleRate: number, rng: Rng) {
    this.base = sampleRate * 0.014
    this.line = new DelayLine(Math.ceil(sampleRate * 0.06))
    this.lfos = [
      new Lfo(sampleRate, 0.19, rng()),
      new Lfo(sampleRate, 0.27, rng()),
      new Lfo(sampleRate, 0.11, rng()),
    ]
  }

  set(depth: number, mix: number, rateScale = 1): void {
    this.depth = clamp01(depth) * this.sampleRate * 0.006
    this.mix = clamp01(mix)
    this.lfos[0].setHz(0.19 * rateScale)
    this.lfos[1].setHz(0.27 * rateScale)
    this.lfos[2].setHz(0.11 * rateScale)
  }

  process(x: number, out: [number, number]): void {
    this.line.push(x)
    const a = this.line.read(this.base + this.lfos[0].process() * this.depth)
    const b = this.line.read(this.base * 1.4 + this.lfos[1].process() * this.depth)
    const c = this.line.read(this.base * 0.7 + this.lfos[2].process() * this.depth)
    const wetL = (a + c) * 0.5
    const wetR = (b + c) * 0.5
    out[0] = x * (1 - this.mix) + wetL * this.mix
    out[1] = x * (1 - this.mix) + wetR * this.mix
  }
}

/**
 * Filtered ping-pong echo. Each repeat is darker than the last, so a long
 * feedback setting dissolves into the reverb instead of piling up as clutter.
 */
export class PingPong {
  private left: DelayLine
  private right: DelayLine
  private filterL: Svf
  private filterR: Svf
  private timeL = 0
  private timeR = 0
  private feedback = 0
  private fbL = 0
  private fbR = 0

  constructor(private readonly sampleRate: number) {
    const max = Math.ceil(sampleRate * 4)
    this.left = new DelayLine(max)
    this.right = new DelayLine(max)
    this.filterL = new Svf(sampleRate)
    this.filterR = new Svf(sampleRate)
    this.set(0.4, 0.5, 0.35, 2600)
  }

  /** `time` in seconds; the right side runs at 1.5x for a dotted feel. */
  set(time: number, feedback: number, _mix: number, toneHz: number): void {
    this.timeL = Math.max(1, time * this.sampleRate)
    this.timeR = Math.max(1, time * 1.5 * this.sampleRate)
    this.feedback = clamp01(feedback) * 0.86
    this.filterL.set(toneHz, 0.6)
    this.filterR.set(toneHz, 0.6)
  }

  /** Returns the wet signal only. */
  process(inL: number, inR: number, out: [number, number]): void {
    const dl = this.left.read(this.timeL)
    const dr = this.right.read(this.timeR)
    this.fbL = this.filterL.lowpass(dr)
    this.fbR = this.filterR.lowpass(dl)
    this.left.push(inL + this.fbL * this.feedback)
    this.right.push(inR + this.fbR * this.feedback)
    out[0] = dl
    out[1] = dr
  }

  clear(): void {
    this.left.clear()
    this.right.clear()
  }
}

/**
 * Envelope follower driving a downward gain — the sidechain duck.
 *
 * Ducking the pads and keys against the kick is the single most recognisable
 * production move in this genre. It is also what keeps a dense patch legible:
 * the low end gets out of the way on every beat, so a thick bed and a soft kick
 * can occupy the same octave without turning to mud.
 */
export class Ducker {
  private env = 0
  private attackCoef: number
  private releaseCoef = 0
  private amount = 0

  constructor(private readonly sampleRate: number) {
    this.attackCoef = Math.exp(-1 / (0.002 * sampleRate))
    this.setRelease(0.22)
  }

  setRelease(seconds: number): void {
    this.releaseCoef = Math.exp(-1 / (Math.max(0.01, seconds) * this.sampleRate))
  }

  setAmount(amount: number): void {
    this.amount = clamp01(amount)
  }

  /** Feed the trigger (the kick), get back a gain to apply elsewhere. */
  trigger(level: number): void {
    if (level > this.env) this.env = level
  }

  process(): number {
    this.env *= this.env > 0.0001 ? this.releaseCoef : 0
    return 1 - this.env * this.amount
  }

  get attack(): number {
    return this.attackCoef
  }
}
