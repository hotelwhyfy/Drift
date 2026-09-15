/**
 * A drawn stroke, turned into something playable.
 *
 * Two things come out of one gesture. The obvious one is the curve itself,
 * resampled to a fixed grid so it can loop over a chosen number of bars. The
 * less obvious one is the stroke's *character* — how shaky the hand was, how
 * far it travelled, which way it leaned. Drawing a jagged line and drawing a
 * smooth arc are different musical instructions even when they cover the same
 * ground, and reading only the path would throw that away.
 */
export interface Point {
  /** 0..1 across the drawing area. */
  x: number
  /** 0..1, already flipped so 1 is the top. */
  y: number
}

/** Points per loop. 128 is well past what a hand can articulate. */
export const CURVE_RESOLUTION = 128

export interface GestureCharacter {
  /** 0..1 — high-frequency wobble in the stroke. */
  jitter: number
  /** -1..1 — overall rise or fall. */
  slope: number
  /** 0..1 — vertical ground covered. */
  extent: number
  /** 0..1 — mean height. */
  centre: number
}

export interface Curve {
  readonly points: Float32Array
  readonly character: GestureCharacter
}

/**
 * Resample an arbitrary stroke onto the fixed grid.
 *
 * Sampled against x rather than against time, so drawing slowly at one end
 * does not stretch that part of the loop. The stroke is a shape, not a
 * performance; a performance would need the timing kept.
 */
export function curveFromStroke(stroke: readonly Point[]): Curve {
  const points = new Float32Array(CURVE_RESOLUTION)
  if (stroke.length === 0) {
    points.fill(0.5)
    return { points, character: { jitter: 0, slope: 0, extent: 0, centre: 0.5 } }
  }
  if (stroke.length === 1) {
    points.fill(clamp01(stroke[0].y))
    return { points, character: { jitter: 0, slope: 0, extent: 0, centre: clamp01(stroke[0].y) } }
  }

  const sorted = [...stroke].sort((a, b) => a.x - b.x)
  let cursor = 0
  for (let i = 0; i < CURVE_RESOLUTION; i++) {
    const x = i / (CURVE_RESOLUTION - 1)
    while (cursor < sorted.length - 2 && sorted[cursor + 1].x < x) cursor++
    const a = sorted[cursor]
    const b = sorted[Math.min(sorted.length - 1, cursor + 1)]
    const span = b.x - a.x
    const t = span > 1e-6 ? (x - a.x) / span : 0
    points[i] = clamp01(a.y + (b.y - a.y) * Math.min(1, Math.max(0, t)))
  }

  return { points, character: characterise(points) }
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x
}

function characterise(points: Float32Array): GestureCharacter {
  let min = 1
  let max = 0
  let sum = 0
  let roughness = 0
  for (let i = 0; i < points.length; i++) {
    const v = points[i]
    if (v < min) min = v
    if (v > max) max = v
    sum += v
    if (i >= 2) {
      // Second difference: large where the line changes direction sharply,
      // near zero on a smooth arc however steep.
      roughness += Math.abs(points[i] - 2 * points[i - 1] + points[i - 2])
    }
  }
  const n = points.length
  return {
    jitter: Math.min(1, (roughness / n) * 26),
    slope: Math.max(-1, Math.min(1, (points[n - 1] - points[0]) * 1.4)),
    extent: max - min,
    centre: sum / n,
  }
}

/** Read the curve at a loop position, interpolating between grid points. */
export function sampleCurve(points: Float32Array, phase: number): number {
  const n = points.length
  const p = phase - Math.floor(phase)
  const pos = p * n
  const i = Math.floor(pos)
  const frac = pos - i
  const a = points[i % n]
  const b = points[(i + 1) % n]
  return a + (b - a) * frac
}

/**
 * Rebuild a curve from stored points.
 *
 * The character is recomputed rather than stored: it is derived entirely from
 * the points, and persisting a derived value only creates a way for a file to
 * disagree with itself.
 */
export function curveFromPoints(points: readonly number[]): Curve {
  const arr = new Float32Array(CURVE_RESOLUTION)
  for (let i = 0; i < CURVE_RESOLUTION; i++) {
    const v = points[i]
    arr[i] = typeof v === 'number' && Number.isFinite(v) ? clamp01(v) : 0.5
  }
  return { points: arr, character: characterise(arr) }
}

/** A flat curve at a given height, for a lane that has not been drawn yet. */
export function flatCurve(value: number): Curve {
  const points = new Float32Array(CURVE_RESOLUTION)
  points.fill(value)
  return { points, character: { jitter: 0, slope: 0, extent: 0, centre: value } }
}
