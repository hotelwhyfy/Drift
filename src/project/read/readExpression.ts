import type { Expression } from '@/fuzzy/expression.ts'
import { EXPRESSION_KEYS, NEUTRAL } from '@/fuzzy/expression.ts'
import { readNumber } from '@/project/read/readNumber.ts'

export function readExpression(raw: unknown): Expression {
  const out: Expression = { ...NEUTRAL }
  if (typeof raw !== 'object' || raw === null) return out
  const record: Record<string, unknown> = { ...raw }
  EXPRESSION_KEYS.forEach((key) => { out[key] = readNumber(record[key], NEUTRAL[key]) })
  return out
}
