import { describe, it, expect } from 'vitest'
import { Engine } from '../src/engine/engine.ts'
import type { ScheduledEvent, SlotDesc } from '../src/engine/rack.ts'
import { Harmony } from '../src/compose/harmony.ts'
import { walkAt } from '../src/automation/walkAt.ts'
import { makeLane } from '../src/automation/lane.ts'
import type { Lane } from '../src/automation/lane.ts'
import { curveFromStroke } from '../src/automation/curve.ts'
import { buildPatch } from '../src/macros/patch.ts'
import { DEFAULT_MACROS } from '../src/macros/macros.ts'

const SR = 24000

/** The default rack, with automation that moves: a drawn curve and a walk. */
function automatedRack(engine: Engine): SlotDesc[] {
  return engine.rack.describe().map((slot, i) => {
    if (i === 0) {
      const drawn = makeLane(`${slot.id}-drawn`, { kind: 'expression', key: 'density' })
      const walk = makeLane(`${slot.id}-walk`, { kind: 'expression', key: 'motion' })
      return {
        ...slot,
        lanes: [
          {
            ...drawn,
            bars: 3,
            source: { kind: 'curve', curve: curveFromStroke([{ x: 0, y: 0 }, { x: 0.5, y: 1 }, { x: 1, y: 0.2 }]) },
          },
          { ...walk, source: { kind: 'walk', smoothness: 0.4, seed: 77 } },
        ],
      }
    }
    if (slot.defId === 'rhodes') {
      const walk = makeLane(`${slot.id}-walk`, { kind: 'param', param: 'rate' })
      return { ...slot, lanes: [{ ...walk, source: { kind: 'walk', smoothness: 0.2, seed: 5 } }] }
    }
    return slot
  })
}

function engineWithRack(seed = 31): Engine {
  const e = new Engine(SR, DEFAULT_MACROS, seed)
  e.snapMacros(DEFAULT_MACROS)
  e.rack.sync(automatedRack(e))
  return e
}

/** Render until the engine crosses into the next bar. */
function finishBar(e: Engine): void {
  const start = e.snapshot().bar
  const l = new Float32Array(1024)
  const r = new Float32Array(1024)
  while (e.snapshot().bar === start) e.render(l, r, l.length)
}

function barsOfEvents(e: Engine, count: number): ScheduledEvent[][] {
  const out: ScheduledEvent[][] = []
  for (let i = 0; i < count; i++) {
    out.push(e.barEvents.map((ev) => ({ ...ev })))
    finishBar(e)
  }
  return out
}

describe('seeking', () => {
  it('schedules the same bars whether played to or seeked to', () => {
    // The central promise, now under automation: bar N's notes may not depend
    // on how playback got there.
    const N = 7
    const played = engineWithRack()
    // Re-sync after construction so the lanes are live from bar 0, then
    // restart there — the rack changed after bar 0 was already scheduled.
    played.seek(0)
    for (let i = 0; i < N; i++) finishBar(played)
    expect(played.snapshot().bar).toBe(N)

    const seeked = engineWithRack()
    seeked.seek(N)
    expect(seeked.snapshot().bar).toBe(N)

    const a = barsOfEvents(played, 4)
    const b = barsOfEvents(seeked, 4)
    expect(b).toEqual(a)
    expect(a.flat().length).toBeGreaterThan(0)
  })

  it('renders the same audio every time it seeks to the same place', () => {
    const render = (): Float32Array => {
      const e = engineWithRack()
      e.seek(5, { preroll: 1 })
      const l = new Float32Array(SR * 2)
      e.render(l, new Float32Array(SR * 2), SR * 2)
      return l
    }
    expect(Array.from(render())).toEqual(Array.from(render()))
  })

  it('arrives exactly on the bar it was asked for, after a preroll', () => {
    const e = engineWithRack()
    e.seek(9, { preroll: 2 })
    const s = e.snapshot()
    expect(s.bar).toBe(9)
    expect(s.barPhase).toBe(0)
  })

  it('is indifferent to buffer sizes even with a lane following the level', () => {
    // Follow lanes used to read the interface's meter, which only moved when
    // a snapshot was taken — so playback (which snapshots every chunk) and
    // capture (which never does) heard different automation.
    const frames = SR * 3
    const build = (): Engine => {
      const e = new Engine(SR, DEFAULT_MACROS, 12)
      e.snapMacros(DEFAULT_MACROS)
      const slots = e.rack.describe().map((slot) => {
        if (slot.defId !== 'pad') return slot
        const lane: Lane = {
          ...makeLane(`${slot.id}-follow`, { kind: 'level' }),
          source: { kind: 'follow', of: 'level' },
          mode: 'scale',
        }
        return { ...slot, lanes: [lane] }
      })
      e.rack.sync(slots)
      return e
    }
    const capture = build()
    const whole = new Float32Array(frames)
    for (let done = 0; done < frames; done += SR * 2) {
      const n = Math.min(SR * 2, frames - done)
      capture.render(whole.subarray(done, done + n), new Float32Array(n), n)
    }

    const playback = build()
    const chunked = new Float32Array(frames)
    const chunk = Math.floor(SR * 0.12)
    for (let done = 0; done < frames; done += chunk) {
      const n = Math.min(chunk, frames - done)
      playback.render(chunked.subarray(done, done + n), new Float32Array(n), n)
      playback.snapshot()
    }
    expect(Array.from(chunked)).toEqual(Array.from(whole))
  })
})

describe('harmony by bar', () => {
  const slow = { ...buildPatch(DEFAULT_MACROS).compose, chordBars: 8 }
  const fast = { ...slow, chordBars: 2 }
  const settingsAt = (bar: number) => (bar < 24 ? slow : fast)

  it('gives the same chord at a bar however it was reached', () => {
    const walked = new Harmony(4)
    const byBar: number[][] = []
    for (let bar = 0; bar < 60; bar++) byBar.push([...walked.at(bar, settingsAt).notes])
    for (const bar of [0, 7, 8, 23, 24, 25, 41, 59]) {
      const fresh = new Harmony(4)
      expect([...fresh.at(bar, settingsAt).notes]).toEqual(byBar[bar])
    }
    // Backwards, too.
    expect([...walked.at(10, settingsAt).notes]).toEqual(byBar[10])
  })

  it('only changes chord on a phrase line of the current chord length', () => {
    const h = new Harmony(8)
    let previous = h.at(0, settingsAt).degree
    for (let bar = 1; bar < 60; bar++) {
      const degree = h.at(bar, settingsAt).degree
      if (degree !== previous) {
        expect(bar % settingsAt(bar).chordBars).toBe(0)
      }
      previous = degree
    }
  })
})

describe('the walk', () => {
  it('is a function of position alone', () => {
    const forward = Array.from({ length: 200 }, (_, i) => walkAt(3, 0.6, i * 0.137))
    const backward = Array.from({ length: 200 }, (_, i) => walkAt(3, 0.6, (199 - i) * 0.137)).reverse()
    expect(backward).toEqual(forward)
  })

  it('stays in range and actually moves', () => {
    let min = 1
    let max = 0
    for (let i = 0; i < 2000; i++) {
      const v = walkAt(9, 0.5, i * 0.05)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
      min = Math.min(min, v)
      max = Math.max(max, v)
    }
    expect(max - min).toBeGreaterThan(0.3)
  })
})
