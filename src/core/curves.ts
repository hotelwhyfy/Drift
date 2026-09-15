/**
 * Shaping helpers. The macro layer is almost entirely these: every engine
 * parameter is a curve read at a macro's position, and the curve is where the
 * musical judgement lives.
 */
export const clamp = (x: number, lo: number, hi: number): number =>
  x < lo ? lo : x > hi ? hi : x

export const clamp01 = (x: number): number => clamp(x, 0, 1)

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

/** Linear map with clamping at both ends. */
export const map = (x: number, inLo: number, inHi: number, outLo: number, outHi: number): number =>
  lerp(outLo, outHi, clamp01((x - inLo) / (inHi - inLo || 1)))

export const smoothstep = (t: number): number => {
  const x = clamp01(t)
  return x * x * (3 - 2 * x)
}

/**
 * Bias a 0..1 position. k > 1 holds the low end back (most of the travel
 * happens late); k < 1 opens early. Use for anything perceptual.
 */
export const bias = (x: number, k: number): number => Math.pow(clamp01(x), k)

/** Interpolate on a log scale — the right default for frequency and time. */
export const lerpExp = (a: number, b: number, t: number): number =>
  a * Math.pow(b / a, clamp01(t))

/**
 * A window: 0 below `lo`, ramping to 1 by `hi`. Lets one macro bring a
 * parameter in only over part of its travel, which is how a single dial can
 * stage several changes instead of moving everything at once.
 */
export const ramp = (x: number, lo: number, hi: number): number =>
  clamp01((x - lo) / (hi - lo || 1))

/** Rises then falls, peaking at `centre`. For things that want a sweet spot. */
export const hump = (x: number, centre: number, width: number): number => {
  const d = Math.abs(clamp01(x) - centre) / (width || 1)
  return d >= 1 ? 0 : smoothstep(1 - d)
}

export const dbToGain = (db: number): number => Math.pow(10, db / 20)
export const gainToDb = (g: number): number => 20 * Math.log10(Math.max(1e-9, g))

/** Equal-power pan. -1 left, 0 centre, +1 right. */
export function panGains(pan: number): [number, number] {
  const p = (clamp(pan, -1, 1) + 1) * 0.25 * Math.PI
  return [Math.cos(p), Math.sin(p)]
}
