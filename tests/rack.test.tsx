// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react'
import { RackView } from '@/ui/RackView.tsx'
import { defaultSlots } from '@/ui/defaultSlots.ts'
import { meterPosition } from '@/ui/meterPosition.ts'
import { explainerFor } from '@/ui/explainerFor.ts'
import { Rack } from '@/engine/rack.ts'
import { INSTRUMENTS } from '@/instruments/registry.ts'
import { NEUTRAL, blendExpression } from '@/fuzzy/expression.ts'
import { makeLane } from '@/automation/lane.ts'
import type { SongLane } from '@/automation/songLaneFor.ts'
import type { SlotDesc, SlotReadout } from '@/engine/types.ts'

beforeAll(() => {
  // jsdom lays nothing out and has no pointer capture or scrolling.
  Element.prototype.scrollIntoView = () => {}
  Element.prototype.setPointerCapture = () => {}
  Element.prototype.releasePointerCapture = () => {}
})

afterEach(cleanup)

const ACCENT = '#aabbcc'

function setup(overrides: Partial<Parameters<typeof RackView>[0]> = {}) {
  const onChange = vi.fn<(slots: SlotDesc[]) => void>()
  const slots = overrides.slots ?? defaultSlots()
  const props = { slots, global: NEUTRAL, accent: ACCENT, bars: 0, playhead: 0, metering: false, onChange, ...overrides }
  const view = render(<RackView {...props} />)
  const rows = (): HTMLElement[] => Array.from(view.container.querySelectorAll<HTMLElement>('.slot'))
  return { ...view, onChange, slots, props, rows }
}

/** The song lane that drives a slot's level, with one point already on it. */
function levelLane(): SongLane {
  return {
    ...makeLane('lvl', { kind: 'level' }),
    source: { kind: 'song', envelope: { points: [{ bar: 0, value: 0.5, shape: 'linear' }] } },
  }
}

describe('RackView rows', () => {
  it('shows one row per slot and skips an instrument it does not know', () => {
    const slots = [...defaultSlots(), { ...defaultSlots()[0], id: 'ghost-9', defId: 'no-such-instrument', name: 'Ghost' }]
    const { rows } = setup({ slots })
    expect(rows()).toHaveLength(defaultSlots().length)
    expect(screen.queryByText('Ghost')).toBeNull()
    expect(rows()[0].querySelector('.slot-name')?.textContent).toContain('Pad')
  })

  it('opens one slot at a time and closes it on a second click', () => {
    const { rows } = setup()
    const name = (i: number): HTMLElement => rows()[i].querySelector<HTMLElement>('.slot-name')!
    expect(document.querySelectorAll('.slot-body')).toHaveLength(0)

    fireEvent.click(name(0))
    expect(rows()[0].querySelector('.slot-body')).not.toBeNull()
    expect(name(0).getAttribute('aria-expanded')).toBe('true')

    fireEvent.click(name(1))
    expect(rows()[0].querySelector('.slot-body')).toBeNull()
    expect(rows()[1].querySelector('.slot-body')).not.toBeNull()

    fireEvent.click(name(1))
    expect(document.querySelectorAll('.slot-body')).toHaveLength(0)
  })

  it('badges a slot with its hand-set knobs and its lanes', () => {
    const slots = defaultSlots()
    slots[0] = { ...slots[0], knobs: { cutoff: 0.4, attack: 0.2 }, lanes: [makeLane('a', { kind: 'level' })] }
    const { rows } = setup({ slots })
    expect(rows()[0].querySelector('.slot-knobs')?.textContent).toBe('2 set')
    expect(rows()[0].querySelector('.slot-lanes')?.textContent).toBe('1')
    expect(rows()[1].querySelector('.slot-knobs')).toBeNull()
  })
})

describe('RackView flags', () => {
  it('mutes, solos and removes only the slot asked', () => {
    const { onChange, slots } = setup()
    fireEvent.click(screen.getByLabelText('Mute Strings'))
    const muted = onChange.mock.lastCall![0]
    expect(muted.map((s) => s.muted)).toEqual([false, true, false, false, false, false])
    expect(muted[0]).toBe(slots[0])

    fireEvent.click(screen.getByLabelText('Solo Shimmer'))
    expect(onChange.mock.lastCall![0].map((s) => s.soloed)).toEqual([false, false, true, false, false, false])

    fireEvent.click(screen.getByLabelText('Remove Pad'))
    expect(onChange.mock.lastCall![0].map((s) => s.defId)).toEqual(['strings', 'shimmer', 'sub', 'bed', 'dust'])
  })
})

