// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import { renderHook } from '@testing-library/react'
import { usePointerDrag } from '@/ui/hooks/usePointerDrag.ts'
import type { PointerDrag } from '@/ui/hooks/usePointerDrag.ts'

let captured = true
const capture = vi.fn<(id: number) => void>()
const release = vi.fn<(id: number) => void>()

beforeEach(() => {
  captured = true
  capture.mockClear()
  release.mockClear()
  Element.prototype.setPointerCapture = capture
  Element.prototype.releasePointerCapture = release
  Element.prototype.hasPointerCapture = () => captured
})

afterEach(cleanup)

interface Calls {
  start: ReturnType<typeof vi.fn<(e: unknown) => number | null>>
  move: ReturnType<typeof vi.fn<(d: number, e: unknown) => void>>
  hover: ReturnType<typeof vi.fn<(e: unknown) => void>>
  end: ReturnType<typeof vi.fn<(d: number, e: unknown) => void>>
}

function Surface({ drag }: { drag: PointerDrag<number, HTMLDivElement> }) {
  return <div data-testid="surface" {...usePointerDrag(drag)} />
}

function setup(first = 7) {
  let next = first
  const calls: Calls = {
    start: vi.fn<(e: unknown) => number | null>(() => next++),
    move: vi.fn<(d: number, e: unknown) => void>(),
    hover: vi.fn<(e: unknown) => void>(),
    end: vi.fn<(d: number, e: unknown) => void>(),
  }
  const drag: PointerDrag<number, HTMLDivElement> = {
    start: (e) => calls.start(e), move: (d, e) => calls.move(d, e), hover: (e) => calls.hover(e), end: (d, e) => calls.end(d, e),
  }
  const view = render(<Surface drag={drag} />)
  const el = view.getByTestId('surface')
  return { ...calls, calls, el, view, drag }
}

const press = (el: Element): void => { fireEvent.pointerDown(el, { pointerId: 4, buttons: 1 }) }
const drag = (el: Element, buttons = 1): void => { fireEvent.pointerMove(el, { pointerId: 4, buttons }) }

describe('usePointerDrag', () => {
  it('captures the pointer on a press it accepts, and remembers what start returned', () => {
    const { el, start, move } = setup(7)
    press(el)
    expect(start).toHaveBeenCalledTimes(1)
    expect(capture).toHaveBeenCalledWith(4)
    drag(el)
    drag(el)
    expect(move.mock.calls.map(([state]) => state)).toEqual([7, 7])
  })

  it('ignores a press that start refuses', () => {
    const { el, start, move, hover } = setup()
    start.mockReturnValueOnce(null)
    press(el)
    expect(capture).not.toHaveBeenCalled()
    drag(el)
    expect(move).not.toHaveBeenCalled()
    expect(hover).toHaveBeenCalledTimes(1)
  })

  it('hovers only when no drag is under way', () => {
    const { el, hover } = setup()
    drag(el)
    expect(hover).toHaveBeenCalledTimes(1)
    press(el)
    drag(el)
    expect(hover).toHaveBeenCalledTimes(1)
  })

  it('ends on release, giving back the capture and the state, and then ignores the pointer', () => {
    const { el, end, move } = setup(7)
    press(el)
    fireEvent.pointerUp(el, { pointerId: 4 })
    expect(release).toHaveBeenCalledWith(4)
    expect(end).toHaveBeenCalledTimes(1)
    expect(end.mock.calls[0][0]).toBe(7)
    drag(el)
    expect(move).not.toHaveBeenCalled()
  })

  it('does not give back a capture it no longer holds', () => {
    const { el, end } = setup()
    press(el)
    captured = false
    fireEvent.pointerUp(el, { pointerId: 4 })
    expect(release).not.toHaveBeenCalled()
    expect(end).toHaveBeenCalledTimes(1)
  })

  it('treats a move with no button held as the release it never saw', () => {
    const { el, end, move } = setup(7)
    press(el)
    drag(el, 0)
    expect(move).not.toHaveBeenCalled()
    expect(end).toHaveBeenCalledTimes(1)
    expect(release).toHaveBeenCalledWith(4)
    drag(el)
    expect(move).not.toHaveBeenCalled()
  })

  it.each([
    ['pointercancel', (el: Element) => fireEvent.pointerCancel(el, { pointerId: 4 })],
    ['lostpointercapture', (el: Element) => fireEvent.lostPointerCapture(el, { pointerId: 4 })],
  ])('ends on %s', (_name, finish) => {
    const { el, end, move } = setup()
    press(el)
    finish(el)
    expect(end).toHaveBeenCalledTimes(1)
    drag(el)
    expect(move).not.toHaveBeenCalled()
  })

  it('ends once however many signals follow', () => {
    const { el, end } = setup()
    press(el)
    fireEvent.pointerUp(el, { pointerId: 4 })
    fireEvent.lostPointerCapture(el, { pointerId: 4 })
    fireEvent.pointerCancel(el, { pointerId: 4 })
    expect(end).toHaveBeenCalledTimes(1)
  })

  it('starts each gesture afresh', () => {
    const { el, move } = setup(7)
    press(el)
    fireEvent.pointerUp(el, { pointerId: 4 })
    press(el)
    drag(el)
    expect(move.mock.calls.map(([state]) => state)).toEqual([8])
  })

  it('works without an end or hover handler', () => {
    const move = vi.fn()
    const { getByTestId } = render(<Surface drag={{ start: () => 1, move }} />)
    const el = getByTestId('surface')
    drag(el)
    press(el)
    drag(el)
    fireEvent.pointerUp(el, { pointerId: 4 })
    expect(move).toHaveBeenCalledTimes(1)
  })

  it('calls the latest handlers without needing new ones, so a drag sees fresh props', () => {
    const first = vi.fn<(d: number) => void>()
    const second = vi.fn<(d: number) => void>()
    const { result, rerender } = renderHook(
      ({ move }) => usePointerDrag<number, HTMLDivElement>({ start: () => 1, move }),
      { initialProps: { move: first } },
    )
    const before = result.current
    rerender({ move: second })
    expect(result.current.onPointerMove).toBe(before.onPointerMove)
    expect(result.current.onPointerDown).toBe(before.onPointerDown)

    const view = render(<Surface drag={{ start: () => 1, move: (d) => first(d) }} />)
    view.rerender(<Surface drag={{ start: () => 1, move: (d) => second(d) }} />)
    const el = view.getByTestId('surface')
    press(el)
    drag(el)
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })
})
