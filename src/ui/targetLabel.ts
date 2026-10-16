import type { SlotDesc } from '@/engine/types.ts'
import type { Lane } from '@/automation/lane.ts'
import { instrumentById } from '@/instruments/registry.ts'
import { controlsOf } from '@/instruments/controlsOf.ts'
import { EXPRESSION_INFO } from '@/fuzzy/expression.ts'

/** What a lane drives, in lower case, for its row label. */
export function targetLabel(slot: SlotDesc, lane: Lane): string {
  const def = instrumentById(slot.defId)
  const t = lane.target
  if (t.kind === 'level') return 'level'
  if (t.kind === 'expression') return EXPRESSION_INFO.find((i) => i.key === t.key)?.label.toLowerCase() ?? t.key
  return (def && controlsOf(def).find((c) => c.param === t.param)?.label.toLowerCase()) ?? t.param
}
