/**
 * Bjorklund's algorithm — distribute `pulses` as evenly as possible across
 * `steps`. Euclidean rhythms are the cheapest way to get patterns that feel
 * deliberate rather than random, and the whole traditional repertoire of
 * grooves falls out of a two-number pair.
 */
export function euclid(pulses: number, steps: number, rotate = 0): boolean[] {
  const n = Math.max(1, Math.floor(steps))
  const k = Math.max(0, Math.min(n, Math.floor(pulses)))
  const out = new Array<boolean>(n).fill(false)
  if (k === 0) return out
  // Bresenham form: equivalent to Bjorklund and far shorter.
  let bucket = 0
  for (let i = 0; i < n; i++) {
    bucket += k
    if (bucket >= n) {
      bucket -= n
      out[i] = true
    }
  }
  if (rotate === 0) return out
  const r = ((rotate % n) + n) % n
  return out.slice(r).concat(out.slice(0, r))
}
