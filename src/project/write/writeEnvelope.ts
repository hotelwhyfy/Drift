import type { Envelope } from '@/song/types.ts'
import { round3 } from '@/project/write/round3.ts'

/** Plain arrays, never the typed or nested objects the engine holds. */
export function writeEnvelope(env: Envelope): unknown[] {
  return env.points.map((p) => [round3(p.bar), round3(p.value), p.shape])
}
