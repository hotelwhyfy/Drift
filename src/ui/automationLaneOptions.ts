import type { SlotDesc } from '@/engine/types.ts'
import type { SelectGroup } from '@/ui/types.ts'
import { instrumentById } from '@/instruments/registry.ts'
import { controlsOf } from '@/instruments/controlsOf.ts'

/** The "+ automation lane" menu: each instrument's level and controls, as `slotId|target` values. */
export function automationLaneOptions(slots: readonly SlotDesc[]): SelectGroup<string>[] {
  return slots.flatMap((slot): SelectGroup<string>[] => {
    const def = instrumentById(slot.defId)
    if (!def) return []
    return [{
      group: slot.name,
      options: [
        { value: `${slot.id}|level`, label: 'level' },
        ...controlsOf(def).map((c) => ({ value: `${slot.id}|${c.param}`, label: c.label.toLowerCase() })),
      ],
    }]
  })
}
