/**
 * Fractional delay line with linear interpolation, the building block for the
 * reverb, the chorus, the echo and the tape wow.
 */
export class DelayLine {
  private buf: Float32Array
  private write = 0
  private readonly mask: number

  constructor(maxSamples: number) {
    // Power-of-two length so the wrap is a mask rather than a modulo.
    let size = 2
    while (size < maxSamples + 4) size *= 2
    this.buf = new Float32Array(size)
    this.mask = size - 1
  }

  push(x: number): void {
    this.buf[this.write] = x
    this.write = (this.write + 1) & this.mask
  }

  /** Read `delay` samples back. Fractional delays interpolate. */
  read(delay: number): number {
    const d = delay < 1 ? 1 : delay > this.mask - 2 ? this.mask - 2 : delay
    const pos = this.write - d + this.buf.length
    const i = Math.floor(pos)
    const frac = pos - i
    const a = this.buf[i & this.mask]
    const b = this.buf[(i + 1) & this.mask]
    return a + (b - a) * frac
  }

  clear(): void {
    this.buf.fill(0)
  }
}
