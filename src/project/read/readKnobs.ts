import { paramSpecOf } from '@/instruments/paramSpecOf.ts'
import type { InstrumentDef } from '@/instruments/types.ts'

/**
 * Knob settings. Only names the instrument actually has survive: a knob for a
 * parameter that was renamed or removed would otherwise sit in the file
 * forever, doing nothing and impossible to see.
 */
export function readKnobs(raw: unknown, def: InstrumentDef): Record<string, number> {
  const out: Record<string, number> = {}
  if (typeof raw !== 'object' || raw === null) return out
  for (const [name, value] of Object.entries(raw)) {
    if (!paramSpecOf(def, name)) continue
    if (typeof value !== 'number' || !Number.isFinite(value)) continue
    out[name] = Math.min(1, Math.max(0, value))
  }
  return out
}
