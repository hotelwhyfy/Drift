import type { Lane, LaneTarget } from '@/automation/lane.ts'
import { lanesOn } from '@/automation/lanesOn.ts'
import { laneColour } from '@/ui/colour/laneColour.ts'

/**
 * The colour a control wears while automation acts on it, or undefined when
 * none does. A timeline lane lends its own colour, so the control and its
 * lane read as one thing in two places, as the six dials do with theirs; a
 * lane drawn in the instrument's panel lends the accent it is drawn in.
 * Colour is never the only cue — every automated control also shows a mark.
 */
export function automationColour(
  lanes: readonly Lane[],
  matches: (target: LaneTarget) => boolean,
  accent: string,
): string | undefined {
  const active = lanesOn(lanes, matches)
  if (active.length === 0) return undefined
  const timeline = [...active].reverse().find((l) => l.source.kind === 'song')
  return timeline ? laneColour(timeline.id) : accent
}
