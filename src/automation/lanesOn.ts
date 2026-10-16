import type { Lane, LaneTarget } from '@/automation/lane.ts'

/** Every lane actually acting on a target: enabled, and with some depth. */
export function lanesOn(lanes: readonly Lane[], matches: (target: LaneTarget) => boolean): Lane[] {
  return lanes.filter((lane) => lane.enabled && lane.depth > 0 && matches(lane.target))
}
