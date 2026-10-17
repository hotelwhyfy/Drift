// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePlayer } from '@/ui/hooks/usePlayer.ts'
import { DEFAULT_MACROS } from '@/macros/macros.ts'
import type { EngineSnapshot } from '@/engine/types.ts'
import type { PlayerEvents } from '@/audio/player.ts'

/** What the stand-in Player below records about how it was made and used. */
interface FakePlayer {
  macros: unknown
  seed: number
  events: PlayerEvents
  dispose: () => void
}

const fakes = vi.hoisted(() => ({ instances: [] as FakePlayer[] }))

vi.mock('@/audio/player.ts', () => ({
  Player: class {
    dispose = vi.fn()
    constructor(public macros: unknown, public seed: number, public events: PlayerEvents) {
      fakes.instances.push(this)
    }
  },
}))

const latest = (): FakePlayer => {
  const fake = fakes.instances.at(-1)
  if (!fake) throw new Error('no player was made')
  return fake
}

const snapshot = (bar: number): EngineSnapshot => ({
  bar, barPhase: 0, chordDegree: 0, chordNotes: [], peak: 0, rms: 0, slots: [], macros: DEFAULT_MACROS,
  tempo: 70, modeName: 'dorian', rootMidi: 60, ended: false,
})

beforeEach(() => { fakes.instances.length = 0 })

describe('usePlayer', () => {
  it('starts one player from the dials and seed it is given', () => {
    renderHook(() => usePlayer(DEFAULT_MACROS, 42))
    expect(fakes.instances).toHaveLength(1)
    expect(latest().macros).toBe(DEFAULT_MACROS)
    expect(latest().seed).toBe(42)
  })

  it('keeps the same player across renders, ignoring later arguments', () => {
    const { result, rerender } = renderHook(({ seed }) => usePlayer(DEFAULT_MACROS, seed), { initialProps: { seed: 1 } })
    const first = result.current.player
    rerender({ seed: 2 })
    expect(result.current.player).toBe(first)
    expect(fakes.instances).toHaveLength(1)
    expect(latest().seed).toBe(1)
  })

  it('disposes the player when the page lets go of it', () => {
    const { unmount } = renderHook(() => usePlayer(DEFAULT_MACROS, 1))
    expect(latest().dispose).not.toHaveBeenCalled()
    unmount()
    expect(latest().dispose).toHaveBeenCalledTimes(1)
  })

  it('turns the player\'s reports into state', () => {
    const { result } = renderHook(() => usePlayer(DEFAULT_MACROS, 1))
    expect(result.current).toMatchObject({ playing: false, snapshot: null, captureProgress: null })

    act(() => { latest().events.onStateChange?.(true) })
    expect(result.current.playing).toBe(true)

    const shot = snapshot(3)
    act(() => { latest().events.onSnapshot?.(shot) })
    expect(result.current.snapshot).toBe(shot)

    act(() => { latest().events.onCaptureProgress?.(0.4) })
    expect(result.current.captureProgress).toBe(0.4)
  })

  it('forgets a snapshot on request, and lets a capture be cleared', () => {
    const { result } = renderHook(() => usePlayer(DEFAULT_MACROS, 1))
    act(() => { latest().events.onSnapshot?.(snapshot(3)) })
    act(() => { result.current.clearSnapshot() })
    expect(result.current.snapshot).toBeNull()

    act(() => { result.current.setCaptureProgress(0.9) })
    act(() => { result.current.setCaptureProgress(null) })
    expect(result.current.captureProgress).toBeNull()
  })

  it('offers the player on window in development, and takes it away again', () => {
    const { result, unmount } = renderHook(() => usePlayer(DEFAULT_MACROS, 1))
    expect(Reflect.get(window, '__drift')).toBe(result.current.player)
    unmount()
    expect(Reflect.get(window, '__drift')).toBeUndefined()
  })
})
