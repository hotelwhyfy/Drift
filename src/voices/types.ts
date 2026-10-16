import type { Stereo } from '../core/types.ts'

export const stereo = (): Stereo => [0, 0]

export interface Instrument {
  /** Adds this instrument's output into `out`. Never overwrites. */
  process(out: Stereo): void
}
