import type { SlotDesc } from '@/engine/types.ts'
import type { Lane } from '@/automation/lane.ts'

/** The slots with one lane replaced by `next`, or removed when `next` is null. */
export function withSlotLane(slots: readonly SlotDesc[], slotId: string, laneId: string, next: Lane | null): SlotDesc[] {
  return slots.map((s) => s.id !== slotId ? s : {
    ...s,
    lanes: next ? s.lanes.map((l) => (l.id === laneId ? next : l)) : s.lanes.filter((l) => l.id !== laneId),
  })
}
