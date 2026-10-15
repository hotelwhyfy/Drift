import { LaneEvaluator } from './lane.ts'
import type { SongLane } from './songLaneFor.ts'
import { sampleEnvelope } from '../song/sampleEnvelope.ts'

const lanes = new LaneEvaluator()

/** Where a timeline lane puts its control at a bar, starting from `base`. */
export function drivenValue(lane: SongLane, base: number, bar: number): number {
  const v = lanes.apply(base, sampleEnvelope(lane.source.envelope, bar), lane)
  return Math.min(1, Math.max(0, v))
}
