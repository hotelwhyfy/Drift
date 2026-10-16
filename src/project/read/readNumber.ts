export const readNumber = (v: unknown, fallback: number, lo = 0, hi = 1): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback
