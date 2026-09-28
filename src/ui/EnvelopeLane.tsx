import { useEffect, useRef, useState } from 'react'
import type { Envelope, Breakpoint } from '../song/song.ts'
import { BREAKPOINT_SHAPES } from '../song/song.ts'
import { sampleEnvelope } from '../song/sampleEnvelope.ts'
import type { BarScale } from './barScale.ts'
import { gridStep } from './gridStep.ts'

interface Props {
  envelope: Envelope
  enabled: boolean
  /** Where the value sits with no points, or with the lane switched off. */
  fallback: number
  scale: BarScale
  width: number
  lengthBars: number
  playhead: number
  /** The lane's own colour, for its curve and points. */
  colour: string
  /** The playhead's. */
  accent: string
  onChange: (envelope: Envelope) => void
}

const HEIGHT = 40
const HIT = 8

/**
 * One value laid out over the whole song, edited by its breakpoints.
 *
 * Click to add a point, drag to move it, double-click to remove it, and
 * right-click to change how it travels to the next one — straight, eased, or
 * held and then stepped. Points snap to the beat; hold Alt to place one freely.
 * Only the visible stretch is drawn, so a thousand-bar song costs the same as
 * a sixteen-bar one.
 */
export function EnvelopeLane({
  envelope, enabled, fallback, scale, width, lengthBars, playhead, colour, accent, onChange,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drag = useRef<{ index: number } | null>(null)
  const [hover, setHover] = useState<number | null>(null)
  const points = envelope.points

  const yOf = (value: number): number => 3 + (1 - value) * (HEIGHT - 6)
  const valueOf = (y: number): number => Math.min(1, Math.max(0, 1 - (y - 3) / (HEIGHT - 6)))

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || width <= 0) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = Math.floor(width * dpr)
    canvas.height = Math.floor(HEIGHT * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, HEIGHT)

    const step = gridStep(scale.pxPerBar, 10)
    const first = Math.max(0, Math.floor(scale.startBar / step) * step)
    const last = scale.toBar(width)
    for (let b = first; b <= last; b += step) {
      const x = Math.round(scale.toX(b)) + 0.5
      ctx.strokeStyle = b % (step * 4) === 0 ? '#ffffff14' : '#ffffff08'
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, HEIGHT)
      ctx.stroke()
    }

    // Past the end of the song.
    const endX = scale.toX(lengthBars)
    if (endX < width) {
      ctx.fillStyle = '#00000055'
      ctx.fillRect(Math.max(0, endX), 0, width - Math.max(0, endX), HEIGHT)
    }

    const live = enabled && points.length > 0
    if (points.length === 0) {
      ctx.setLineDash([3, 4])
      ctx.strokeStyle = `${colour}99`
      ctx.beginPath()
      ctx.moveTo(0, yOf(fallback))
      ctx.lineTo(width, yOf(fallback))
      ctx.stroke()
      ctx.setLineDash([])
    } else {
      ctx.beginPath()
      for (let x = 0; x <= width; x += 2) {
        const y = yOf(sampleEnvelope(envelope, scale.toBar(x)))
        if (x === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      // A lane switched off keeps its colour, faded, so it is still
      // recognisable as the same lane.
      ctx.strokeStyle = live ? colour : `${colour}66`
      ctx.lineWidth = live ? 2 : 1.25
      ctx.stroke()
      if (live) {
        ctx.lineTo(width, HEIGHT)
        ctx.lineTo(0, HEIGHT)
        ctx.closePath()
        ctx.fillStyle = `${colour}26`
        ctx.fill()
      }
      ctx.lineWidth = 1
      points.forEach((p, i) => {
        const x = scale.toX(p.bar)
        if (x < -HIT || x > width + HIT) return
        const y = yOf(p.value)
        ctx.fillStyle = i === hover ? '#ffffff' : live ? colour : `${colour}80`
        ctx.beginPath()
        if (p.shape === 'step') ctx.rect(x - 3, y - 3, 6, 6)
        else ctx.arc(x, y, 3.2, 0, Math.PI * 2)
        ctx.fill()
        if (p.shape === 'smooth') {
          ctx.strokeStyle = ctx.fillStyle
          ctx.beginPath()
          ctx.arc(x, y, 5.5, 0, Math.PI * 2)
          ctx.stroke()
        }
      })
    }

    const px = scale.toX(playhead)
    if (px >= 0 && px <= width) {
      ctx.strokeStyle = `${accent}aa`
      ctx.beginPath()
      ctx.moveTo(Math.round(px) + 0.5, 0)
      ctx.lineTo(Math.round(px) + 0.5, HEIGHT)
      ctx.stroke()
    }
  }, [envelope, points, enabled, fallback, scale, width, lengthBars, playhead, colour, accent, hover])

  const local = (e: React.PointerEvent | React.MouseEvent): { x: number; y: number } => {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const hit = (x: number, y: number): number => {
    let found = -1
    let best = HIT * HIT
    points.forEach((p, i) => {
      const dx = scale.toX(p.bar) - x
      const dy = yOf(p.value) - y
      const d = dx * dx + dy * dy
      if (d <= best) {
        best = d
        found = i
      }
    })
    return found
  }

  /** Beats when zoomed in, whole bars when zoomed out; Alt for no snap at all. */
  const snap = (bar: number, free: boolean): number => {
    if (free) return Math.max(0, bar)
    const unit = scale.pxPerBar >= 16 ? 0.25 : scale.pxPerBar >= 4 ? 1 : 4
    return Math.max(0, Math.round(bar / unit) * unit)
  }

  const moveTo = (index: number, x: number, y: number, free: boolean): void => {
    const prev = points[index - 1]
    const next = points[index + 1]
    const lo = prev ? prev.bar + 1 / 64 : 0
    const hi = next ? next.bar - 1 / 64 : Number.MAX_SAFE_INTEGER
    const bar = Math.min(hi, Math.max(lo, snap(scale.toBar(x), free)))
    const moved: Breakpoint = { ...points[index], bar, value: valueOf(y) }
    onChange({ points: points.map((p, i) => (i === index ? moved : p)) })
  }

  return (
    <canvas
      ref={canvasRef}
      className="env-canvas"
      style={{ width, height: HEIGHT }}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        const { x, y } = local(e)
        let index = hit(x, y)
        if (index < 0) {
          const bar = snap(scale.toBar(x), e.altKey)
          const before = [...points].reverse().find((p) => p.bar < bar)
          const added: Breakpoint = { bar, value: valueOf(y), shape: before?.shape ?? 'linear' }
          const next = [...points.filter((p) => p.bar !== bar), added].sort((a, b) => a.bar - b.bar)
          index = next.indexOf(added)
          onChange({ points: next })
        }
        drag.current = { index }
        e.currentTarget.setPointerCapture(e.pointerId)
      }}
      onPointerMove={(e) => {
        const { x, y } = local(e)
        const d = drag.current
        if (d) moveTo(d.index, x, y, e.altKey)
        else {
          const h = hit(x, y)
          setHover(h >= 0 ? h : null)
        }
      }}
      onPointerUp={(e) => {
        drag.current = null
        e.currentTarget.releasePointerCapture(e.pointerId)
      }}
      onPointerLeave={() => setHover(null)}
      onDoubleClick={(e) => {
        const { x, y } = local(e)
        const index = hit(x, y)
        if (index >= 0) onChange({ points: points.filter((_, i) => i !== index) })
      }}
      onContextMenu={(e) => {
        const { x, y } = local(e)
        const index = hit(x, y)
        if (index < 0) return
        e.preventDefault()
        const shape = BREAKPOINT_SHAPES[(BREAKPOINT_SHAPES.indexOf(points[index].shape) + 1) % BREAKPOINT_SHAPES.length]
        onChange({ points: points.map((p, i) => (i === index ? { ...p, shape } : p)) })
      }}
    />
  )
}
