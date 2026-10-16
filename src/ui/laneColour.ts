import { INSTRUMENT_LANE_COLOURS } from '@/ui/laneColours.ts'
import { deriveSeed } from '@/core/rng.ts'

/** An instrument lane's colour, keyed by its id so removing one never repaints the others. */
export function laneColour(id: string): string {
  return INSTRUMENT_LANE_COLOURS[deriveSeed(id) % INSTRUMENT_LANE_COLOURS.length]
}
