import { MAX_SONG_BARS, BREAKPOINT_SHAPES } from '@/song/song.ts'
import type { Envelope, Breakpoint } from '@/song/types.ts'

/**
 * Breakpoints, stored as `[bar, value, shape]`. Anything unreadable is dropped,
 * the rest is clamped and sorted, and two points on the same bar keep the later
 * one — the order a person editing the file by hand would expect to win.
 */
export function readEnvelope(raw: unknown): Envelope {
  if (!Array.isArray(raw)) return { points: [] }
  const points: Breakpoint[] = []
  for (const entry of raw) {
    const fields: unknown[] = Array.isArray(entry)
      ? entry
      : typeof entry === 'object' && entry !== null
        ? [Reflect.get(entry, 'bar'), Reflect.get(entry, 'value'), Reflect.get(entry, 'shape')]
        : []
    const [bar, value, shape] = fields
    if (typeof bar !== 'number' || !Number.isFinite(bar)) continue
    if (typeof value !== 'number' || !Number.isFinite(value)) continue
    points.push({
      bar: Math.min(MAX_SONG_BARS, Math.max(0, bar)),
      value: Math.min(1, Math.max(0, value)),
      shape: BREAKPOINT_SHAPES.find((s) => s === shape) ?? 'linear',
    })
  }
  points.sort((a, b) => a.bar - b.bar)
  const unique: Breakpoint[] = []
  for (const p of points) {
    if (unique.length > 0 && unique[unique.length - 1].bar === p.bar) unique[unique.length - 1] = p
    else unique.push(p)
  }
  return { points: unique }
}
