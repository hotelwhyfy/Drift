import { useCallback, useRef, useState, useEffect } from 'react'
import type { Lane, LaneSource } from '@/automation/lane.ts'
import { curveFromStroke, CURVE_RESOLUTION } from '@/automation/curve.ts'
import type { Point } from '@/automation/curve.ts'
import { EXPRESSION_INFO, EXPRESSION_KEYS } from '@/fuzzy/expression.ts'
import type { InstrumentDef } from '@/instruments/types.ts'
import { controlsOf } from '@/instruments/controlsOf.ts'
import { released } from '@/ui/released.ts'
import { Select } from '@/ui/Select.tsx'
import type { SelectOption } from '@/ui/Select.tsx'

/** Follow lanes can't be made here, only kept: one is listed only while the lane is one. */
const sourceOptions = (following: boolean): SelectOption<LaneSource['kind']>[] => {
  const options: SelectOption<LaneSource['kind']>[] = [
    { value: 'curve', label: 'drawn' },
    { value: 'lfo', label: 'lfo' },
    { value: 'walk', label: 'walk' },
    { value: 'song', label: 'timeline' },
  ]
  if (following) options.push({ value: 'follow', label: 'follow' })
  return options
}

interface Props {
  lane: Lane
  /** The instrument the lane belongs to, for its parameter targets. */
  def: InstrumentDef
  accent: string
  /** 0..1 through the lane's loop, for the playhead. */
  phase: number
  onChange: (lane: Lane) => void
  onRemove: () => void
}

/** Quick picks. Any length can be typed; these are just the common ones. */
const BARS = [1, 4, 16, 64]
const MAX_BARS = 1024

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
export function LaneEditor({ lane, def, accent, phase, onChange, onRemove }: Props) {
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

    // Bar gridlines, so a drawn shape can be placed against the music. On a
    // long loop every bar would be a grey smear, so thin them to phrases.
    ctx.strokeStyle = '#ffffff10'
    ctx.lineWidth = 1
    const every = lane.bars > 64 ? 16 : lane.bars > 16 ? 4 : 1
    for (let b = every; b < lane.bars; b += every) {
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
      const note = lane.source.kind === 'walk'
        ? 'random walk — never repeats'
        : lane.source.kind === 'song'
          ? 'drawn on the song timeline, above'
          : 'generated'
      ctx.fillText(note, 10, h / 2 + 4)
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
        <Select
          value={lane.target.kind === 'expression' ? `e:${lane.target.key}` : lane.target.kind === 'level' ? 'level' : `p:${lane.target.param}`}
          items={[
            { group: 'Character', options: EXPRESSION_INFO.map((i) => ({ value: `e:${i.key}`, label: i.label })) },
            {
              group: def.name,
              options: [
                { value: 'level', label: 'Level' },
                ...controlsOf(def).map((c) => ({ value: `p:${c.param}`, label: c.label })),
              ],
            },
          ]}
          onChange={(v) => {
            if (v === 'level') onChange({ ...lane, target: { kind: 'level' } })
            else if (v.startsWith('p:')) onChange({ ...lane, target: { kind: 'param', param: v.slice(2) } })
            else {
              const key = EXPRESSION_KEYS.find((k) => `e:${k}` === v)
              if (key) onChange({ ...lane, target: { kind: 'expression', key } })
            }
          }}
          label="Automation target"
        />

        <Select
          value={lane.source.kind}
          items={sourceOptions(lane.source.kind === 'follow')}
          onChange={(kind) => {
            if (kind === 'curve') {
              onChange({ ...lane, source: { kind: 'curve', curve: curveFromStroke([{ x: 0, y: 0.5 }, { x: 1, y: 0.5 }]) } })
            } else if (kind === 'song') {
              onChange({ ...lane, source: { kind: 'song', envelope: { points: [] } } })
            } else if (kind === 'walk') {
              onChange({ ...lane, source: { kind: 'walk', smoothness: 0.7, seed: Math.floor(Math.random() * 1e9) } })
            } else if (kind === 'lfo') {
              onChange({ ...lane, source: { kind: 'lfo', shape: 'sine', bars: lane.bars, phase: 0 } })
            }
          }}
          label="Automation source"
        />

        {lane.source.kind !== 'song' && <BarsField
          bars={lane.bars}
          onChange={(bars) => onChange({
            ...lane,
            bars,
            // An LFO's period follows the loop length; two separate lengths
            // with only one of them visible was a trap.
            source: lane.source.kind === 'lfo' ? { ...lane.source, bars } : lane.source,
          })}
        />}

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
          if (released(e)) {
            commit(stroke)
            setStroke(null)
            return
          }
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

/**
 * The loop length: typed freely, with a few one-tap lengths beside it. A list
 * of fixed choices capped the longest gesture at sixteen bars, which is under
 * a minute of music.
 */
function BarsField({ bars, onChange }: { bars: number; onChange: (bars: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  const commit = (text: string): void => {
    const n = Number(text)
    if (Number.isFinite(n) && n > 0) onChange(Math.min(MAX_BARS, Math.max(0.25, n)))
    setDraft(null)
  }
  return (
    <span className="lane-bars">
      <input
        type="number"
        min={0.25}
        max={MAX_BARS}
        step={1}
        value={draft ?? String(bars)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(e.currentTarget.value) }}
        aria-label="Loop length in bars"
      />
      <span className="lane-bars-unit">bars</span>
      {BARS.map((b) => (
        <button key={b} type="button" className={bars === b ? 'on' : ''} onClick={() => onChange(b)}>{b}</button>
      ))}
    </span>
  )
}
