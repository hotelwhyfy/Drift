import type { Lane, LaneTarget } from '@/automation/lane.ts'
import type { Envelope } from '@/song/types.ts'

/** A lane laid out on the song's timeline. */
export type SongLane = Lane & { source: { kind: 'song'; envelope: Envelope } }

/**
 * The timeline lane that drives a control, if one does: the last enabled song
 * lane on that target with any depth. While it exists the control is the lane
 * — turning it writes into the lane at the playhead, the way the six dials
 * write into theirs — rather than setting a base the lane then overrides.
 *
 * Looped curves and generators are deliberately not drivers. A loop written
 * at the playhead would change every repetition, and an LFO or a walk has
 * nothing stored to write into, so under those the control stays the base.
 */
export function songLaneFor(lanes: readonly Lane[], matches: (target: LaneTarget) => boolean): SongLane | undefined {
  for (let i = lanes.length - 1; i >= 0; i--) {
    const lane = lanes[i]
    if (lane.enabled && lane.depth > 0 && lane.source.kind === 'song' && matches(lane.target)) {
      return { ...lane, source: lane.source }
    }
  }
  return undefined
}
