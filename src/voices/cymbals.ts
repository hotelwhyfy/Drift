import { Decay } from '../dsp/env.ts'
import { Svf } from '../dsp/svf.ts'
import { Noise } from '../dsp/noise.ts'
import { Metal } from '../dsp/metal.ts'
import { clamp, clamp01, lerp } from '../core/curves.ts'
import type { Rng } from '../core/rng.ts'
import type { Stereo } from './types.ts'
import type { DrumHit } from './drums.ts'

export interface CymbalsParams {
  /** Bandpass centre at the top of a gesture, Hz. */
  tone: number
  /** 0..1 — metal partials against noise. */
  metal: number
  /** Lowest metal partial, Hz. */
  pitch: number
  /** Exponent of the rise: 1 is a straight ramp, 4 hangs back and rushes in. */
  curve: number
  /** Seconds the cymbal rings after a gesture lands. */
  tail: number
  width: number
  level: number
}

/** Filter coefficients move at this many samples; the sweep is slow. */
const SWEEP_EVERY = 32

/**
 * One swell or roll, from its first sample to the end of its ring. Each owns
 * its filters so two overlapping gestures never share state, and L and R have
 * their own pair with their own noise, which is where the width comes from.
 */
class Gesture {
  private metal: Metal
  private noise: Noise
  private hpL: Svf
  private hpR: Svf
  private bpL: Svf
  private bpR: Svf
  private strike: Decay
  private ring: Decay
  private kind: 'swell' | 'roll' = 'swell'
  private elapsed = 0
  private length = 1
  private velocity = 0
  private nextStrike = 0
  private landed = true
  private t = 0

  constructor(private readonly sampleRate: number, private readonly rng: Rng) {
    this.metal = new Metal(sampleRate, [rng(), rng(), rng(), rng(), rng(), rng()])
    this.noise = new Noise(rng)
    this.hpL = new Svf(sampleRate)
    this.hpR = new Svf(sampleRate)
    this.bpL = new Svf(sampleRate)
    this.bpR = new Svf(sampleRate)
    this.strike = new Decay(sampleRate)
    this.ring = new Decay(sampleRate)
  }

  get active(): boolean {
    return !this.landed || this.ring.active
  }

  /** How far through its rise, 0..1; a ringing gesture counts as finished. */
  get progress(): number {
    return this.landed ? 1 : this.t
  }

  start(kind: 'swell' | 'roll', velocity: number, durationSec: number, p: CymbalsParams): void {
    this.kind = kind
    this.velocity = velocity
    this.length = Math.max(1, Math.round(durationSec * this.sampleRate))
    this.elapsed = 0
    this.t = 0
    this.landed = false
    this.nextStrike = 0
    this.ring.trigger(0)
    this.metal.setHz(p.pitch)
    this.strike.set(0.07)
    this.sweep(p)
  }

  private sweep(p: CymbalsParams): void {
    // A swell opens as it rises — the reversed recording's top end arrives
    // last. A roll is struck with soft mallets, so it sits lower throughout.
    const centre = this.kind === 'swell'
      ? p.tone * lerp(0.3, 1, this.t)
      : p.tone * lerp(0.4, 0.7, this.t)
    const hp = clamp(centre * 0.45, 400, 9000)
    this.hpL.set(hp, 0.7)
    this.hpR.copyCoefficients(this.hpL)
    this.bpL.set(centre, 0.9)
    this.bpR.copyCoefficients(this.bpL)
  }

  process(out: Stereo, p: CymbalsParams): void {
    if (!this.active) return
    let env: number
    if (!this.landed) {
      this.t = this.elapsed / this.length
      const rise = Math.pow(this.t, p.curve)
      if (this.kind === 'swell') {
        env = rise
      } else {
        // Strikes come faster as the roll builds, each a little uneven.
        if (this.elapsed >= this.nextStrike) {
          const rate = lerp(9, 15, this.t)
          this.nextStrike = this.elapsed + (this.sampleRate / rate) * lerp(0.8, 1.2, this.rng())
          this.strike.trigger(lerp(0.7, 1, this.rng()))
        }
        env = lerp(0.04, 1, rise) * (0.35 + 0.65 * this.strike.process())
      }
      if (this.elapsed % SWEEP_EVERY === 0) this.sweep(p)
      this.elapsed++
      if (this.elapsed >= this.length) {
        // The landing: the gesture lets go and the plate rings on, longer
        // after a roll, whose last strike is a real one.
        this.landed = true
        this.ring.set(this.kind === 'swell' ? p.tail * 0.8 : p.tail)
        this.ring.trigger(1)
      }
    } else {
      env = this.ring.process()
    }

    const metal = this.metal.process() * clamp01(p.metal)
    const noise = 1 - clamp01(p.metal) * 0.6
    const l = this.bpL.bandpass(this.hpL.highpass(metal + this.noise.white() * noise))
    const r = this.bpR.bandpass(this.hpR.highpass(metal + this.noise.white() * noise))
    const g = env * this.velocity
    const mid = (l + r) * 0.5
    out[0] += lerp(mid, l, p.width) * g
    out[1] += lerp(mid, r, p.width) * g
  }
}

/**
 * Cymbal gestures rather than cymbal hits: reversed swells and mallet rolls,
 * each lasting as long as the rack says and ringing out when it lands. The
 * timing is the pattern's business; the voice only builds and lets go.
 */
export class Cymbals {
  private gestures: Gesture[] = []
  private params: CymbalsParams = {
    tone: 6000, metal: 0.4, pitch: 420, curve: 2.5, tail: 2.5, width: 0.7, level: 0.5,
  }
  private acc: Stereo = [0, 0]

  constructor(sampleRate: number, rng: Rng, polyphony = 4) {
    for (let i = 0; i < polyphony; i++) this.gestures.push(new Gesture(sampleRate, rng))
  }

  set(p: CymbalsParams): void {
    this.params = p
  }

  hit(kind: DrumHit, velocity: number, durationSec: number): void {
    if (kind !== 'swell' && kind !== 'roll') return
    this.steal().start(kind, velocity, Math.max(0.25, durationSec), this.params)
  }

  private steal(): Gesture {
    for (let i = 0; i < this.gestures.length; i++) {
      if (!this.gestures[i].active) return this.gestures[i]
    }
    // All busy: the one furthest along has the least left to say.
    let best = this.gestures[0]
    for (let i = 1; i < this.gestures.length; i++) {
      if (this.gestures[i].progress > best.progress) best = this.gestures[i]
    }
    return best
  }

  process(out: Stereo): void {
    const acc = this.acc
    acc[0] = 0
    acc[1] = 0
    for (let i = 0; i < this.gestures.length; i++) this.gestures[i].process(acc, this.params)
    out[0] += acc[0] * this.params.level
    out[1] += acc[1] * this.params.level
  }
}
