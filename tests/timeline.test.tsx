// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'
import type { ReactNode } from 'react'
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react'
import { Timeline } from '@/ui/Timeline.tsx'
import type { BarScale } from '@/ui/barScale.ts'
import { formatDuration } from '@/ui/formatDuration.ts'
import { defaultSlots } from '@/ui/defaultSlots.ts'
import { controlsOf } from '@/instruments/controlsOf.ts'
import { instrumentById } from '@/instruments/registry.ts'
import { DEFAULT_SONG, MAX_SONG_BARS } from '@/song/song.ts'
import { songSeconds } from '@/song/songSeconds.ts'
import { DEFAULT_MACROS } from '@/macros/macros.ts'
import { makeLane } from '@/automation/lane.ts'
import type { Lane } from '@/automation/lane.ts'
import type { Song, MacroTrack } from '@/song/types.ts'
import type { SlotDesc } from '@/engine/types.ts'

/** The lane track is this wide in every test, so 800 px shows 80 bars at the default zoom. */
const TRACK_WIDTH = 800

beforeAll(() => {
  // jsdom lays nothing out, draws no canvas and has no ResizeObserver.
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get(this: HTMLElement) { return this.classList.contains('tl-track') ? TRACK_WIDTH : 0 },
  })
  HTMLCanvasElement.prototype.getContext = () => null
  Element.prototype.scrollIntoView = () => {}
  Element.prototype.setPointerCapture = () => {}
  Element.prototype.releasePointerCapture = () => {}
  const rect = (): DOMRect => ({ left: 0, top: 0, width: TRACK_WIDTH, height: 24, right: TRACK_WIDTH, bottom: 24, x: 0, y: 0, toJSON: () => ({}) })
  Element.prototype.getBoundingClientRect = rect
  globalThis.ResizeObserver = class implements ResizeObserver {
    constructor(private readonly callback: ResizeObserverCallback) {}
    observe(): void { this.callback([], this) }
    unobserve(): void {}
    disconnect(): void {}
  }
})

afterEach(cleanup)

const ACCENT = '#aabbcc'

const songLane = (id: string, target: Lane['target'], points = [{ bar: 0, value: 0.5, shape: 'linear' as const }]): Lane => ({
  ...makeLane(id, target),
  source: { kind: 'song', envelope: { points } },
})

const track = (value = 0.5, enabled = true): MacroTrack =>
  ({ enabled, envelope: { points: [{ bar: 0, value, shape: 'linear' }] } })

interface Seen { scale: BarScale | null, width: number }

function setup(overrides: Partial<Parameters<typeof Timeline>[0]> = {}) {
  const onSongChange = vi.fn<(song: Song) => void>()
  const onSlotsChange = vi.fn<(slots: SlotDesc[]) => void>()
  const onSeek = vi.fn<(bar: number) => void>()
  const seen: Seen = { scale: null, width: -1 }
  const props = {
    song: DEFAULT_SONG,
    dials: DEFAULT_MACROS,
    slots: defaultSlots(),
    playhead: 0,
    playing: false,
    accent: ACCENT,
    autoTuning: 440,
    onSongChange, onSlotsChange, onSeek,
    children: (scale: BarScale, width: number) => { seen.scale = scale; seen.width = width; return null },
    ...overrides,
  }
  const view = render(<Timeline {...props} />)
  const ruler = (): HTMLCanvasElement => view.container.querySelector<HTMLCanvasElement>('.tl-ruler')!
  const scale = (): BarScale => seen.scale!
  const lastSong = (): Song => onSongChange.mock.lastCall![0]
  const lastSlots = (): SlotDesc[] => onSlotsChange.mock.lastCall![0]
  return { ...view, ...props, props, onSongChange, onSlotsChange, onSeek, seen, ruler, scale, lastSong, lastSlots }
}

