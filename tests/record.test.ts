import { describe, it, expect } from 'vitest'
import { LaneEvaluator, makeLane } from '@/automation/lane.ts'
import type { Lane, LaneMode } from '@/automation/lane.ts'
import { invertLane } from '@/automation/invertLane.ts'
import { songLaneFor } from '@/automation/songLaneFor.ts'
import type { SongLane } from '@/automation/songLaneFor.ts'
import { recordInto } from '@/automation/recordInto.ts'
import { drivenValue } from '@/automation/drivenValue.ts'
import type { Breakpoint } from '@/song/types.ts'

const lanes = new LaneEvaluator()

/** One point by default: an empty timeline lane drives nothing. */
const ONE_POINT: Breakpoint[] = [{ bar: 0, value: 0.5, shape: 'linear' }]

function songLane(id: string, points: Breakpoint[] = ONE_POINT, patch: Partial<Lane> = {}): Lane {
  return { ...makeLane(id, { kind: 'level' }), source: { kind: 'song', envelope: { points } }, ...patch }
}

function driver(lane: Lane): SongLane {
  const found = songLaneFor([lane], () => true)
  if (!found) throw new Error('expected a driving lane')
  return found
}

describe('invertLane', () => {
  const modes: LaneMode[] = ['set', 'add', 'scale']
  it('runs a lane backwards, so applying the result lands on the target', () => {
    for (const mode of modes) {
      for (const depth of [0.25, 0.5, 1]) {
        for (const base of [0.2, 0.5, 0.8]) {
          for (const target of [0.1, 0.4, 0.6, 0.9]) {
            const lane = { mode, depth }
            const v = invertLane(lane, base, target)
            expect(v).toBeGreaterThanOrEqual(0)
            expect(v).toBeLessThanOrEqual(1)
            const reached = lanes.apply(base, v, { ...makeLane('x', { kind: 'level' }), mode, depth })
            // Unreachable at this depth: clamped, so it gets as close as it can.
            if (v > 0 && v < 1) expect(reached).toBeCloseTo(target, 9)
            else expect(Math.abs(reached - target)).toBeLessThanOrEqual(Math.abs(base - target) + 1e-9)
          }
        }
      }
    }
  })

  it('does not divide by zero at no depth', () => {
    expect(Number.isFinite(invertLane({ mode: 'set', depth: 0 }, 0.3, 0.7))).toBe(true)
  })
})

describe('songLaneFor', () => {
  it('only lets an enabled timeline lane with depth and a point drive a control', () => {
    const loop = makeLane('loop', { kind: 'level' })
    const off = songLane('off', ONE_POINT, { enabled: false })
    const flat = songLane('flat', ONE_POINT, { depth: 0 })
    const empty = songLane('empty', [])
    expect(songLaneFor([loop, off, flat, empty], () => true)).toBeUndefined()
  })

  it('picks the last match, the lane with the final say', () => {
    const found = songLaneFor([songLane('a'), songLane('b')], (t) => t.kind === 'level')
    expect(found?.id).toBe('b')
  })

  it('matches on the target', () => {
    const param = songLane('p', ONE_POINT, { target: { kind: 'param', param: 'tone' } })
    expect(songLaneFor([param], (t) => t.kind === 'level')).toBeUndefined()
    expect(songLaneFor([param], (t) => t.kind === 'param' && t.param === 'tone')?.id).toBe('p')
  })
})

describe('recordInto', () => {
  it('writes at the playhead, snapped to a quarter bar', () => {
    const lane = songLane('a')
    const [next] = recordInto([lane], driver(lane), 0.8, 0.3, 4.13)
    expect(next.source.kind === 'song' && next.source.envelope.points).toEqual([...ONE_POINT, { bar: 4.25, value: 0.3, shape: 'linear' }])
  })

  it('moves a point already there rather than adding another', () => {
    const lane = songLane('a', [{ bar: 2, value: 0.5, shape: 'smooth' }])
    const [next] = recordInto([lane], driver(lane), 0.8, 0.9, 2.05)
    expect(next.source.kind === 'song' && next.source.envelope.points).toEqual([{ bar: 2, value: 0.9, shape: 'smooth' }])
  })

  it('leaves the other lanes, and the lane’s own mode and depth, alone', () => {
    const other = makeLane('loop', { kind: 'level' })
    const lane = songLane('a', ONE_POINT, { mode: 'add', depth: 0.5 })
    const next = recordInto([other, lane], driver(lane), 0.4, 0.6, 1)
    expect(next[0]).toBe(other)
    expect(next[1].mode).toBe('add')
    expect(next[1].depth).toBe(0.5)
  })

  it('records a value the lane then plays back', () => {
    const lane = songLane('a', ONE_POINT, { mode: 'set', depth: 0.5 })
    const [next] = recordInto([lane], driver(lane), 0.4, 0.55, 3)
    expect(drivenValue(driver(next), 0.4, 3)).toBeCloseTo(0.55, 9)
  })
})
