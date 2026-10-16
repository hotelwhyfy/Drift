import type { SlotDesc } from '@/engine/types.ts'
import { instrumentById } from '@/instruments/registry.ts'
import { readNumber } from '@/project/read/readNumber.ts'
import { readBoolean } from '@/project/read/readBoolean.ts'
import { readString } from '@/project/read/readString.ts'
import { readExpression } from '@/project/read/readExpression.ts'
import { readLane } from '@/project/read/readLane.ts'
import { readKnobs } from '@/project/read/readKnobs.ts'

export function readSlot(raw: unknown, index: number): SlotDesc | null {
  if (typeof raw !== 'object' || raw === null) return null
  const record: Record<string, unknown> = { ...raw }
  const defId = readString(record.defId, '')
  const def = instrumentById(defId)
  // An instrument this build does not have is skipped rather than faked, so a
  // file from a newer version still opens with everything it recognises.
  if (!def) return null
  const id = readString(record.id, `${defId}-${index}`)
  const lanes = Array.isArray(record.lanes)
    ? record.lanes.map((l, i) => readLane(l, i, id))
    : []
  return {
    id,
    defId,
    name: readString(record.name, def.name),
    level: readNumber(record.level, 0.8),
    muted: readBoolean(record.muted),
    soloed: readBoolean(record.soloed),
    expression: readExpression(record.expression),
    follow: readNumber(record.follow, 1),
    lanes,
    // Version 1 files predate knobs; an empty set means "the rules decide",
    // which is exactly how those files sounded.
    knobs: readKnobs(record.knobs, def),
  }
}
