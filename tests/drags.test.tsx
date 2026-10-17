// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { Dial } from '@/ui/Dial.tsx'
import { XYPad } from '@/ui/XYPad.tsx'
import { EnvelopeLane } from '@/ui/EnvelopeLane.tsx'
import { barScale } from '@/ui/barScale.ts'
import type { Envelope, Breakpoint } from '@/song/types.ts'

beforeAll(() => {
  // jsdom has no pointer capture, and lays nothing out.
  Element.prototype.setPointerCapture = vi.fn()
  Element.prototype.releasePointerCapture = vi.fn()
  Element.prototype.hasPointerCapture = () => true
  HTMLCanvasElement.prototype.getContext = () => null
  Element.prototype.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}) })
})

beforeEach(() => {
  vi.mocked(Element.prototype.setPointerCapture).mockClear()
  vi.mocked(Element.prototype.releasePointerCapture).mockClear()
})

afterEach(cleanup)

const down = (el: Element, x: number, y: number, init: PointerEventInit = {}): void => {
  fireEvent.pointerDown(el, { clientX: x, clientY: y, pointerId: 1, buttons: 1, ...init })
}
const move = (el: Element, x: number, y: number, init: PointerEventInit = {}): void => {
  fireEvent.pointerMove(el, { clientX: x, clientY: y, pointerId: 1, buttons: 1, ...init })
}

