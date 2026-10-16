import { MAX_SONG_BARS, BREAKPOINT_SHAPES } from '@/song/song.ts'
import type { Envelope, Breakpoint } from '@/song/types.ts'

/**
 * Breakpoints, stored as `[bar, value, shape]`. Anything unreadable is dropped,
 * the rest is clamped and sorted, and two points on the same bar keep the later
 * one — the order a person editing the file by hand would expect to win.
 */
export function readEnvelope(raw: unknown): Envelope {
  if (!Array.isArray(raw)) return { points: [] }
  const points = raw.flatMap((entry): Breakpoint[] => {
    const fields: unknown[] = Array.isArray(entry)
      ? entry
      : typeof entry === 'object' && entry !== null
        ? [Reflect.get(entry, 'bar'), Reflect.get(entry, 'value'), Reflect.get(entry, 'shape')]
        : []
    const [bar, value, shape] = fields
    if (typeof bar !== 'number' || !Number.isFinite(bar)) return []
    if (typeof value !== 'number' || !Number.isFinite(value)) return []
    return [{
      bar: Math.min(MAX_SONG_BARS, Math.max(0, bar)),
      value: Math.min(1, Math.max(0, value)),
      shape: BREAKPOINT_SHAPES.find((s) => s === shape) ?? 'linear',
    }]
  }).sort((a, b) => a.bar - b.bar)
  // Of several points on one bar, the last survives.
  return { points: points.filter((p, i) => i === points.length - 1 || points[i + 1].bar !== p.bar) }
}
