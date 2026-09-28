import type { InstrumentDef } from './types.ts'
import type { OutputSpec } from '../fuzzy/inference.ts'

/** The range of a named parameter, whether the rules set it or nothing does. */
export function paramSpecOf(def: InstrumentDef, name: string): OutputSpec | undefined {
  return def.rules.outputs[name] ?? def.fixed?.[name]
}
