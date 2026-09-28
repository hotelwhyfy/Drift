/**
 * Exponential ADSR. Exponential rather than linear because a linear decay on a
 * struck sound reads as a synthetic blip; the ear expects energy to bleed away
 * in proportion to what is left.
 */
export class Adsr {
  private stage: 'idle' | 'attack' | 'decay' | 'sustain' | 'release' = 'idle'
  private level = 0
  private aCoef = 0
  private dCoef = 0
  private rCoef = 0
  private sustainLevel = 0.7

  constructor(private readonly sampleRate: number) {}

  /** Times in seconds. A zero time is treated as one sample. */
  set(attack: number, decay: number, sustain: number, release: number): void {
    this.aCoef = this.coef(attack)
    this.dCoef = this.coef(decay)
    this.rCoef = this.coef(release)
    this.sustainLevel = sustain
  }

  private coef(seconds: number): number {
    const n = Math.max(1, seconds * this.sampleRate)
    // Reach ~99.9% of the target in `seconds`.
    return Math.exp(-6.908 / n)
  }

  gate(): void {
    this.stage = 'attack'
  }

  release(): void {
    if (this.stage !== 'idle') this.stage = 'release'
  }

  /** Gated and not yet released. */
  get gated(): boolean {
    return this.stage === 'attack' || this.stage === 'decay' || this.stage === 'sustain'
  }

  get active(): boolean {
    return this.stage !== 'idle'
  }

  process(): number {
    switch (this.stage) {
      case 'attack': {
        // Aim past 1 so the attack arrives rather than creeping asymptotically.
        this.level = 1.05 + this.aCoef * (this.level - 1.05)
        if (this.level >= 1) {
          this.level = 1
          this.stage = 'decay'
        }
        break
      }
      case 'decay': {
        this.level = this.sustainLevel + this.dCoef * (this.level - this.sustainLevel)
        if (Math.abs(this.level - this.sustainLevel) < 1e-4) {
          this.level = this.sustainLevel
          this.stage = 'sustain'
        }
        break
      }
      case 'sustain':
        break
      case 'release': {
        this.level *= this.rCoef
        if (this.level < 1e-5) {
          this.level = 0
          this.stage = 'idle'
        }
        break
      }
      case 'idle':
        return 0
    }
    return this.level
  }
}

/** A one-shot exponential decay — the right envelope for percussion and FM. */
export class Decay {
  private level = 0
  private coef = 0
  constructor(private readonly sampleRate: number) {}
  set(seconds: number): void {
    this.coef = Math.exp(-6.908 / Math.max(1, seconds * this.sampleRate))
  }
  trigger(level = 1): void {
    this.level = level
  }
  process(): number {
    const v = this.level
    this.level *= this.coef
    return v
  }
  get active(): boolean {
    return this.level > 1e-5
  }
}
