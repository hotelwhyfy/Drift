// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import type { DependencyList } from 'react'
import { useCanvasLoop } from '@/ui/hooks/useCanvasLoop.ts'
import type { CanvasFrame } from '@/ui/hooks/useCanvasLoop.ts'
import { canvasScale } from '@/ui/common/canvasScale.ts'

/** A 2D context that only records the two calls the hook itself makes. */
function fakeContext() {
  const calls = { setTransform: vi.fn(), clearRect: vi.fn() }
  const context: CanvasRenderingContext2D = Object.assign(Object.create(null), calls)
  return { calls, context }
}

/** Animation frames that run only when told to. */
class Frames {
  private next = 1
  private pending = new Map<number, () => void>()
  request = (cb: FrameRequestCallback): number => {
    const id = this.next++
    this.pending.set(id, () => cb(0))
    return id
  }
  cancel = (id: number): void => { this.pending.delete(id) }
  get waiting(): number { return this.pending.size }
  step(): void {
    const run = [...this.pending.values()]
    this.pending.clear()
    run.forEach((cb) => cb())
  }
}

let fake = fakeContext()
let frames = new Frames()
let rect = { width: 300, height: 100 }
const observers: { callback: () => void, disconnect: ReturnType<typeof vi.fn> }[] = []

beforeEach(() => {
  fake = fakeContext()
  frames = new Frames()
  rect = { width: 300, height: 100 }
  observers.length = 0
  vi.stubGlobal('requestAnimationFrame', frames.request)
  vi.stubGlobal('cancelAnimationFrame', frames.cancel)
  vi.stubGlobal('ResizeObserver', class {
    disconnect = vi.fn()
    constructor(public callback: () => void) { observers.push(this) }
    observe(): void {}
  })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => fake.context)
  Element.prototype.getBoundingClientRect = () =>
    ({ ...rect, left: 0, top: 0, right: rect.width, bottom: rect.height, x: 0, y: 0, toJSON: () => ({}) })
  window.devicePixelRatio = 1
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function Probe({ makeFrame, deps }: { makeFrame: (c: CanvasRenderingContext2D) => CanvasFrame, deps: DependencyList }) {
  const ref = useCanvasLoop(makeFrame, deps)
  return <canvas ref={ref} />
}

describe('useCanvasLoop', () => {
  it('sizes the canvas for the pixel ratio, capped at two', () => {
    window.devicePixelRatio = 3
    const { container } = render(<Probe makeFrame={() => () => {}} deps={[]} />)
    const canvas = container.querySelector('canvas')!
    expect(canvas.width).toBe(600)
    expect(canvas.height).toBe(200)
    expect(fake.calls.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0)
  })

  it('follows the element when it is resized, and never makes a canvas smaller than a pixel', () => {
    const { container } = render(<Probe makeFrame={() => () => {}} deps={[]} />)
    const canvas = container.querySelector('canvas')!
    rect = { width: 150, height: 0 }
    observers[0].callback()
    expect(canvas.width).toBe(150)
    expect(canvas.height).toBe(1)
  })

  it('clears and draws a frame at once, then every animation frame', () => {
    const frame = vi.fn<CanvasFrame>()
    render(<Probe makeFrame={() => frame} deps={[]} />)
    expect(frame).toHaveBeenCalledTimes(1)
    expect(frame).toHaveBeenLastCalledWith(300, 100)
    expect(fake.calls.clearRect).toHaveBeenLastCalledWith(0, 0, 300, 100)

    frames.step()
    frames.step()
    expect(frame).toHaveBeenCalledTimes(3)
    expect(fake.calls.clearRect).toHaveBeenCalledTimes(3)
    expect(frames.waiting).toBe(1)
  })

  it('draws at the size the element has now, not the size it had', () => {
    const frame = vi.fn<CanvasFrame>()
    render(<Probe makeFrame={() => frame} deps={[]} />)
    rect = { width: 80, height: 40 }
    frames.step()
    expect(frame).toHaveBeenLastCalledWith(80, 40)
  })

  it('builds its frame function once per run, so a frame can keep state between frames', () => {
    const makeFrame = vi.fn((): CanvasFrame => {
      let phase = 0
      return () => { phase += 1; seen.push(phase) }
    })
    const seen: number[] = []
    render(<Probe makeFrame={makeFrame} deps={[]} />)
    frames.step()
    frames.step()
    expect(makeFrame).toHaveBeenCalledTimes(1)
    expect(seen).toEqual([1, 2, 3])
  })

  it('starts afresh when what it depends on changes, stopping the old loop', () => {
    const seen: number[] = []
    const makeFrame = (): CanvasFrame => {
      let phase = 0
      return () => { phase += 1; seen.push(phase) }
    }
    const { rerender } = render(<Probe makeFrame={makeFrame} deps={['a']} />)
    frames.step()
    expect(seen).toEqual([1, 2])
    expect(observers).toHaveLength(1)

    rerender(<Probe makeFrame={makeFrame} deps={['b']} />)
    expect(observers[0].disconnect).toHaveBeenCalledTimes(1)
    expect(observers).toHaveLength(2)
    expect(seen).toEqual([1, 2, 1])
    expect(frames.waiting).toBe(1)
  })

  it('keeps running across renders that change nothing it depends on', () => {
    const makeFrame = vi.fn((): CanvasFrame => () => {})
    const { rerender } = render(<Probe makeFrame={makeFrame} deps={['a']} />)
    rerender(<Probe makeFrame={makeFrame} deps={['a']} />)
    expect(makeFrame).toHaveBeenCalledTimes(1)
    expect(observers).toHaveLength(1)
  })

  it('stops when it unmounts', () => {
    const { unmount } = render(<Probe makeFrame={() => () => {}} deps={[]} />)
    expect(frames.waiting).toBe(1)
    unmount()
    expect(frames.waiting).toBe(0)
    expect(observers[0].disconnect).toHaveBeenCalledTimes(1)
  })

  it('does nothing on a canvas that cannot give a context', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null)
    const makeFrame = vi.fn((): CanvasFrame => () => {})
    render(<Probe makeFrame={makeFrame} deps={[]} />)
    expect(makeFrame).not.toHaveBeenCalled()
    expect(frames.waiting).toBe(0)
  })
})

describe('canvasScale', () => {
  it('is the device pixel ratio, from 1 to 2', () => {
    window.devicePixelRatio = 1.5
    expect(canvasScale()).toBe(1.5)
    window.devicePixelRatio = 4
    expect(canvasScale()).toBe(2)
    window.devicePixelRatio = 0
    expect(canvasScale()).toBe(1)
  })
})
