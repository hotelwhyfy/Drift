import type { Envelope } from './song.ts'

/**
 * An envelope's value at a bar. Before the first point it holds the first
 * value, after the last it holds the last, so a song that runs past its final
 * point carries on where it was left rather than snapping somewhere.
 *
 * Binary search, because this runs at control rate against envelopes that may
 * hold thousands of points.
 */
export function sampleEnvelope(env: Envelope, bar: number): number {
  const pts = env.points
  const n = pts.length
  if (n === 0) return 0.5
  if (bar <= pts[0].bar) return pts[0].value
  if (bar >= pts[n - 1].bar) return pts[n - 1].value
  let lo = 0
  let hi = n - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (pts[mid].bar <= bar) lo = mid
    else hi = mid
  }
  const a = pts[lo]
  const b = pts[hi]
  const span = b.bar - a.bar
  if (span <= 0 || a.shape === 'step') return a.value
  const t = (bar - a.bar) / span
  const eased = a.shape === 'smooth' ? t * t * (3 - 2 * t) : t
  return a.value + (b.value - a.value) * eased
}
