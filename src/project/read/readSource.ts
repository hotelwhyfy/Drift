import type { LaneSource } from '@/automation/lane.ts'
import { curveFromPoints, flatCurve } from '@/automation/curve.ts'
import { readNumber } from '@/project/read/readNumber.ts'
import { readEnvelope } from '@/project/read/readEnvelope.ts'
import { MAX_LANE_BARS } from '@/project/constants.ts'

export function readSource(raw: unknown): LaneSource {
  if (typeof raw === 'object' && raw !== null) {
    const record: Record<string, unknown> = { ...raw }
    if (record.kind === 'curve' && Array.isArray(record.points)) {
      const points = record.points.map((p) => (typeof p === 'number' ? p : 0.5))
      return { kind: 'curve', curve: curveFromPoints(points) }
    }
    if (record.kind === 'walk') {
      return {
        kind: 'walk',
        smoothness: readNumber(record.smoothness, 0.7),
        seed: readNumber(record.seed, 1, 0, Number.MAX_SAFE_INTEGER),
      }
    }
    if (record.kind === 'lfo') {
      const shapes = ['sine', 'triangle', 'ramp', 'square'] as const
      const shape = shapes.find((s) => s === record.shape) ?? 'sine'
      return { kind: 'lfo', shape, bars: readNumber(record.bars, 4, 0.25, MAX_LANE_BARS), phase: readNumber(record.phase, 0) }
    }
    if (record.kind === 'follow') {
      return { kind: 'follow', of: record.of === 'level' ? 'level' : 'kick' }
    }
    if (record.kind === 'song') {
      return { kind: 'song', envelope: readEnvelope(record.points) }
    }
  }
  return { kind: 'curve', curve: flatCurve(0.5) }
}
