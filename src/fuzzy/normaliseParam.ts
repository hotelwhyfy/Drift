import type { OutputSpec } from './inference.ts'
import { clamp01 } from '../core/curves.ts'

/** A parameter's real value → 0..1 across its range, respecting its scale. */
export function normaliseParam(spec: OutputSpec, value: number): number {
  if (spec.scale === 'exp') {
    return clamp01(Math.log(value / spec.min) / Math.log(spec.max / spec.min))
  }
  return clamp01((value - spec.min) / (spec.max - spec.min))
}