describe('RackView level fader', () => {
  it('sets the slot level when nothing drives it', () => {
    const { onChange } = setup()
    fireEvent.change(screen.getByLabelText('Pad level'), { target: { value: '0.3' } })
    const next = onChange.mock.lastCall![0]
    expect(next[0].level).toBe(0.3)
    expect(next[1].level).toBe(0.8)
  })

  it('writes into a timeline lane that drives it, leaving the base level alone', () => {
    const slots = defaultSlots()
    slots[0] = { ...slots[0], lanes: [levelLane()] }
    const { onChange } = setup({ slots, playhead: 2 })
    const fader = screen.getByLabelText('Pad level, automated')
    fireEvent.change(fader, { target: { value: '0.9' } })

    const next = onChange.mock.lastCall![0][0]
    expect(next.level).toBe(0.8)
    const lane = next.lanes[0]
    expect(lane.source.kind).toBe('song')
    if (lane.source.kind !== 'song') return
    expect(lane.source.envelope.points.some((p) => p.bar === 2)).toBe(true)
  })

  it('marks an automated level and ghosts where the engine actually has it', () => {
    const slots = defaultSlots()
    slots[0] = { ...slots[0], lanes: [levelLane()] }
    const readout: SlotReadout = { id: slots[0].id, expression: { ...NEUTRAL }, level: 0.2, peak: 0, rms: 0, params: {} }
    const { rows } = setup({ slots, readouts: [readout] })
    expect(rows()[0].querySelector('.slot-level-dot')).not.toBeNull()
    expect(rows()[0].querySelector('.slot-level-ghost')).not.toBeNull()
    expect(rows()[1].querySelector('.slot-level-dot')).toBeNull()
  })
})

describe('RackView meters', () => {
  const readoutFor = (slots: SlotDesc[], rms: number, peak: number): SlotReadout =>
    ({ id: slots[0].id, expression: { ...NEUTRAL }, level: 0.8, peak, rms, params: {} })

  it('reads the meter off the readout while playing', () => {
    const slots = defaultSlots()
    const { rows } = setup({ slots, metering: true, readouts: [readoutFor(slots, 0.1, 0.5)] })
    const fill = rows()[0].querySelector<HTMLElement>('.slot-meter-fill')!
    expect(fill.style.transform).toBe(`scaleX(${meterPosition(0.1)})`)
    const peak = rows()[0].querySelector<HTMLElement>('.slot-meter-peak')!
    expect(peak.style.left).toBe(`${meterPosition(0.5) * 100}%`)
  })

  it('shows an empty meter when stopped, whatever the last readout said', () => {
    const slots = defaultSlots()
    const { rows } = setup({ slots, metering: false, readouts: [readoutFor(slots, 0.1, 0.5)] })
    expect(rows()[0].querySelector<HTMLElement>('.slot-meter-fill')!.style.transform).toBe('scaleX(0)')
    expect(rows()[0].querySelector('.slot-meter-peak')).toBeNull()
  })
})

