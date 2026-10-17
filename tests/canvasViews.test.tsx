// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { Visualizer } from '@/ui/Visualizer.tsx'
import { Listening } from '@/ui/mood/Listening.tsx'
import { Player } from '@/audio/player.ts'
import { DEFAULT_MACROS } from '@/macros/macros.ts'

const ACCENT = '#aa5500'

/** A 2D context that accepts anything and remembers what was drawn and in what colour. */
function recordingContext() {
  const calls: string[] = []
  const strokes: string[] = []
  const ys: number[] = []
  const gradient = { addColorStop: () => {} }
  const context: CanvasRenderingContext2D = new Proxy(Object.create(null), {
    get: (_target, name) => {
      if (typeof name !== 'string') return undefined
      if (name === 'createLinearGradient') return () => gradient
      return (...args: unknown[]) => {
        calls.push(name)
        if ((name === 'lineTo' || name === 'moveTo') && typeof args[1] === 'number') ys.push(args[1])
      }
    },
    set: (_target, name, value) => {
      if (name === 'strokeStyle' && typeof value === 'string') strokes.push(value)
      return true
    },
  })
  return { context, calls, strokes, ys }
}

let drawn = recordingContext()
let frame: (() => void) | null = null

beforeEach(() => {
  drawn = recordingContext()
  frame = null
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => drawn.context)
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { frame = () => cb(0); return 1 })
  vi.stubGlobal('cancelAnimationFrame', () => { frame = null })
  vi.stubGlobal('ResizeObserver', class { observe(): void {} disconnect(): void {} })
  Element.prototype.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 400, height: 100, right: 400, bottom: 100, x: 0, y: 0, toJSON: () => ({}) })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function playerWithSpectrum(level: number): Player {
  const player = new Player(DEFAULT_MACROS, 1)
  vi.spyOn(player, 'frequencyData', 'get').mockReturnValue(new Uint8Array(1024).fill(level))
  return player
}

describe('Visualizer', () => {
  it('is a hidden canvas that draws a horizon in the accent colour, even in silence', () => {
    const { container } = render(<Visualizer player={null} playing={false} accent={ACCENT} />)
    const canvas = container.querySelector('canvas')!
    expect(canvas.className).toBe('viz')
    expect(canvas.getAttribute('aria-hidden')).toBe('true')
    expect(drawn.calls).toContain('fill')
    expect(drawn.calls).toContain('stroke')
    expect(drawn.strokes).toContain(`${ACCENT}cc`)
  })

  it('lifts the line when the music has energy, and keeps drawing frame after frame', () => {
    const quiet = recordingContext()
    drawn = quiet
    render(<Visualizer player={playerWithSpectrum(0)} playing accent={ACCENT} />)
    cleanup()

    const loud = recordingContext()
    drawn = loud
    render(<Visualizer player={playerWithSpectrum(200)} playing accent={ACCENT} />)
    const first = loud.ys.length
    expect(first).toBeGreaterThan(0)
    expect(Math.min(...loud.ys)).toBeLessThan(Math.min(...quiet.ys))

    frame?.()
    expect(loud.ys.length).toBeGreaterThan(first)
  })
})

describe('Listening', () => {
  it('is a hidden canvas that draws drifting lines in the accent colour', () => {
    const { container } = render(<Listening player={null} playing={false} accent={ACCENT} />)
    const canvas = container.querySelector('canvas')!
    expect(canvas.className).toBe('listening')
    expect(canvas.getAttribute('aria-hidden')).toBe('true')
    expect(drawn.strokes.filter((s) => s === ACCENT)).toHaveLength(5)
  })

  it('spreads the lines further apart as the music gets louder', () => {
    const spread = (level: number): number => {
      drawn = recordingContext()
      render(<Listening player={playerWithSpectrum(level)} playing accent={ACCENT} />)
      // The frame has just been drawn once; step it so the level has begun to rise.
      for (let i = 0; i < 60; i++) frame?.()
      const ys = drawn.ys.slice(-400)
      const result = Math.max(...ys) - Math.min(...ys)
      cleanup()
      return result
    }
    expect(spread(220)).toBeGreaterThan(spread(0))
  })
})
