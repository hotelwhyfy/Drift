/** A reusable stereo frame. Voices write into one rather than allocating. */
export type Stereo = [number, number]

export const stereo = (): Stereo => [0, 0]

export interface Instrument {
  /** Adds this instrument's output into `out`. Never overwrites. */
  process(out: Stereo): void
}
