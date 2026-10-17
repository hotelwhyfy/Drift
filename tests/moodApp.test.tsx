// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'
import { MoodApp } from '@/ui/mood/MoodApp.tsx'
import { interpret } from '@/mood/interpret.ts'
import { arrangementFor } from '@/mood/arrange.ts'
import { MACRO_KEYS } from '@/macros/macros.ts'
import type { Macros } from '@/macros/macros.ts'
import type { PlayerEvents } from '@/audio/player.ts'

/** What the stand-in Player records, and the hooks the test uses to play the audio engine's part. */
interface FakePlayer {
  events: PlayerEvents
  setMacros: ReturnType<typeof vi.fn<(m: Macros) => void>>
  setRack: ReturnType<typeof vi.fn<(s: unknown) => void>>
  reseed: ReturnType<typeof vi.fn<(seed: number) => void>>
  play: ReturnType<typeof vi.fn<(bar?: number) => Promise<void>>>
  stop: ReturnType<typeof vi.fn<() => void>>
  dispose: ReturnType<typeof vi.fn<() => void>>
}

const fakes = vi.hoisted(() => ({ instances: [] as FakePlayer[] }))

vi.mock('@/audio/player.ts', () => ({
  Player: class {
    setMacros = vi.fn()
    setRack = vi.fn()
    reseed = vi.fn()
    play = vi.fn(async () => {})
    stop = vi.fn()
    dispose = vi.fn()
    frequencyData = null
    sampleRate = 48000
    isPlaying = false
    constructor(_macros: unknown, _seed: number, public events: PlayerEvents) {
      fakes.instances.push(this)
    }
  },
}))

const player = (): FakePlayer => {
  const fake = fakes.instances.at(-1)
  if (!fake) throw new Error('no player was made')
  return fake
}

const ANSWER = 'tired and a bit sad'
const plan = () => arrangementFor(interpret(ANSWER))
const TICK = 1800

beforeEach(() => {
  fakes.instances.length = 0
  HTMLCanvasElement.prototype.getContext = () => null
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance'] })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function answer(): void {
  fireEvent.change(screen.getByRole('textbox'), { target: { value: ANSWER } })
  fireEvent.click(screen.getByRole('button', { name: 'Begin' }))
}

const advance = (ms: number): void => { act(() => { vi.advanceTimersByTime(ms) }) }
const settling = (): HTMLElement | null => document.querySelector('.mood-journey')
const barWidth = (): number => parseFloat(document.querySelector<HTMLElement>('.mood-journey-bar span')!.style.width)
const lastMacros = (): Macros => player().setMacros.mock.lastCall![0]

describe('MoodApp', () => {
  it('opens on the question and nothing else', () => {
    render(<MoodApp />)
    expect(screen.getByRole('heading', { level: 1 })).toBeTruthy()
    expect(screen.getByRole('textbox')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Play' })).toBeNull()
    expect(settling()).toBeNull()
  })

  it('sets the music going from the answer, and shows it settling', () => {
    render(<MoodApp />)
    answer()
    const expected = plan()
    expect(screen.getByText(`“${ANSWER}”`)).toBeTruthy()
    expect(player().reseed).toHaveBeenCalledWith(expected.seed)
    expect(player().setMacros).toHaveBeenCalledWith(expected.macros)
    expect(player().setRack).toHaveBeenCalledWith(expected.slots)
    expect(player().play).toHaveBeenCalledWith(0)
    expect(settling()).not.toBeNull()
    expect(screen.getByText('settling')).toBeTruthy()
    expect(barWidth()).toBe(0)
  })

  it('eases the dials toward somewhere calmer, a little each tick', () => {
    render(<MoodApp />)
    answer()
    const before = player().setMacros.mock.calls.length
    advance(TICK)
    expect(player().setMacros.mock.calls.length).toBe(before + 1)
    const first = barWidth()
    expect(first).toBeGreaterThan(0)

    advance(TICK * 5)
    expect(player().setMacros.mock.calls.length).toBe(before + 6)
    expect(barWidth()).toBeGreaterThan(first)
  })

  it('arrives, lets go of the dials and drops the bar', () => {
    render(<MoodApp />)
    answer()
    const { minutes, resting } = plan()
    advance(minutes * 60_000 + TICK)
    expect(settling()).toBeNull()
    MACRO_KEYS.forEach((key) => {
      expect(lastMacros()[key]).toBeCloseTo(resting[key], 10)
    })
    const calls = player().setMacros.mock.calls.length
    advance(TICK * 10)
    expect(player().setMacros.mock.calls.length).toBe(calls)
  })

  it('hands the dials over the moment one is touched', () => {
    render(<MoodApp />)
    answer()
    advance(TICK * 3)
    fireEvent.click(screen.getByRole('button', { name: 'open the desk' }))
    const dial = screen.getAllByRole('slider')[0]
    fireEvent.keyDown(dial, { key: 'ArrowUp' })

    expect(settling()).toBeNull()
    const calls = player().setMacros.mock.calls.length
    advance(TICK * 10)
    expect(player().setMacros.mock.calls.length).toBe(calls)
  })

  it('shows the real tempo and mode, and the desk on request', () => {
    render(<MoodApp />)
    answer()
    expect(document.querySelector('.desk')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'open the desk' }))
    expect(document.querySelector('.desk')).not.toBeNull()
    expect(document.querySelectorAll('.desk-dials [role=slider]')).toHaveLength(6)
    fireEvent.click(screen.getByRole('button', { name: 'put it away' }))
    expect(document.querySelector('.desk')).toBeNull()
    expect(document.querySelector('.mood-state')?.textContent).toMatch(/\d+ bpm/)
  })

  it('plays and pauses from the button, following what the player reports', () => {
    render(<MoodApp />)
    answer()
    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy()
    act(() => { player().events.onStateChange?.(true) })
    const pause = screen.getByRole('button', { name: 'Pause' })
    fireEvent.click(pause)
    expect(player().stop).toHaveBeenCalledTimes(1)
  })

  it('goes back to a question when asked again, and stops the music and the settling', () => {
    render(<MoodApp />)
    answer()
    advance(TICK)
    fireEvent.click(screen.getByRole('button', { name: 'ask me again' }))
    expect(player().stop).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('textbox')).toBeTruthy()
    expect(settling()).toBeNull()

    const calls = player().setMacros.mock.calls.length
    advance(TICK * 10)
    expect(player().setMacros.mock.calls.length).toBe(calls)
  })

  it('begins a fresh journey on the next answer', () => {
    render(<MoodApp />)
    answer()
    advance(TICK * 20)
    fireEvent.click(screen.getByRole('button', { name: 'ask me again' }))
    answer()
    expect(settling()).not.toBeNull()
    expect(barWidth()).toBe(0)
    expect(player().setMacros).toHaveBeenCalledWith(plan().macros)
  })

  it('disposes the player when it goes away', () => {
    const { unmount } = render(<MoodApp />)
    unmount()
    expect(player().dispose).toHaveBeenCalledTimes(1)
  })
})
