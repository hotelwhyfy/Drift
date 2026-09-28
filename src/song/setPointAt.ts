import type { Envelope, Breakpoint } from './song.ts'

/**
 * Write a value into an envelope at a bar: move the point already there (or
 * within `reach` bars of it), or add one. This is what turning a dial the
 * song is driving does — and done while playing, a drag leaves a trail of
 * points behind the playhead, which is recording automation by hand.
 */
export function setPointAt(env: Envelope, bar: number, value: number, reach = 0.2): Envelope {
  const v = Math.min(1, Math.max(0, value))
  const at = Math.max(0, bar)
  let nearest = -1
  let best = reach
  env.points.forEach((p, i) => {
    const d = Math.abs(p.bar - at)
    if (d <= best) {
      best = d
      nearest = i
    }
  })
  if (nearest >= 0) {
    return { points: env.points.map((p, i) => (i === nearest ? { ...p, value: v } : p)) }
  }
  const before = [...env.points].reverse().find((p) => p.bar < at)
  const point: Breakpoint = { bar: at, value: v, shape: before?.shape ?? 'linear' }
  return { points: [...env.points, point].sort((a, b) => a.bar - b.bar) }
}
