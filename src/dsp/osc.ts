/**
 * Oscillators. The saw is polyBLEP-corrected: an ambient pad holds long notes
 * with the filter wide open, which is exactly the condition where a naive saw's
 * aliasing sits as an audible inharmonic shimmer.
 */
const TWO_PI = Math.PI * 2

export class Phasor {
  phase = 0
  private inc = 0
  constructor(private readonly sampleRate: number, startPhase = 0) {
    this.phase = startPhase
  }
  setHz(hz: number): void {
    this.inc = hz / this.sampleRate
  }
  get increment(): number {
    return this.inc
  }
  step(): number {
    this.phase += this.inc
    if (this.phase >= 1) this.phase -= 1
    return this.phase
  }
}

/** polyBLEP residual for a discontinuity at phase 0. */
function polyBlep(t: number, dt: number): number {
  if (dt <= 0) return 0
  if (t < dt) {
    const x = t / dt
    return x + x - x * x - 1
  }
  if (t > 1 - dt) {
    const x = (t - 1) / dt
    return x * x + x + x + 1
  }
  return 0
}

export function sawFrom(phase: number, inc: number): number {
  return 2 * phase - 1 - polyBlep(phase, inc)
}

export function squareFrom(phase: number, inc: number): number {
  const naive = phase < 0.5 ? 1 : -1
  const half = phase + 0.5 >= 1 ? phase - 0.5 : phase + 0.5
  return naive + polyBlep(phase, inc) - polyBlep(half, inc)
}

export function sineFrom(phase: number): number {
  return Math.sin(phase * TWO_PI)
}

/** Triangle by integrating a square — cheap and alias-light enough here. */
export class Triangle {
  private z = 0
  process(phase: number, inc: number): number {
    const sq = squareFrom(phase, inc)
    this.z += 4 * inc * (sq - this.z * 0.002)
    return this.z
  }
}

/**
 * A free-running LFO with a random phase per instance, so two "identical"
 * modulators never lock together and beat.
 */
export class Lfo {
  private phasor: Phasor
  constructor(sampleRate: number, hz: number, phase = 0) {
    this.phasor = new Phasor(sampleRate, phase)
    this.phasor.setHz(hz)
  }
  setHz(hz: number): void {
    this.phasor.setHz(hz)
  }
  /** Bipolar sine, -1..1. */
  process(): number {
    return sineFrom(this.phasor.step())
  }
}