describe('Timeline song settings', () => {
  it('shows the length and how long it plays for', () => {
    setup()
    const input = screen.getByLabelText('Song length in bars')
    expect((input as HTMLInputElement).value).toBe('64')
    expect(screen.getByText(`bars · ${formatDuration(songSeconds(DEFAULT_SONG, DEFAULT_MACROS))}`)).toBeTruthy()
  })

  it('commits a typed length on blur and on Enter, kept within 1 and the maximum', () => {
    const { onSongChange, lastSong } = setup()
    const input = screen.getByLabelText('Song length in bars')

    fireEvent.change(input, { target: { value: '100' } })
    expect(onSongChange).not.toHaveBeenCalled()
    expect((input as HTMLInputElement).value).toBe('100')
    fireEvent.blur(input)
    expect(lastSong().lengthBars).toBe(100)

    fireEvent.change(input, { target: { value: '0' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(lastSong().lengthBars).toBe(1)

    fireEvent.change(input, { target: { value: '99999' } })
    fireEvent.blur(input)
    expect(lastSong().lengthBars).toBe(MAX_SONG_BARS)
  })

  it('adds sixteen bars, up to the maximum', () => {
    const first = setup()
    fireEvent.click(screen.getByRole('button', { name: '+16' }))
    expect(first.lastSong().lengthBars).toBe(80)
    cleanup()

    const second = setup({ song: { ...DEFAULT_SONG, lengthBars: MAX_SONG_BARS - 3 } })
    fireEvent.click(screen.getByRole('button', { name: '+16' }))
    expect(second.lastSong().lengthBars).toBe(MAX_SONG_BARS)
  })

  it('sets what happens at the end and marks the current choice', () => {
    const { lastSong } = setup({ song: { ...DEFAULT_SONG, end: 'loop' } })
    const buttons = within(screen.getByRole('group', { name: 'At the end' })).getAllByRole('button')
    expect(buttons.map((b) => b.textContent)).toEqual(['loop', 'hold', 'stop'])
    expect(buttons.map((b) => b.className)).toEqual(['on', '', ''])
    fireEvent.click(buttons[2])
    expect(lastSong().end).toBe('stop')
    expect(lastSong().lengthBars).toBe(64)
  })

  it('commits a typed A4, rounded to a tenth and held to the allowed range', () => {
    const { lastSong } = setup({ autoTuning: 438.4 })
    const input = screen.getByLabelText('Reference pitch for A4 in hertz') as HTMLInputElement
    expect(input.placeholder).toBe('438.4')
    expect(input.value).toBe('')
    expect(screen.getByText('Hz · auto')).toBeTruthy()

    fireEvent.change(input, { target: { value: '441.26' } })
    fireEvent.blur(input)
    expect(lastSong().tuning).toBe(441.3)

    fireEvent.change(input, { target: { value: '999' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(lastSong().tuning).toBe(480)

    fireEvent.change(input, { target: { value: '12' } })
    fireEvent.blur(input)
    expect(lastSong().tuning).toBe(400)
  })

  it('hands the reference back to the dials when A4 is emptied', () => {
    const { lastSong } = setup({ song: { ...DEFAULT_SONG, tuning: 432 } })
    const input = screen.getByLabelText('Reference pitch for A4 in hertz') as HTMLInputElement
    expect(input.value).toBe('432')
    expect(screen.getByText('Hz')).toBeTruthy()
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.blur(input)
    expect(lastSong().tuning).toBeNull()
  })
})

describe('Timeline view', () => {
  it('starts at ten pixels a bar from the first bar, as wide as its tracks', () => {
    const { scale, seen } = setup()
    expect(scale().pxPerBar).toBe(10)
    expect(scale().startBar).toBe(0)
    expect(seen.width).toBe(TRACK_WIDTH)
  })

  it('zooms in and out in steps, within limits', () => {
    const { scale } = setup()
    fireEvent.click(screen.getByLabelText('Zoom in'))
    expect(scale().pxPerBar).toBeCloseTo(15, 10)
    fireEvent.click(screen.getByLabelText('Zoom out'))
    fireEvent.click(screen.getByLabelText('Zoom out'))
    expect(scale().pxPerBar).toBeCloseTo(10 / 1.5, 10)

    for (let i = 0; i < 30; i++) fireEvent.click(screen.getByLabelText('Zoom in'))
    expect(scale().pxPerBar).toBe(96)
    for (let i = 0; i < 40; i++) fireEvent.click(screen.getByLabelText('Zoom out'))
    expect(scale().pxPerBar).toBe(1)
  })

  it('fits the whole song in the width, from the start', () => {
    const { scale } = setup()
    fireEvent.click(screen.getByLabelText('Zoom in'))
    fireEvent.click(screen.getByRole('button', { name: 'fit' }))
    expect(scale().pxPerBar).toBeCloseTo(TRACK_WIDTH / 65, 10)
    expect(scale().startBar).toBe(0)
  })

  it('scrolls sideways with the wheel and stops following the playhead', () => {
    const { scale, container } = setup()
    const follow = screen.getByRole('button', { name: 'follow' })
    expect(follow.className).toContain('on')

    fireEvent.wheel(container.querySelector('.tl-rows')!, { deltaX: 100 })
    expect(scale().startBar).toBe(10)
    expect(follow.className).not.toContain('on')

    fireEvent.wheel(container.querySelector('.tl-rows')!, { deltaY: 50, shiftKey: true })
    expect(scale().startBar).toBe(15)

    fireEvent.wheel(container.querySelector('.tl-rows')!, { deltaX: -10000 })
    expect(scale().startBar).toBe(0)
  })

  it('ignores a plain vertical wheel, leaving the page to scroll', () => {
    const { scale, container } = setup()
    fireEvent.wheel(container.querySelector('.tl-rows')!, { deltaY: 120 })
    expect(scale().startBar).toBe(0)
    expect(screen.getByRole('button', { name: 'follow' }).className).toContain('on')
  })

  it('zooms about the pointer with Ctrl and the wheel, keeping the bar under it still', () => {
    const { scale, container } = setup()
    const rows = container.querySelector('.tl-rows')!
    fireEvent.wheel(rows, { deltaY: -400, ctrlKey: true, clientX: 100 })
    const next = 10 * Math.exp(400 * 0.0025)
    expect(scale().pxPerBar).toBeCloseTo(next, 8)
    expect(scale().startBar).toBeCloseTo(100 / 10 - 100 / next, 8)
    // The bar that was under x = 100 still is.
    expect(scale().toBar(100)).toBeCloseTo(10, 8)
  })

  it('pages to keep the playhead in view while playing, unless following is off', () => {
    const idle = setup({ playhead: 100, playing: false })
    expect(idle.scale().startBar).toBe(0)
    cleanup()

    const moving = setup({ playhead: 100, playing: true })
    // 800 px at 10 px a bar shows 80 bars; the playhead lands 8% in.
    expect(moving.scale().startBar).toBeCloseTo(100 - 80 * 0.08, 10)
    cleanup()

    const inView = setup({ playhead: 40, playing: true })
    expect(inView.scale().startBar).toBe(0)
    cleanup()

    const away = setup({ playhead: 0, playing: true })
    fireEvent.wheel(away.container.querySelector('.tl-rows')!, { deltaX: 50 })
    away.rerender(<Timeline {...away.props} playhead={500} playing />)
    expect(away.scale().startBar).toBe(5)
  })

  it('follows the scrollbar, and a hand on it stops following', () => {
    const { scale, container } = setup()
    const bar = container.querySelector<HTMLElement>('.tl-scroll')!
    Object.defineProperty(bar, 'scrollLeft', { configurable: true, writable: true, value: 200 })
    fireEvent.pointerDown(bar)
    expect(screen.getByRole('button', { name: 'follow' }).className).not.toContain('on')
    fireEvent.scroll(bar)
    expect(scale().startBar).toBe(20)
  })

  it('toggles following from its button', () => {
    setup()
    const follow = screen.getByRole('button', { name: 'follow' })
    fireEvent.click(follow)
    expect(follow.className).not.toContain('on')
    fireEvent.click(follow)
    expect(follow.className).toContain('on')
  })
})

describe('Timeline ruler', () => {
  const down = (el: HTMLElement, x: number): void => { fireEvent.pointerDown(el, { clientX: x, pointerId: 1, buttons: 1 }) }
  const move = (el: HTMLElement, x: number, buttons = 1): void => { fireEvent.pointerMove(el, { clientX: x, pointerId: 1, buttons }) }
  const up = (el: HTMLElement, x: number): void => { fireEvent.pointerUp(el, { clientX: x, pointerId: 1 }) }

  it('seeks to the bar where a click on it is released', () => {
    const { ruler, onSeek } = setup()
    down(ruler(), 100)
    expect(onSeek).not.toHaveBeenCalled()
    up(ruler(), 100)
    expect(onSeek).toHaveBeenCalledWith(10)
  })

  it('scrubs, seeking only once, to wherever the drag is let go', () => {
    const { ruler, onSeek } = setup()
    down(ruler(), 100)
    move(ruler(), 200)
    move(ruler(), 305)
    expect(onSeek).not.toHaveBeenCalled()
    up(ruler(), 305)
    expect(onSeek).toHaveBeenCalledTimes(1)
    expect(onSeek).toHaveBeenCalledWith(30)
  })

  it('treats a move with no button held as the release it never saw', () => {
    const { ruler, onSeek } = setup()
    down(ruler(), 100)
    move(ruler(), 150, 0)
    expect(onSeek).toHaveBeenCalledWith(10)
  })

  it('keeps a seek inside the song unless it holds at the end', () => {
    const looping = setup({ song: { ...DEFAULT_SONG, end: 'loop' } })
    down(looping.ruler(), 2000)
    up(looping.ruler(), 2000)
    expect(looping.onSeek).toHaveBeenCalledWith(63)
    cleanup()

    const holding = setup({ song: { ...DEFAULT_SONG, end: 'hold' } })
    down(holding.ruler(), 2000)
    up(holding.ruler(), 2000)
    expect(holding.onSeek).toHaveBeenCalledWith(200)
  })

  it('drags the end marker to set the length, without seeking', () => {
    const { ruler, onSeek, onSongChange, lastSong } = setup()
    // The marker sits at bar 64 * 10 px.
    down(ruler(), 643)
    move(ruler(), 800)
    expect(lastSong().lengthBars).toBe(80)
    move(ruler(), 3)
    expect(lastSong().lengthBars).toBe(1)
    up(ruler(), 3)
    expect(onSeek).not.toHaveBeenCalled()
    expect(onSongChange.mock.calls.every(([song]) => song.end === 'hold')).toBe(true)
  })
})

describe('Timeline dial tracks', () => {
  const toggleFor = (label: string): HTMLElement =>
    screen.getByRole('button', { name: new RegExp(`^${label}$`, 'i') })

  it('has a track for each of the six dials', () => {
    setup()
    expect(['warmth', 'colour', 'space', 'pulse', 'density', 'drift'].map((l) => toggleFor(l).className.includes('on')))
      .toEqual([false, false, false, false, false, false])
  })

  it('starts an empty track where the dial is when it is switched on', () => {
    const { lastSong } = setup({ dials: { ...DEFAULT_MACROS, space: 0.7 } })
    fireEvent.click(toggleFor('space'))
    expect(lastSong().macros.space).toEqual({
      enabled: true,
      envelope: { points: [{ bar: 0, value: 0.7, shape: 'linear' }] },
    })
    expect(lastSong().macros.warmth).toBeUndefined()
  })

  it('hands a track back and takes it again without losing its points', () => {
    const song = { ...DEFAULT_SONG, macros: { pulse: track(0.3) } }
    const on = setup({ song })
    expect(toggleFor('pulse').className).toContain('on')
    fireEvent.click(toggleFor('pulse'))
    expect(on.lastSong().macros.pulse).toEqual({ ...track(0.3), enabled: false })
    cleanup()

    const off = setup({ song: { ...DEFAULT_SONG, macros: { pulse: track(0.3, false) } } })
    expect(toggleFor('pulse').className).not.toContain('on')
    fireEvent.click(toggleFor('pulse'))
    expect(off.lastSong().macros.pulse).toEqual(track(0.3, true))
  })

  it('treats an enabled track with no points as empty', () => {
    const empty: MacroTrack = { enabled: true, envelope: { points: [] } }
    const { lastSong } = setup({ song: { ...DEFAULT_SONG, macros: { drift: empty } }, dials: { ...DEFAULT_MACROS, drift: 0.2 } })
    expect(toggleFor('drift').className).not.toContain('on')
    expect(screen.queryByLabelText('Clear Drift track')).toBeNull()
    fireEvent.click(toggleFor('drift'))
    expect(lastSong().macros.drift?.envelope.points).toEqual([{ bar: 0, value: 0.2, shape: 'linear' }])
  })

  it('clears a track that has points, and only that one', () => {
    const song = { ...DEFAULT_SONG, macros: { warmth: track(0.4), colour: track(0.6) } }
    const { lastSong } = setup({ song })
    expect(screen.queryByLabelText('Clear Space track')).toBeNull()
    fireEvent.click(screen.getByLabelText('Clear Warmth track'))
    expect(Object.keys(lastSong().macros)).toEqual(['colour'])
  })
})

describe('Timeline instrument lanes', () => {
  const withLanes = (): SlotDesc[] => {
    const slots = defaultSlots()
    slots[0] = {
      ...slots[0],
      lanes: [
        songLane('pad-level', { kind: 'level' }),
        makeLane('pad-loop', { kind: 'expression', key: 'motion' }),
      ],
    }
    slots[1] = { ...slots[1], lanes: [songLane('strings-motion', { kind: 'expression', key: 'motion' }, [])] }
    return slots
  }

  it('shows each song lane under its instrument, and not the looped ones', () => {
    const { container } = setup({ slots: withLanes() })
    const labels = Array.from(container.querySelectorAll('.tl-label .tl-toggle')).map((b) => b.textContent)
    expect(labels).toContain('pad level')
    expect(labels).toContain('strings motion')
    expect(labels.some((l) => l?.includes('pad') && l.includes('motion'))).toBe(false)
  })

  it('marks a lane on only when it is enabled and has points', () => {
    const slots = withLanes()
    const { container } = setup({ slots })
    const toggle = (text: string): Element =>
      Array.from(container.querySelectorAll('.tl-label .tl-toggle')).find((b) => b.textContent === text)!
    expect(toggle('pad level').className).toContain('on')
    expect(toggle('strings motion').className).not.toContain('on')
  })

  it('switches a lane off and on, changing nothing else', () => {
    const slots = withLanes()
    const { container, lastSlots } = setup({ slots })
    fireEvent.click(Array.from(container.querySelectorAll('.tl-label .tl-toggle')).find((b) => b.textContent === 'pad level')!)
    const next = lastSlots()
    expect(next[0].lanes[0].enabled).toBe(false)
    expect(next[0].lanes[1]).toBe(slots[0].lanes[1])
    expect(next[1]).toBe(slots[1])
  })

  it('removes a lane', () => {
    const slots = withLanes()
    const { lastSlots } = setup({ slots })
    fireEvent.click(screen.getAllByLabelText('Remove lane')[0])
    expect(lastSlots()[0].lanes.map((l) => l.id)).toEqual(['pad-loop'])
    expect(lastSlots()[1].lanes).toHaveLength(1)
  })

  it('offers every instrument, grouped, with its level and controls', () => {
    setup()
    fireEvent.click(screen.getByRole('combobox', { name: 'Add an automation lane to the timeline' }))
    const groups = screen.getAllByRole('group').filter((g) => g.getAttribute('aria-label') !== 'At the end')
    expect(groups.map((g) => g.getAttribute('aria-label'))).toEqual(defaultSlots().map((s) => s.name))

    const pad = within(screen.getByRole('group', { name: 'Pad' }))
    const expected = ['level', ...controlsOf(instrumentById('pad')!).map((c) => c.label.toLowerCase())]
    expect(pad.getAllByRole('option').map((o) => o.textContent)).toEqual(expected)
  })

  it('adds an empty song lane for the level or for a parameter', () => {
    const { lastSlots, onSlotsChange } = setup()
    const open = (): void => { fireEvent.click(screen.getByRole('combobox', { name: 'Add an automation lane to the timeline' })) }

    open()
    fireEvent.click(within(screen.getByRole('group', { name: 'Pad' })).getByRole('option', { name: 'level' }))
    const level = lastSlots()[0].lanes.at(-1)!
    expect(level.target).toEqual({ kind: 'level' })
    expect(level.source).toEqual({ kind: 'song', envelope: { points: [] } })
    expect(level).toMatchObject({ depth: 1, bars: 4, mode: 'set', enabled: true })
    expect(level.id).toMatch(/^pad-0-song-/)

    const control = controlsOf(instrumentById('strings')!)[0]
    open()
    fireEvent.click(within(screen.getByRole('group', { name: 'Strings' })).getByRole('option', { name: control.label.toLowerCase() }))
    const param = lastSlots()[1].lanes.at(-1)!
    expect(param.target).toEqual({ kind: 'param', param: control.param })
    expect(onSlotsChange).toHaveBeenCalledTimes(2)
    expect(lastSlots()[0].lanes).toHaveLength(0)
  })
})

describe('Timeline children', () => {
  it('hands the harmony row the scale and width it draws against', () => {
    const children = vi.fn<(scale: BarScale, width: number) => ReactNode>(() => <div data-testid="harmony" />)
    setup({ children })
    expect(screen.getByTestId('harmony')).toBeTruthy()
    const [scale, width] = children.mock.lastCall!
    expect(scale.pxPerBar).toBe(10)
    expect(width).toBe(TRACK_WIDTH)
  })
})
