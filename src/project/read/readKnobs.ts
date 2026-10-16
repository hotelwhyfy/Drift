import { paramSpecOf } from '@/instruments/paramSpecOf.ts'
import type { InstrumentDef } from '@/instruments/types.ts'

/**
 * Knob settings. Only names the instrument actually has survive: a knob for a
 * parameter that was renamed or removed would otherwise sit in the file
 * forever, doing nothing and impossible to see.
 */
export function readKnobs(raw: unknown, def: InstrumentDef): Record<string, number> {
  if (typeof raw !== 'object' || raw === null) return {}
  return Object.fromEntries(Object.entries(raw).flatMap(([name, value]): [string, number][] => {
    if (!paramSpecOf(def, name)) return []
    if (typeof value !== 'number' || !Number.isFinite(value)) return []
    return [[name, Math.min(1, Math.max(0, value))]]
  }))
}
