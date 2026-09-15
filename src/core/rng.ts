/**
 * Seeded randomness. The engine never calls Math.random: every random value
 * derives from stable musical coordinates (bar index, voice name, note slot),
 * so bar 4000 sounds the same whether you arrived there by playing for an hour
 * or by seeking straight to it. That is what makes an endless stream
 * capturable — an export re-renders the same music you just heard.
 */
export type Rng = () => number

/** mulberry32 — small, fast, good enough for musical decisions. */
export function createRng(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** FNV-1a over the string form of each part, so seeds read as coordinates. */
export function deriveSeed(...parts: (number | string)[]): number {
  let h = 2166136261 >>> 0
  for (let p = 0; p < parts.length; p++) {
    const s = String(parts[p])
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i)
      h = Math.imul(h, 16777619) >>> 0
    }
    h ^= 0x2c // separator, so ('a','bc') and ('ab','c') differ
    h = Math.imul(h, 16777619) >>> 0
  }
  return h >>> 0
}

/** A seeded generator keyed to a coordinate. The workhorse of the composer. */
export function rngAt(...parts: (number | string)[]): Rng {
  return createRng(deriveSeed(...parts))
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))]
}

/** Choose an index by weight. Weights need not sum to 1. */
export function pickWeighted(rng: Rng, weights: readonly number[]): number {
  let total = 0
  for (let i = 0; i < weights.length; i++) total += Math.max(0, weights[i])
  if (total <= 0) return 0
  let r = rng() * total
  for (let i = 0; i < weights.length; i++) {
    r -= Math.max(0, weights[i])
    if (r <= 0) return i
  }
  return weights.length - 1
}

export function range(rng: Rng, lo: number, hi: number): number {
  return lo + rng() * (hi - lo)
}

/** Triangular distribution — clusters near the middle, for humanising. */
export function centred(rng: Rng, spread: number): number {
  return (rng() + rng() - 1) * spread
}
