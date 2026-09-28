import { sampleCurve, flatCurve } from './curve.ts'
import type { Curve } from './curve.ts'
import { walkAt } from './walkAt.ts'
import type { Envelope } from '../song/song.ts'
import { sampleEnvelope } from '../song/sampleEnvelope.ts'
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
  /** Laid out on the song's timeline: read at the absolute bar, never looped. */
  | { kind: 'song'; envelope: Envelope }

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

export interface LaneContext {
  /** Musical position in bars, fractional. */
  bars: number
  /** Level of the most recent kick, for follow lanes. */
  kick: number
  /** Overall output level, for follow lanes. */
  level: number
}

/**
 * Evaluates lanes. Every source is a pure function of the musical position
 * (or, for follow lanes, of the signal at that instant), so there is no state
 * to carry between evaluations and nothing that depends on how playback got
 * to where it is.
 */
export class LaneEvaluator {
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
      case 'walk':
        return walkAt(lane.source.seed, lane.source.smoothness, ctx.bars)
      case 'follow':
        return lane.source.of === 'kick' ? ctx.kick : ctx.level
      case 'song':
        return sampleEnvelope(lane.source.envelope, ctx.bars)
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
}