describe('Dial dragging', () => {
  const setup = (value = 0.5) => {
    const onChange = vi.fn<(v: number) => void>()
    render(<Dial label="Space" value={value} accent="#fff" onChange={onChange} />)
    return { onChange, dial: screen.getByRole('slider', { name: 'Space' }) }
  }

  it('does nothing until it is pressed, and nothing on the press itself', () => {
    const { onChange, dial } = setup()
    move(dial, 0, 50)
    expect(onChange).not.toHaveBeenCalled()
    down(dial, 0, 100)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('turns by how far the pointer travels up from where it was pressed', () => {
    const { onChange, dial } = setup(0.5)
    down(dial, 0, 100)
    move(dial, 0, 50)
    expect(onChange).toHaveBeenLastCalledWith(0.5 + 50 * 0.006)
    move(dial, 0, 150)
    expect(onChange).toHaveBeenLastCalledWith(0.5 - 50 * 0.006)
  })

  it('turns ten times finer with Shift, and stays within 0 and 1', () => {
    const { onChange, dial } = setup(0.5)
    down(dial, 0, 100)
    move(dial, 0, 50, { shiftKey: true })
    expect(onChange).toHaveBeenLastCalledWith(0.5 + 50 * 0.0006)
    move(dial, 0, -1000)
    expect(onChange).toHaveBeenLastCalledWith(1)
    move(dial, 0, 5000)
    expect(onChange).toHaveBeenLastCalledWith(0)
  })

  it('holds on to the gesture while the pointer is captured, and lets go of the capture', () => {
    const { dial } = setup()
    down(dial, 0, 100)
    expect(Element.prototype.setPointerCapture).toHaveBeenCalledWith(1)
    fireEvent.pointerUp(dial, { pointerId: 1 })
    expect(Element.prototype.releasePointerCapture).toHaveBeenCalledWith(1)
  })

  it.each([
    ['let go', (dial: Element) => fireEvent.pointerUp(dial, { pointerId: 1 })],
    ['cancelled', (dial: Element) => fireEvent.pointerCancel(dial, { pointerId: 1 })],
    ['stripped of capture', (dial: Element) => fireEvent.lostPointerCapture(dial, { pointerId: 1 })],
  ])('stops following the pointer once the gesture is %s', (_name, end) => {
    const { onChange, dial } = setup()
    down(dial, 0, 100)
    end(dial)
    move(dial, 0, 20)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('treats a move with no button held as the release it never saw', () => {
    const { onChange, dial } = setup()
    down(dial, 0, 100)
    move(dial, 0, 80, { buttons: 0 })
    expect(onChange).not.toHaveBeenCalled()
    move(dial, 0, 40)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('starts each gesture from the value the dial has then', () => {
    const onChange = vi.fn<(v: number) => void>()
    const { rerender } = render(<Dial label="Space" value={0.2} accent="#fff" onChange={onChange} />)
    const dial = screen.getByRole('slider', { name: 'Space' })
    down(dial, 0, 100)
    fireEvent.pointerUp(dial, { pointerId: 1 })
    rerender(<Dial label="Space" value={0.8} accent="#fff" onChange={onChange} />)
    down(dial, 0, 100)
    move(dial, 0, 90)
    expect(onChange).toHaveBeenLastCalledWith(0.8 + 10 * 0.006)
  })
})

describe('XYPad dragging', () => {
  const setup = () => {
    const onChange = vi.fn<(x: number, y: number) => void>()
    const { container } = render(
      <XYPad xKey="brightness" yKey="weight" x={0.5} y={0.5} ghostX={0.5} ghostY={0.5} accent="#fff"
        automated={{}} onChange={onChange} onAxisChange={() => {}} />,
    )
    return { onChange, field: container.querySelector('.xy-field')! }
  }

  it('moves the point to the press, with y growing upwards', () => {
    const { onChange, field } = setup()
    down(field, 75, 25)
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenLastCalledWith(0.75, 0.75)
  })

  it('follows the pointer while it is held, within the pad', () => {
    const { onChange, field } = setup()
    down(field, 10, 10)
    move(field, 20, 90)
    expect(onChange).toHaveBeenLastCalledWith(0.2, expect.closeTo(0.1, 10))
    move(field, 500, -500)
    expect(onChange).toHaveBeenLastCalledWith(1, 1)
  })

  it('ignores movement before a press', () => {
    const { onChange, field } = setup()
    move(field, 50, 50)
    expect(onChange).not.toHaveBeenCalled()
  })

  it.each([
    ['let go', (el: Element) => fireEvent.pointerUp(el, { pointerId: 1 })],
    ['cancelled', (el: Element) => fireEvent.pointerCancel(el, { pointerId: 1 })],
  ])('stops following once the gesture is %s', (_name, end) => {
    const { onChange, field } = setup()
    down(field, 10, 10)
    onChange.mockClear()
    end(field)
    move(field, 50, 50)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('treats a move with no button held as the release it never saw', () => {
    const { onChange, field } = setup()
    down(field, 10, 10)
    onChange.mockClear()
    move(field, 50, 50, { buttons: 0 })
    move(field, 60, 60)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('releases the capture when let go', () => {
    const { field } = setup()
    down(field, 10, 10)
    fireEvent.pointerUp(field, { pointerId: 1 })
    expect(Element.prototype.releasePointerCapture).toHaveBeenCalledWith(1)
  })
})

describe('EnvelopeLane editing', () => {
  const point = (bar: number, value: number, shape: Breakpoint['shape'] = 'linear'): Breakpoint => ({ bar, value, shape })
  // Ten pixels a bar, 40 px tall: value 1 is at y = 3, value 0 at y = 37.
  const yOf = (value: number): number => 3 + (1 - value) * 34

  function Harness({ start, spy }: { start: Envelope, spy: (e: Envelope) => void }) {
    const [envelope, setEnvelope] = useState(start)
    return (
      <EnvelopeLane envelope={envelope} enabled fallback={0.5} scale={barScale(10, 0)} width={400} lengthBars={64}
        playhead={0} colour="#0f0" accent="#fff" onChange={(next) => { spy(next); setEnvelope(next) }} />
    )
  }
  const setup = (points: Breakpoint[] = []) => {
    const spy = vi.fn<(e: Envelope) => void>()
    const { container } = render(<Harness start={{ points }} spy={spy} />)
    const lane = container.querySelector('canvas')!
    const last = (): readonly Breakpoint[] => spy.mock.lastCall![0].points
    return { spy, lane, last }
  }

  it('adds a point where the empty lane is pressed, snapped to the bar', () => {
    const { lane, last } = setup()
    down(lane, 103, yOf(0.5))
    expect(last()).toEqual([point(10, 0.5)])
  })

  it('snaps to quarter bars when zoomed right in, and not at all with Alt', () => {
    const spy = vi.fn<(e: Envelope) => void>()
    const { container } = render(
      <EnvelopeLane envelope={{ points: [] }} enabled fallback={0.5} scale={barScale(20, 0)} width={400} lengthBars={64}
        playhead={0} colour="#0f0" accent="#fff" onChange={spy} />,
    )
    const lane = container.querySelector('canvas')!
    down(lane, 107, yOf(0.5))
    expect(spy.mock.lastCall![0].points[0].bar).toBe(5.25)
    down(lane, 107, yOf(0.5), { altKey: true })
    expect(spy.mock.lastCall![0].points[0].bar).toBeCloseTo(107 / 20, 10)
  })

  it('gives a new point the shape of the point before it', () => {
    const { lane, last } = setup([point(0, 0.2, 'smooth')])
    down(lane, 100, yOf(0.8))
    expect(last().map((p) => [p.bar, p.shape])).toEqual([[0, 'smooth'], [10, 'smooth']])
  })

  it('moves the point it is dragged by, keeping to neighbours and the lane', () => {
    const { lane, last } = setup([point(5, 0.5), point(20, 0.5)])
    down(lane, 50, yOf(0.5))
    move(lane, 130, yOf(1))
    expect(last()).toEqual([point(13, 1), point(20, 0.5)])
    move(lane, 900, yOf(0))
    expect(last()[0].bar).toBeCloseTo(20 - 1 / 64, 10)
    move(lane, -900, yOf(0))
    expect(last()[0].bar).toBe(0)
    expect(last()[0].value).toBe(0)
  })

  it('stops dragging when let go or released unseen', () => {
    for (const end of [
      (el: Element) => fireEvent.pointerUp(el, { pointerId: 1 }),
      (el: Element) => move(el, 130, yOf(0.5), { buttons: 0 }),
    ]) {
      const { lane, spy } = setup([point(5, 0.5)])
      down(lane, 50, yOf(0.5))
      end(lane)
      spy.mockClear()
      move(lane, 150, yOf(0.9))
      expect(spy).not.toHaveBeenCalled()
      cleanup()
    }
  })

  it('ignores a press that is not the main button', () => {
    const { lane, spy } = setup()
    down(lane, 100, yOf(0.5), { button: 2 })
    expect(spy).not.toHaveBeenCalled()
    expect(Element.prototype.setPointerCapture).not.toHaveBeenCalledWith(1)
  })

  it('removes a point that is double-clicked, and only that one', () => {
    const { lane, last, spy } = setup([point(5, 0.5), point(20, 0.5)])
    fireEvent.doubleClick(lane, { clientX: 200, clientY: yOf(0.5) })
    expect(last()).toEqual([point(5, 0.5)])
    spy.mockClear()
    fireEvent.doubleClick(lane, { clientX: 300, clientY: yOf(0.9) })
    expect(spy).not.toHaveBeenCalled()
  })

  it('cycles how a point travels on right-click, and leaves empty space to the browser', () => {
    const { lane, last, spy } = setup([point(5, 0.5)])
    const click = (x: number, y: number) => fireEvent.contextMenu(lane, { clientX: x, clientY: y })
    expect(click(50, yOf(0.5))).toBe(false)
    expect(last()[0].shape).toBe('smooth')
    click(50, yOf(0.5))
    expect(last()[0].shape).toBe('step')
    click(50, yOf(0.5))
    expect(last()[0].shape).toBe('linear')

    spy.mockClear()
    expect(click(300, yOf(0.9))).toBe(true)
    expect(spy).not.toHaveBeenCalled()
  })
})
