import type { ControlSpec, InstrumentDef } from './types.ts'

/**
 * The knobs for an instrument: its declared controls, or one per rule output
 * for an instrument that has not declared any, so nothing is ever unreachable.
 */
export function controlsOf(def: InstrumentDef): readonly ControlSpec[] {
  if (def.controls) return def.controls
  return [...Object.keys(def.rules.outputs), ...Object.keys(def.fixed ?? {})]
    .map((param) => ({ param, label: param }))
}
