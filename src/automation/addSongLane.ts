import type { SlotDesc } from '@/engine/types.ts'
import type { Lane } from '@/automation/lane.ts'

/**
 * The slots with an empty timeline lane added, for a menu value of
 * `slotId|level` or `slotId|param`. `stamp` makes the lane id unique; it comes
 * from the caller so this stays a pure function. Null when the value names no
 * slot or no target.
 */
export function addSongLane(slots: readonly SlotDesc[], value: string, stamp: string): SlotDesc[] | null {
  const [slotId, target] = value.split('|')
  const slot = slots.find((s) => s.id === slotId)
  if (!slot || !target) return null
  const lane: Lane = {
    id: `${slot.id}-song-${stamp}`,
    target: target === 'level' ? { kind: 'level' } : { kind: 'param', param: target },
    source: { kind: 'song', envelope: { points: [] } },
    depth: 1,
    bars: 4,
    mode: 'set',
    enabled: true,
  }
  return slots.map((s) => (s.id === slot.id ? { ...s, lanes: [...s.lanes, lane] } : s))
}
