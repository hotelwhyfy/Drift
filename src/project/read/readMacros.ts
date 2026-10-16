import type { Macros } from '@/macros/macros.ts'
import { DEFAULT_MACROS, MACRO_KEYS } from '@/macros/macros.ts'
import { readNumber } from '@/project/read/readNumber.ts'

export function readMacros(raw: unknown): Macros {
  const out: Macros = { ...DEFAULT_MACROS }
  if (typeof raw !== 'object' || raw === null) return out
  const record: Record<string, unknown> = { ...raw }
  for (const key of MACRO_KEYS) out[key] = readNumber(record[key], DEFAULT_MACROS[key])
  return out
}
