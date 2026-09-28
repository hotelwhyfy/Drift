/** Maps bars to pixels for a timeline scrolled to `startBar`. */
export interface BarScale {
  readonly pxPerBar: number
  readonly startBar: number
  toX(bar: number): number
  toBar(x: number): number
}

export function barScale(pxPerBar: number, startBar: number): BarScale {
  return {
    pxPerBar,
    startBar,
    toX: (bar) => (bar - startBar) * pxPerBar,
    toBar: (x) => startBar + x / pxPerBar,
  }
}

