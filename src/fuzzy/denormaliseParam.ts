import type { OutputSpec } from './inference.ts'
import { clamp01 } from '../core/curves.ts'

/** 0..1 across a parameter's range → its real value, respecting its scale. */
export function denormaliseParam(spec: OutputSpec, norm: number): number {
  const n = clamp01(norm)
  return spec.scale === 'exp'
    ? spec.min * Math.pow(spec.max / spec.min, n)
    : spec.min + (spec.max - spec.min) * n
}
