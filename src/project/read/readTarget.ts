import type { LaneTarget } from '@/automation/lane.ts'
import { EXPRESSION_KEYS } from '@/fuzzy/expression.ts'

export function readTarget(raw: unknown): LaneTarget {
  if (typeof raw === 'object' && raw !== null) {
    const record: Record<string, unknown> = { ...raw }
    if (record.kind === 'level') return { kind: 'level' }
    if (record.kind === 'param' && typeof record.param === 'string') {
      return { kind: 'param', param: record.param }
    }
    if (record.kind === 'expression') {
      const key = EXPRESSION_KEYS.find((k) => k === record.key)
      if (key) return { kind: 'expression', key }
    }
  }
  return { kind: 'expression', key: 'motion' }
}
