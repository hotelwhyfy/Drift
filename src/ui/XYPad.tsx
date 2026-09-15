import { useCallback, useRef } from 'react'
import type { ExpressionKey } from '../fuzzy/expression.ts'
import { EXPRESSION_INFO } from '../fuzzy/expression.ts'

interface Props {
  xKey: ExpressionKey
  yKey: ExpressionKey
  x: number
  y: number
  /** Where the instrument actually ends up after following the master dials. */
  ghostX: number
  ghostY: number
  accent: string
  onChange: (x: number, y: number) => void
  onAxisChange: (axis: 'x' | 'y', key: ExpressionKey) => void
}

const label = (k: ExpressionKey): string =>
  EXPRESSION_INFO.find((i) => i.key === k)?.label ?? k
const ends = (k: ExpressionKey): [string, string] => {
  const info = EXPRESSION_INFO.find((i) => i.key === k)
  return [info?.low ?? '', info?.high ?? '']
}

/**
 * Two expression dimensions as one draggable point.
 *
 * Which two is up to the user, because the interesting pairing depends on what
 * the instrument is for — brightness against weight for a pad, density against
 * motion for a kit. Fixing the axes would have made this a preset rather than
 * a control.
 */
export function XYPad({ xKey, yKey, x, y, ghostX, ghostY, accent, onChange, onAxisChange }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const fromEvent = useCallback((e: React.PointerEvent) => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const nx = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    // Screen y grows downward; expression grows upward.
    const ny = Math.min(1, Math.max(0, 1 - (e.clientY - rect.top) / rect.height))
    onChange(nx, ny)
  }, [onChange])

  const [xLow, xHigh] = ends(xKey)
  const [yLow, yHigh] = ends(yKey)

  return (
    <div className="xy">
      <div className="xy-axis xy-axis-y">
        <select
          value={yKey}
          onChange={(e) => onAxisChange('y', e.target.value as ExpressionKey)}
          aria-label="Vertical axis"
        >
          {EXPRESSION_INFO.map((i) => <option key={i.key} value={i.key}>{i.label}</option>)}
        </select>
      </div>
      <div
        className="xy-field"
        ref={ref}
        role="application"
        aria-label={`${label(xKey)} against ${label(yKey)}`}
        onPointerDown={(e) => {
          dragging.current = true
          e.currentTarget.setPointerCapture(e.pointerId)
          fromEvent(e)
        }}
        onPointerMove={(e) => { if (dragging.current) fromEvent(e) }}
        onPointerUp={(e) => {
          dragging.current = false
          e.currentTarget.releasePointerCapture(e.pointerId)
        }}
      >
        <span className="xy-end xy-top">{yHigh}</span>
        <span className="xy-end xy-bottom">{yLow}</span>
        <span className="xy-end xy-left">{xLow}</span>
        <span className="xy-end xy-right">{xHigh}</span>
        {(Math.abs(ghostX - x) > 0.01 || Math.abs(ghostY - y) > 0.01) && (
          // The instrument is being pulled away from where it was placed, so
          // show where it actually is. Without this the pad looks broken when
          // the slot is following the master dials.
          <div
            className="xy-ghost"
            style={{ left: `${ghostX * 100}%`, top: `${(1 - ghostY) * 100}%`, borderColor: accent }}
          />
        )}
        <div
          className="xy-dot"
          style={{ left: `${x * 100}%`, top: `${(1 - y) * 100}%`, background: accent }}
        />
      </div>
      <div className="xy-axis xy-axis-x">
        <select
          value={xKey}
          onChange={(e) => onAxisChange('x', e.target.value as ExpressionKey)}
          aria-label="Horizontal axis"
        >
          {EXPRESSION_INFO.map((i) => <option key={i.key} value={i.key}>{i.label}</option>)}
        </select>
      </div>
    </div>
  )
}
