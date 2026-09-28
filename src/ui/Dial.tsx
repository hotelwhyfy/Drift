import { useCallback, useRef } from 'react'

interface DialProps {
  label: string
  low?: string
  high?: string
  value: number
  accent: string
  onChange: (v: number) => void
  /** Diameter in px. The master dials are 84; instrument knobs are smaller. */
  size?: number
  /**
   * A second value drawn as a thin arc — where the music actually is, when
   * that differs from where the dial is set (automation, or the rules).
   */
  ghost?: number
  /** Shown dimmed: the value is not set by hand. */
  auto?: boolean
  /** Double-click. Defaults to returning to the middle. */
  onReset?: () => void
  /** Replaces the percentage readout. */
  display?: string
}

const DEFAULT_SIZE = 84
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
export function Dial({
  label, low, high, value, accent, onChange, size = DEFAULT_SIZE, ghost, auto, onReset, display,
}: DialProps) {
  const SIZE = size
  const R = size * (32 / 84)
  const CIRC = 2 * Math.PI * R
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
        aria-valuetext={low && high
          ? `${label} ${Math.round(value * 100)} percent, between ${low} and ${high}`
          : `${label} ${display ?? `${Math.round(value * 100)} percent`}${auto ? ', automatic' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
        onDoubleClick={() => (onReset ? onReset() : onChange(0.5))}
        style={size === DEFAULT_SIZE ? undefined : { width: size, height: size }}
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
              strokeOpacity={auto ? 0.35 : 1}
              strokeDasharray={`${filled} ${CIRC}`}
            />
            {ghost !== undefined && Math.abs(ghost - value) > 0.01 && (
              <circle
                className="dial-ghost"
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={R - 5}
                stroke={accent}
                strokeDasharray={`${arc * Math.min(1, Math.max(0, ghost))} ${CIRC}`}
              />
            )}
          </g>
        </svg>
        <span className={`dial-value ${auto ? 'auto' : ''}`}>{display ?? Math.round(value * 100)}</span>
      </div>
      <div className="dial-label">{label}</div>
      {low && high && (
        <div className="dial-ends">
          <span className={value < 0.34 ? 'on' : ''}>{low}</span>
          <span className={value > 0.66 ? 'on' : ''}>{high}</span>
        </div>
      )}
    </div>
  )
}
