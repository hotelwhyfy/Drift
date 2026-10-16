import type { Lane } from '@/automation/lane.ts'
import type { SongLane } from '@/automation/songLaneFor.ts'
import { invertLane } from '@/automation/invertLane.ts'
import { setPointAt } from '@/song/setPointAt.ts'

/**
 * A control moved to `value` while `lane` drives it: write the point that
 * makes the lane produce that value at `bar`, and return the slot's lanes with
 * it in. Done while playing, a drag leaves a trail of points behind the
 * playhead — recording automation by hand, exactly as the six dials do.
 */
export function recordInto(lanes: readonly Lane[], lane: SongLane, base: number, value: number, bar: number): Lane[] {
  const at = Math.round(bar * 4) / 4
  const envelope = setPointAt(lane.source.envelope, at, invertLane(lane, base, value))
  return lanes.map((l) => (l.id === lane.id ? { ...l, source: { kind: 'song', envelope } } : l))
}
