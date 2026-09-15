import { useCallback, useRef } from 'react'

interface DialProps {
  label: string
  low: string
  high: string
  value: number
  accent: string
  onChange: (v: number) => void
}

const SIZE = 84
const R = 32
const CIRC = 2 * Math.PI * R
/** Leaves a gap at the bottom, so the travel has a visible start and end. */
const SWEEP = 0.76

/**
 * A dial rather than a slider.
 *
 * Vertical dragging with pointer capture, so the pointer can wander outside the
 * control without the gesture breaking — the alternative is a knob that drops
 * its value the moment your hand drifts, which is exactly what happens when
 * someone is listening rather than looking.
 */
export function Dial({ label, low, high, value, accent, onChange }: DialProps) {
  const dragging = useRef<{ y: number; start: number } | null>(null)

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId)
      dragging.current = { y: e.clientY, start: value }
    },
    [value],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const d = dragging.current
      if (!d) return
      // Shift gives a ten-times finer gesture, which is the difference between
      // "somewhere near there" and actually placing a value.
      const scale = e.shiftKey ? 0.0006 : 0.006
      const next = Math.min(1, Math.max(0, d.start + (d.y - e.clientY) * scale))
      onChange(next)
    },
    [onChange],
  )

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = null
    e.currentTarget.releasePointerCapture(e.pointerId)
  }, [])

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const step = e.shiftKey ? 0.01 : 0.05
      if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
        onChange(Math.min(1, value + step))
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
        onChange(Math.max(0, value - step))
      } else if (e.key === 'Home') {
        onChange(0)
      } else if (e.key === 'End') {
        onChange(1)
      } else {
        return
      }
      e.preventDefault()
    },
    [value, onChange],
  )

  const arc = CIRC * SWEEP
  const filled = arc * value
  const rotation = 90 + (1 - SWEEP) * 180

  return (
    <div className="dial">
      <div
        className="dial-hit"
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value * 100)}
        aria-valuetext={`${label} ${Math.round(value * 100)} percent, between ${low} and ${high}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
        onDoubleClick={() => onChange(0.5)}
      >
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
          <g transform={`rotate(${rotation} ${SIZE / 2} ${SIZE / 2})`}>
            <circle
              className="dial-track"
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={R}
              strokeDasharray={`${arc} ${CIRC}`}
            />
            <circle
              className="dial-fill"
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={R}
              stroke={accent}
              strokeDasharray={`${filled} ${CIRC}`}
            />
          </g>
        </svg>
        <span className="dial-value">{Math.round(value * 100)}</span>
      </div>
      <div className="dial-label">{label}</div>
      <div className="dial-ends">
        <span className={value < 0.34 ? 'on' : ''}>{low}</span>
        <span className={value > 0.66 ? 'on' : ''}>{high}</span>
      </div>
    </div>
  )
}
