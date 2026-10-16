import type { SlotDesc } from '@/engine/types.ts'
import { DEFAULT_RACK } from '@/engine/engine.ts'
import { instrumentById } from '@/instruments/registry.ts'
import { NEUTRAL } from '@/fuzzy/expression.ts'

/** The rack the six dials were tuned against. */
export function defaultSlots(): SlotDesc[] {
  return DEFAULT_RACK.map((defId, i) => ({
    id: `${defId}-${i}`,
    defId,
    name: instrumentById(defId)?.name ?? defId,
    level: 0.8,
    muted: false,
    soloed: false,
    expression: { ...NEUTRAL },
    // Following the dials completely by default, so the app behaves as a
    // six-dial instrument until someone deliberately breaks a slot away.
    follow: 1,
    lanes: [],
    knobs: {},
  }))
}
