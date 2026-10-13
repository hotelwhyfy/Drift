/**
 * Andrew Simper's topology-preserving state variable filter. Stable when the
 * cutoff is swept fast, which matters here because almost every filter in the
 * patch is moving — that is most of what "alive" means in this app.
 */
export class Svf {
  private ic1 = 0
  private ic2 = 0
  private g = 0
  private k = 0
  private a1 = 0
  private a2 = 0
  private a3 = 0
  /** The arguments the coefficients were last worked out for. */
  private lastCutoff = NaN
  private lastQ = NaN

  constructor(private readonly sampleRate: number) {
    this.set(1000, 0.7)
  }

  /**
   * Many callers set the filter every sample with a cutoff that only changes
   * at control rate. Recomputing identical coefficients costs a tan() each
   * time and changes nothing, so it is skipped — the output is bit-identical.
   */
  set(cutoffHz: number, q: number): void {
    if (cutoffHz === this.lastCutoff && q === this.lastQ) return
    this.lastCutoff = cutoffHz
    this.lastQ = q
    const nyquist = this.sampleRate * 0.5
    const fc = cutoffHz < 10 ? 10 : cutoffHz > nyquist * 0.98 ? nyquist * 0.98 : cutoffHz
    this.g = Math.tan((Math.PI * fc) / this.sampleRate)
    this.k = 1 / (q < 0.05 ? 0.05 : q)
    this.a1 = 1 / (1 + this.g * (this.g + this.k))
    this.a2 = this.g * this.a1
    this.a3 = this.g * this.a2
  }

  /**
   * Takes another filter's coefficients without recomputing them: the
   * stereo pair in a voice is always set identically, but each channel must
   * keep its own state.
   */
  copyCoefficients(from: Svf): void {
    this.lastCutoff = from.lastCutoff
    this.lastQ = from.lastQ
    this.g = from.g
    this.k = from.k
    this.a1 = from.a1
    this.a2 = from.a2
    this.a3 = from.a3
  }

  lowpass(x: number): number {
    const v3 = x - this.ic2
    const v1 = this.a1 * this.ic1 + this.a2 * v3
    const v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3
    this.ic1 = 2 * v1 - this.ic1
    this.ic2 = 2 * v2 - this.ic2
    return v2
  }

  highpass(x: number): number {
    const v3 = x - this.ic2
    const v1 = this.a1 * this.ic1 + this.a2 * v3
    const v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3
    this.ic1 = 2 * v1 - this.ic1
    this.ic2 = 2 * v2 - this.ic2
    return x - this.k * v1 - v2
  }

  bandpass(x: number): number {
    const v3 = x - this.ic2
    const v1 = this.a1 * this.ic1 + this.a2 * v3
    const v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3
    this.ic1 = 2 * v1 - this.ic1
    this.ic2 = 2 * v2 - this.ic2
    return v1
  }

  reset(): void {
    this.ic1 = 0
    this.ic2 = 0
  }
}

/** One-pole smoother. Used everywhere a control value must stop zippering. */
export class OnePole {
  private z = 0
  private a = 0

  constructor(private readonly sampleRate: number, timeMs = 20) {
    this.setTime(timeMs)
    }

  setTime(ms: number): void {
    this.a = Math.exp(-1 / ((ms / 1000) * this.sampleRate))
  }

  process(x: number): number {
    this.z = x + this.a * (this.z - x)
    return this.z
  }

  set(x: number): void {
    this.z = x
  }

  get value(): number {
    return this.z
  }
}

/** DC blocker — saturation and pitch-enveloped sines both need one. */
export class DcBlock {
  private x1 = 0
  private y1 = 0
  process(x: number): number {
    const y = x - this.x1 + 0.9975 * this.y1
    this.x1 = x
    this.y1 = y
    return y
  }
}
