import { sampleCurve, flatCurve } from './curve.ts'
import type { Curve } from './curve.ts'
import { createRng } from '../core/rng.ts'
import type { Rng } from '../core/rng.ts'
import type { ExpressionKey } from '../fuzzy/expression.ts'

/**
 * Automation sources.
 *
 * A drawn curve is the headline, but it is not always the right tool: nobody
 * wants to draw eight bars of gentle wandering by hand, and a loop that
 * repeats exactly is precisely what endless music must avoid. So drawn curves
 * sit alongside generators that never repeat, and the two can drive the same
 * target.
 */
export type LaneSource =
  | { kind: 'curve'; curve: Curve }
  | { kind: 'lfo'; shape: 'sine' | 'triangle' | 'ramp' | 'square'; bars: number; phase: number }
  | { kind: 'walk'; smoothness: number; seed: number }
  | { kind: 'follow'; of: 'kick' | 'level'; }

export type LaneTarget =
  | { kind: 'expression'; key: ExpressionKey }
  | { kind: 'param'; param: string }
  | { kind: 'level' }

export type LaneMode = 'set' | 'add' | 'scale'

export interface Lane {
  readonly id: string
  target: LaneTarget
  source: LaneSource
  /** How much of the source reaches the target, 0..1. */
  depth: number
  /** Loop length in bars for curve and lfo sources. */
  bars: number
  /** How the value combines with what is already there. */
  mode: LaneMode
  enabled: boolean
}

export function makeLane(id: string, target: LaneTarget): Lane {
  return {
    id,
    target,
    source: { kind: 'curve', curve: flatCurve(0.5) },
    depth: 1,
    bars: 4,
    mode: 'set',
    enabled: true,
  }
}

/**
 * A bounded random walk. Unlike an LFO it never repeats, and unlike white
 * noise it moves the way a hand does — which is what makes it usable as the
 * default "just keep it alive" source.
 */
class Walk {
  private value = 0.5
  private velocity = 0
  private rng: Rng
  constructor(seed: number, private smoothness: number) {
    this.rng = createRng(seed)
  }
  step(dt: number): number {
    const stiffness = 0.6 + (1 - this.smoothness) * 5
    const damping = 0.55 + this.smoothness * 0.4
    // A spring pulling towards the middle keeps the walk from wandering off
    // and sticking at an extreme, which an unconstrained walk eventually does.
    this.velocity += ((0.5 - this.value) * stiffness + (this.rng() - 0.5) * 7) * dt
    this.velocity *= Math.pow(damping, dt * 60)
    this.value += this.velocity * dt
    if (this.value < 0) { this.value = 0; this.velocity = Math.abs(this.velocity) * 0.4 }
    if (this.value > 1) { this.value = 1; this.velocity = -Math.abs(this.velocity) * 0.4 }
    return this.value
  }
  reset(seed: number, smoothness: number): void {
    this.rng = createRng(seed)
    this.smoothness = smoothness
    this.value = 0.5
    this.velocity = 0
  }
}

export interface LaneContext {
  /** Musical position in bars, fractional. */
  bars: number
  /** Seconds since the last evaluation. */
  dt: number
  /** Level of the most recent kick, for follow lanes. */
  kick: number
  /** Overall output level, for follow lanes. */
  level: number
}

/**
 * Evaluates lanes. Walk state has to live somewhere across evaluations, so the
 * evaluator is an object rather than a function.
 */
export class LaneEvaluator {
  private walks = new Map<string, Walk>()

  value(lane: Lane, ctx: LaneContext): number {
    switch (lane.source.kind) {
      case 'curve':
        return sampleCurve(lane.source.curve.points, ctx.bars / Math.max(0.25, lane.bars))
      case 'lfo': {
        const phase = (ctx.bars / Math.max(0.25, lane.source.bars) + lane.source.phase) % 1
        switch (lane.source.shape) {
          case 'sine': return 0.5 - 0.5 * Math.cos(phase * Math.PI * 2)
          case 'triangle': return phase < 0.5 ? phase * 2 : 2 - phase * 2
          case 'ramp': return phase
          case 'square': return phase < 0.5 ? 1 : 0
        }
        return 0.5
      }
      case 'walk': {
        let walk = this.walks.get(lane.id)
        if (!walk) {
          walk = new Walk(lane.source.seed, lane.source.smoothness)
          this.walks.set(lane.id, walk)
        }
        return walk.step(ctx.dt)
      }
      case 'follow':
        return lane.source.of === 'kick' ? ctx.kick : ctx.level
    }
  }

  /** Combine a lane's value into an existing value according to its mode. */
  apply(current: number, laneValue: number, lane: Lane): number {
    const v = laneValue
    switch (lane.mode) {
      case 'set':
        return current + (v - current) * lane.depth
      case 'add':
        return current + (v - 0.5) * 2 * lane.depth
      case 'scale':
        return current * (1 - lane.depth + v * lane.depth)
    }
  }

  reset(): void {
    this.walks.clear()
  }
}
