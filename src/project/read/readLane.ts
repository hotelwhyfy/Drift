import type { Lane, LaneMode } from '@/automation/lane.ts'
import { readNumber } from '@/project/read/readNumber.ts'
import { readBoolean } from '@/project/read/readBoolean.ts'
import { readString } from '@/project/read/readString.ts'
import { readTarget } from '@/project/read/readTarget.ts'
import { readSource } from '@/project/read/readSource.ts'
import { MAX_LANE_BARS } from '@/project/constants.ts'

export function readLane(raw: unknown, index: number, slotId: string): Lane {
  const record: Record<string, unknown> =
    typeof raw === 'object' && raw !== null ? { ...raw } : {}
  const modes: LaneMode[] = ['set', 'add', 'scale']
  return {
    id: readString(record.id, `${slotId}-lane-${index}`),
    target: readTarget(record.target),
    source: readSource(record.source),
    depth: readNumber(record.depth, 1),
    bars: readNumber(record.bars, 4, 0.25, MAX_LANE_BARS),
    mode: modes.find((m) => m === record.mode) ?? 'set',
    enabled: readBoolean(record.enabled, true),
  }
}
