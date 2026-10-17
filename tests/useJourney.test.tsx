// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useJourney } from '@/ui/hooks/useJourney.ts'
import { DEFAULT_MACROS } from '@/macros/macros.ts'
import type { Macros } from '@/macros/macros.ts'

const TICK = 1800
const FROM: Macros = { ...DEFAULT_MACROS, space: 0.2, warmth: 0.9 }
const TO: Macros = { ...DEFAULT_MACROS, space: 0.8, warmth: 0.1 }
const MINUTE = 60_000

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] })
})

afterEach(() => { vi.useRealTimers() })

function setup(active = true) {
  const onStep = vi.fn<(m: Macros) => void>()
  const hook = renderHook(({ active: a, step }) => useJourney(a, step), { initialProps: { active, step: onStep } })
  const advance = (ms: number): void => { act(() => { vi.advanceTimersByTime(ms) }) }
  const begin = (minutes = 1): void => { act(() => { hook.result.current.begin(FROM, TO, minutes) }) }
  return { onStep, advance, begin, ...hook }
}

describe('useJourney', () => {
  it('is idle until it is begun', () => {
    const { result, onStep, advance } = setup()
    expect(result.current).toMatchObject({ steering: false, progress: 0 })
    advance(TICK * 5)
    expect(onStep).not.toHaveBeenCalled()
  })

  it('begins steering from the start of the journey', () => {
    const { result, begin } = setup()
    begin()
    expect(result.current).toMatchObject({ steering: true, progress: 0 })
  })

  it('moves the dials a little at each tick, towards where it is going', () => {
    const { result, onStep, advance, begin } = setup()
    begin(2)
    advance(TICK)
    expect(onStep).toHaveBeenCalledTimes(1)
    expect(result.current.progress).toBeCloseTo(TICK / (2 * MINUTE), 6)

    advance(TICK * 9)
    expect(onStep).toHaveBeenCalledTimes(10)
    const mid = onStep.mock.lastCall![0]
    expect(mid.space).toBeGreaterThanOrEqual(FROM.space)
    expect(mid.space).toBeLessThan(TO.space)
    expect(mid.warmth).toBeLessThanOrEqual(FROM.warmth)
    expect(mid.warmth).toBeGreaterThan(TO.warmth)
  })

  it('takes at least a minute, however short a journey it was asked for', () => {
    const { result, advance, begin } = setup()
    begin(0.1)
    advance(30_000)
    expect(result.current.progress).toBeCloseTo(0.5, 1)
    expect(result.current.steering).toBe(true)
  })

  it('arrives at the destination, then lets go and stops', () => {
    const { result, onStep, advance, begin } = setup()
    begin(1)
    advance(MINUTE + TICK)
    expect(result.current.steering).toBe(false)
    expect(result.current.progress).toBe(1)
    const last = onStep.mock.lastCall![0]
    expect(last.space).toBeCloseTo(TO.space, 10)
    expect(last.warmth).toBeCloseTo(TO.warmth, 10)
    const calls = onStep.mock.calls.length
    advance(TICK * 10)
    expect(onStep.mock.calls.length).toBe(calls)
  })

  it('stops the moment it is taken over, and takes over only once', () => {
    const { result, onStep, advance, begin } = setup()
    begin()
    advance(TICK * 2)
    act(() => { result.current.takeOver() })
    expect(result.current.steering).toBe(false)
    const calls = onStep.mock.calls.length
    advance(TICK * 10)
    expect(onStep.mock.calls.length).toBe(calls)
    act(() => { result.current.takeOver() })
    expect(result.current.steering).toBe(false)
  })

  it('has nothing to take over before it begins', () => {
    const { result } = setup()
    act(() => { result.current.takeOver() })
    expect(result.current.steering).toBe(false)
  })

  it('forgets the journey when stopped', () => {
    const { result, onStep, advance, begin } = setup()
    begin()
    advance(TICK)
    act(() => { result.current.stop() })
    expect(result.current.steering).toBe(false)
    const calls = onStep.mock.calls.length
    advance(TICK * 10)
    expect(onStep.mock.calls.length).toBe(calls)
  })

  it('starts over from the beginning when begun again', () => {
    const { result, advance, begin } = setup()
    begin(1)
    advance(TICK * 10)
    expect(result.current.progress).toBeGreaterThan(0.2)
    begin(1)
    expect(result.current).toMatchObject({ steering: true, progress: 0 })
    advance(TICK)
    expect(result.current.progress).toBeCloseTo(TICK / MINUTE, 6)
  })

  it('does not step while it is not active, and carries on when it is again', () => {
    const { result, onStep, advance, begin, rerender } = setup(true)
    begin()
    rerender({ active: false, step: onStep })
    advance(TICK * 5)
    expect(onStep).not.toHaveBeenCalled()
    expect(result.current.steering).toBe(true)

    rerender({ active: true, step: onStep })
    advance(TICK)
    expect(onStep).toHaveBeenCalledTimes(1)
  })

  it('reports to the latest step function', () => {
    const first = vi.fn<(m: Macros) => void>()
    const second = vi.fn<(m: Macros) => void>()
    const { result, rerender } = renderHook(({ step }) => useJourney(true, step), { initialProps: { step: first } })
    act(() => { result.current.begin(FROM, TO, 1) })
    rerender({ step: second })
    act(() => { vi.advanceTimersByTime(TICK) })
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('stops its timer when it goes away', () => {
    const { onStep, advance, begin, unmount } = setup()
    begin()
    unmount()
    advance(TICK * 5)
    expect(onStep).not.toHaveBeenCalled()
  })
})
