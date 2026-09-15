/**
 * Membership functions over a normalised 0..1 domain.
 *
 * Fuzzy sets rather than thresholds because the whole point of this control
 * scheme is that there is no edge to fall off. A value of 0.49 "brightness"
 * should not produce categorically different music from 0.51; it should be
 * mostly-warm with a little bright mixed in, and the inference should blend the
 * two rules' conclusions in that proportion.
 */
export type MembershipFn = (x: number) => number

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)

/** Triangle rising from `a`, peaking at `b`, falling to `c`. */
export function tri(a: number, b: number, c: number): MembershipFn {
  return (x) => {
    if (x <= a || x >= c) return 0
    if (x === b) return 1
    return x < b ? (x - a) / (b - a) : (c - x) / (c - b)
  }
}

/** Trapezoid: rises a→b, flat b→c, falls c→d. Use for the end terms so the
 *  extremes of a dial stay fully committed instead of tapering off. */
export function trap(a: number, b: number, c: number, d: number): MembershipFn {
  return (x) => {
    if (x <= a || x >= d) return 0
    if (x >= b && x <= c) return 1
    return x < b ? (x - a) / (b - a) : (d - x) / (d - c)
  }
}

/** Gaussian-ish bell, for terms that should never quite reach zero. */
export function bell(centre: number, width: number): MembershipFn {
  return (x) => {
    const d = (x - centre) / (width || 1e-6)
    return Math.exp(-0.5 * d * d)
  }
}

/**
 * The standard three-term split of a 0..1 variable. Overlapping deliberately:
 * adjacent terms sum to roughly 1 across the whole range, which is what makes
 * the defuzzified output move smoothly rather than in steps.
 */
export function threeTerms(): Record<string, MembershipFn> {
  return {
    low: trap(-0.01, 0, 0.16, 0.46),
    mid: tri(0.2, 0.5, 0.8),
    high: trap(0.54, 0.84, 1, 1.01),
  }
}

/** Five terms, for outputs that need finer shading than low/mid/high. */
export function fiveTerms(): Record<string, MembershipFn> {
  return {
    lowest: trap(-0.01, 0, 0.08, 0.26),
    low: tri(0.06, 0.26, 0.48),
    mid: tri(0.28, 0.5, 0.72),
    high: tri(0.52, 0.74, 0.94),
    highest: trap(0.74, 0.92, 1, 1.01),
  }
}

export { clamp01 }
