import { useCallback, useRef, useState, useEffect } from 'react'
import type { Lane } from '../automation/lane.ts'
import { curveFromStroke, CURVE_RESOLUTION } from '../automation/curve.ts'
import type { Point } from '../automation/curve.ts'
import { EXPRESSION_INFO } from '../fuzzy/expression.ts'
import type { ExpressionKey } from '../fuzzy/expression.ts'

interface Props {
  lane: Lane
  accent: string
  /** 0..1 through the lane's loop, for the playhead. */
  phase: number
  onChange: (lane: Lane) => void
  onRemove: () => void
}

const BARS = [1, 2, 4, 8, 16]

/**
 * One automation lane, drawn directly.
 *
 * Drawing is the primary way to fill it — you sketch the shape you want and it
 * loops. But a drawn loop repeats exactly, and exact repetition is the one
 * thing endless music cannot afford, so the same lane can instead run a bar-
 * synced LFO or a bounded random walk that never repeats. The target picker
 * covers both the expression dimensions (which go through the rules) and the
 * instrument's own parameters (which bypass them).
 */
export function LaneEditor({ lane, accent, phase, onChange, onRemove }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [stroke, setStroke] = useState<Point[] | null>(null)

  const points = lane.source.kind === 'curve' ? lane.source.curve.points : null

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const rect = canvas.getBoundingClientRect()
    canvas.width = Math.max(1, rect.width * dpr)
    canvas.height = Math.max(1, rect.height * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const w = rect.width
    const h = rect.height
    ctx.clearRect(0, 0, w, h)

    // Bar gridlines, so a drawn shape can be placed against the music.
    ctx.strokeStyle = '#ffffff10'
    ctx.lineWidth = 1
    for (let b = 1; b < lane.bars; b++) {
      const x = (b / lane.bars) * w
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, h)
      ctx.stroke()
    }

    const drawn = stroke
      ? stroke.map((p) => ({ x: p.x * w, y: (1 - p.y) * h }))
      : points
        ? Array.from({ length: CURVE_RESOLUTION }, (_, i) => ({
            x: (i / (CURVE_RESOLUTION - 1)) * w,
            y: (1 - points[i]) * h,
          }))
        : null

    if (drawn && drawn.length > 1) {
      ctx.beginPath()
      drawn.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
      ctx.strokeStyle = accent
      ctx.lineWidth = 1.5
      ctx.stroke()
      ctx.lineTo(w, h)
      ctx.lineTo(0, h)
      ctx.closePath()
      ctx.fillStyle = `${accent}22`
      ctx.fill()
    } else if (!points) {
      ctx.fillStyle = '#ffffff30'
      ctx.font = '11px ui-sans-serif, system-ui, sans-serif'
      ctx.fillText(lane.source.kind === 'walk' ? 'random walk — never repeats' : 'generated', 10, h / 2 + 4)
    }

    // Playhead.
    const px = (phase % 1) * w
    ctx.strokeStyle = `${accent}88`
    ctx.beginPath()
    ctx.moveTo(px, 0)
    ctx.lineTo(px, h)
    ctx.stroke()
  }, [points, stroke, accent, phase, lane.bars, lane.source.kind])

  const pointFrom = useCallback((e: React.PointerEvent): Point => {
    const rect = e.currentTarget.getBoundingClientRect()
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, 1 - (e.clientY - rect.top) / rect.height)),
    }
  }, [])

  const commit = useCallback((finalStroke: Point[]) => {
    if (finalStroke.length < 2) return
    onChange({ ...lane, source: { kind: 'curve', curve: curveFromStroke(finalStroke) } })
  }, [lane, onChange])

  return (
    <div className="lane">
      <div className="lane-head">
        <select
          value={lane.target.kind === 'expression' ? `e:${lane.target.key}` : lane.target.kind === 'level' ? 'level' : `p:${lane.target.param}`}
          onChange={(e) => {
            const v = e.target.value
            if (v === 'level') onChange({ ...lane, target: { kind: 'level' } })
            else if (v.startsWith('e:')) {
              onChange({ ...lane, target: { kind: 'expression', key: v.slice(2) as ExpressionKey } })
            }
          }}
          aria-label="Automation target"
        >
          {EXPRESSION_INFO.map((i) => (
            <option key={i.key} value={`e:${i.key}`}>{i.label}</option>
          ))}
          <option value="level">Level</option>
        </select>

        <select
          value={lane.source.kind}
          onChange={(e) => {
            const kind = e.target.value
            if (kind === 'curve') {
              onChange({ ...lane, source: { kind: 'curve', curve: curveFromStroke([{ x: 0, y: 0.5 }, { x: 1, y: 0.5 }]) } })
            } else if (kind === 'walk') {
              onChange({ ...lane, source: { kind: 'walk', smoothness: 0.7, seed: Math.floor(Math.random() * 1e9) } })
            } else {
              onChange({ ...lane, source: { kind: 'lfo', shape: 'sine', bars: lane.bars, phase: 0 } })
            }
          }}
          aria-label="Automation source"
        >
          <option value="curve">drawn</option>
          <option value="lfo">lfo</option>
          <option value="walk">walk</option>
        </select>

        <select
          value={lane.bars}
          onChange={(e) => onChange({ ...lane, bars: Number(e.target.value) })}
          aria-label="Loop length in bars"
        >
          {BARS.map((b) => <option key={b} value={b}>{b} bar{b > 1 ? 's' : ''}</option>)}
        </select>

        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={lane.depth}
          onChange={(e) => onChange({ ...lane, depth: Number(e.target.value) })}
          aria-label="Depth"
          className="lane-depth"
        />

        <button
          type="button"
          className={lane.enabled ? 'on' : ''}
          onClick={() => onChange({ ...lane, enabled: !lane.enabled })}
          aria-label={lane.enabled ? 'Disable lane' : 'Enable lane'}
        >
          {lane.enabled ? '◉' : '○'}
        </button>
        <button type="button" onClick={onRemove} aria-label="Remove lane">×</button>
      </div>

      <canvas
        ref={canvasRef}
        className="lane-canvas"
        onPointerDown={(e) => {
          if (lane.source.kind !== 'curve') return
          e.currentTarget.setPointerCapture(e.pointerId)
          setStroke([pointFrom(e)])
        }}
        onPointerMove={(e) => {
          if (!stroke) return
          setStroke([...stroke, pointFrom(e)])
        }}
        onPointerUp={(e) => {
          if (stroke) commit(stroke)
          setStroke(null)
          e.currentTarget.releasePointerCapture(e.pointerId)
        }}
      />
    </div>
  )
}
