import { rngAt } from '../core/rng.ts'
import { clamp01 } from '../core/curves.ts'

/**
 * A bounded random walk, read at a musical position.
 *
 * It used to be a spring-damped particle stepped forward at control rate,
 * which moved beautifully and could not be seeked: its value at bar 400
 * depended on every step taken to get there, so jumping to bar 400 heard a
 * different walk from playing to it. This is value noise instead — random
 * heights pinned to evenly spaced knots, eased between with a cosine — so the
 * value anywhere is a pure function of where you are. Two octaves keep it from
 * sounding like a slow LFO with a random shape.
 *
 * `smoothness` sets the knot spacing: a quarter bar at 0, four bars at 1.
 */
export function walkAt(seed: number, smoothness: number, bars: number): number {
  const period = 0.25 * Math.pow(16, clamp01(smoothness))
  const x = bars / period
  const coarse = layer(seed, 'coarse', x)
  const fine = layer(seed, 'fine', x * 2.7 + 0.37)
  return clamp01(0.5 + (coarse * 0.74 + fine * 0.26) * 0.62)
}

/** One octave of value noise in -1..1. */
function layer(seed: number, name: string, x: number): number {
  const k = Math.floor(x)
  const t = x - k
  const ease = (1 - Math.cos(t * Math.PI)) * 0.5
  const a = rngAt(seed, 'walk', name, k)() * 2 - 1
  const b = rngAt(seed, 'walk', name, k + 1)() * 2 - 1
  return a + (b - a) * ease
}
