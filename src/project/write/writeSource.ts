import type { LaneSource } from '@/automation/lane.ts'
import { round3 } from '@/project/write/round3.ts'
import { writeEnvelope } from '@/project/write/writeEnvelope.ts'

/** Points are rounded: three decimals is well under what a hand can draw. */
export function writeSource(source: LaneSource): unknown {
  if (source.kind === 'curve') {
    return {
      kind: 'curve',
      points: Array.from(source.curve.points, round3),
    }
  }
  if (source.kind === 'song') return { kind: 'song', points: writeEnvelope(source.envelope) }
  return source
}