describe('RackView instrument picker', () => {
  it('lists every instrument and cancels without adding', () => {
    const { onChange, container } = setup()
    fireEvent.click(screen.getByText('+ instrument'))
    expect(container.querySelectorAll('.picker button')).toHaveLength(INSTRUMENTS.length + 1)
    fireEvent.click(screen.getByText('cancel'))
    expect(container.querySelector('.picker')).toBeNull()
    expect(screen.getByText('+ instrument')).toBeTruthy()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('adds the chosen instrument, following the dials loosely, and opens it', () => {
    const global = { ...NEUTRAL, brightness: 0.9 }
    const { onChange, rerender, props, container } = setup({ global })
    fireEvent.click(screen.getByText('+ instrument'))
    fireEvent.click(within(container.querySelector<HTMLElement>('.picker')!).getByText('Rhodes'))

    const next = onChange.mock.lastCall![0]
    expect(next).toHaveLength(7)
    const added = next[6]
    expect(added).toMatchObject({ defId: 'rhodes', name: 'Rhodes', level: 0.8, follow: 0.7, lanes: [], knobs: {} })
    expect(added.expression).toEqual(global)
    expect(added.expression).not.toBe(global)
    expect(container.querySelector('.picker')).toBeNull()

    // The parent owns the slots; once it hands the new one back, it is open.
    rerender(<RackView {...props} slots={next} />)
    const last = Array.from(container.querySelectorAll('.slot')).at(-1)!
    expect(last.querySelector('.slot-body')).not.toBeNull()
  })
})

describe('RackView open slot', () => {
  const open = (i = 0) => {
    const view = setup()
    fireEvent.click(view.rows()[i].querySelector('.slot-name')!)
    return view
  }

  it('shows the instrument blurb and the rules currently firing', () => {
    const { rows } = open()
    expect(rows()[0].querySelector('.slot-blurb')?.textContent?.length).toBeGreaterThan(10)
    const rules = rows()[0].querySelectorAll('.rule')
    expect(rules.length).toBeGreaterThan(0)
    expect(rules[0].textContent).toMatch(/^if .* then /)
  })

  it('sets how far the slot follows the dials', () => {
    const { onChange } = open()
    fireEvent.change(document.querySelector('.follow input')!, { target: { value: '0.25' } })
    expect(onChange.mock.lastCall![0][0].follow).toBe(0.25)
  })

  it('loosens a slot that fully follows the dials when its pad is touched', () => {
    const { onChange } = open()
    const field = document.querySelector<HTMLElement>('.xy-field')!
    field.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}) })
    fireEvent.pointerDown(field, { clientX: 75, clientY: 25, pointerId: 1 })

    const touched = onChange.mock.lastCall![0][0]
    expect(touched.follow).toBe(0.45)
    expect(touched.expression.brightness).toBeCloseTo(0.75, 5)
    expect(touched.expression.weight).toBeCloseTo(0.75, 5)
  })

  it('leaves a slot that already follows loosely as it was', () => {
    const slots = defaultSlots()
    slots[0] = { ...slots[0], follow: 0.3 }
    const view = setup({ slots })
    fireEvent.click(view.rows()[0].querySelector('.slot-name')!)
    const field = document.querySelector<HTMLElement>('.xy-field')!
    field.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}) })
    fireEvent.pointerDown(field, { clientX: 10, clientY: 10, pointerId: 1 })
    expect(view.onChange.mock.lastCall![0][0].follow).toBe(0.3)
  })

  it('remembers the pad axes per slot across closing and reopening', () => {
    const { rows } = open()
    const field = (): string | null => document.querySelector('.xy-field')?.getAttribute('aria-label') ?? null
    expect(field()).toBe('Brightness against Weight')

    fireEvent.click(screen.getByRole('combobox', { name: /Horizontal axis/ }))
    fireEvent.click(screen.getByRole('option', { name: 'Tension' }))
    expect(field()).toBe('Tension against Weight')

    fireEvent.click(rows()[0].querySelector('.slot-name')!)
    expect(field()).toBeNull()
    fireEvent.click(rows()[0].querySelector('.slot-name')!)
    expect(field()).toBe('Tension against Weight')

    // Another slot has its own pad, still on the defaults.
    fireEvent.click(rows()[1].querySelector('.slot-name')!)
    expect(field()).toBe('Brightness against Weight')
  })
})

describe('rack helpers', () => {
  it('lays the meter out on a decibel scale with a -60 dB floor', () => {
    expect(meterPosition(0)).toBe(0)
    expect(meterPosition(-1)).toBe(0)
    expect(meterPosition(1e-3)).toBeCloseTo(0, 10) // exactly -60 dB
    expect(meterPosition(1)).toBe(1)
    expect(meterPosition(0.1)).toBeCloseTo(1 - -20 / -60, 10)
    expect(meterPosition(10)).toBe(1)
  })

  it('caches one explainer per instrument and has none for an unknown one', () => {
    expect(explainerFor('pad')).toBe(explainerFor('pad'))
    expect(explainerFor('pad')).not.toBe(explainerFor('strings'))
    expect(explainerFor('no-such-instrument')).toBeNull()
  })

  it('blends an expression towards the dials by the follow amount', () => {
    const own = { ...NEUTRAL, brightness: 0.2, motion: 0.8 }
    const dials = { ...NEUTRAL, brightness: 1, motion: 0 }
    expect(blendExpression(own, dials, 0)).toEqual(own)
    expect(blendExpression(own, dials, 1)).toEqual(dials)
    const half = blendExpression(own, dials, 0.5)
    expect(half.brightness).toBeCloseTo(0.6, 10)
    expect(half.motion).toBeCloseTo(0.4, 10)
    expect(own.brightness).toBe(0.2)
  })

  it('has the engine resolve a slot the same way the pad shows it', () => {
    const resolved = (follow: number): number => {
      const rack = new Rack(24000, 7)
      rack.sync([{ ...defaultSlots()[0], expression: { ...NEUTRAL, brightness: 0 }, follow }])
      rack.control({ ...NEUTRAL, brightness: 1 }, { bars: 0, kick: 0, level: 0 })
      return rack.readout()[0].expression.brightness
    }
    expect(resolved(0)).toBe(0)
    expect(resolved(0.5)).toBeCloseTo(0.5, 10)
    expect(resolved(1)).toBe(1)
  })
})
