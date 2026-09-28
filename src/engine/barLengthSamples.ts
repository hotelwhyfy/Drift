/** Samples in one 4/4 bar. Fractional: the engine rounds each bar up. */
export function barLengthSamples(tempo: number, sampleRate: number): number {
  return (60 / tempo) * 4 * sampleRate
}
