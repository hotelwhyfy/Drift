import type { Lane } from '@/automation/lane.ts'
import type { SongLane } from '@/automation/songLaneFor.ts'

/** Whether a lane is drawn on the timeline rather than looped or generated. */
export const isSongLane = (lane: Lane): lane is SongLane => lane.source.kind === 'song'
