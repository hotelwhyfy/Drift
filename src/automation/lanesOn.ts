import type { Lane, LaneTarget } from '@/automation/lane.ts'
import { laneActs } from '@/automation/laneActs.ts'

/** Every lane actually acting on a target: see `laneActs`. */
export function lanesOn(lanes: readonly Lane[], matches: (target: LaneTarget) => boolean): Lane[] {
  return lanes.filter((lane) => laneActs(lane) && matches(lane.target))
}
