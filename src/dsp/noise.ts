import type { Rng } from '../core/rng.ts'

/**
 * Noise colours. Pink and brown are the useful ones: white noise reads as hiss
 * and fatigues quickly, whereas pink sits under music the way room tone does.
 */
export class Noise {
  private b0 = 0
  private b1 = 0
  private b2 = 0
  private b3 = 0
  private b4 = 0
  private b5 = 0
  private b6 = 0
  private brownState = 0

  constructor(private readonly rng: Rng) {}

  white(): number {
    return this.rng() * 2 - 1
  }

  /** Paul Kellet's economy pink filter. */
  pink(): number {
    const w = this.white()
    this.b0 = 0.99886 * this.b0 + w * 0.0555179
    this.b1 = 0.99332 * this.b1 + w * 0.0750759
    this.b2 = 0.969 * this.b2 + w * 0.153852
    this.b3 = 0.8665 * this.b3 + w * 0.3104856
    this.b4 = 0.55 * this.b4 + w * 0.5329522
    this.b5 = -0.7616 * this.b5 - w * 0.016898
    const out = this.b0 + this.b1 + this.b2 + this.b3 + this.b4 + this.b5 + this.b6 + w * 0.5362
    this.b6 = w * 0.115926
    return out * 0.11
  }

  brown(): number {
    this.brownState = (this.brownState + this.white() * 0.02) * 0.998
    return this.brownState * 3.5
  }
}

/**
 * Smoothly-varying random control signal — a random walk between targets,
 * interpolated. This is what makes wow, flutter and "drift" sound organic
 * rather than like an LFO.
 */
export class SmoothRandom {
  private from = 0
  private to = 0
  private pos = 1
  private inc = 0

  constructor(private readonly sampleRate: number, private readonly rng: Rng, hz = 1) {
    this.setHz(hz)
    this.from = this.rng() * 2 - 1
    this.to = this.rng() * 2 - 1
  }

  setHz(hz: number): void {
    this.inc = Math.max(1e-6, hz) / this.sampleRate
  }

  process(): number {
    this.pos += this.inc
    while (this.pos >= 1) {
      this.pos -= 1
      this.from = this.to
      this.to = this.rng() * 2 - 1
    }
    // Cosine interpolation — no corners, so no clicks in a pitch modulator.
    const t = 0.5 - 0.5 * Math.cos(this.pos * Math.PI)
    return this.from + (this.to - this.from) * t
  }
}
