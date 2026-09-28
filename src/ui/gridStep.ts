/**
 * How many bars apart gridlines should be at a zoom level, so they are never
 * closer than `minPx`. Always a power of two, so they land on phrase lines.
 */
export function gridStep(pxPerBar: number, minPx: number): number {
  let step = 1
  while (step * pxPerBar < minPx) step *= 2
  return step
}
