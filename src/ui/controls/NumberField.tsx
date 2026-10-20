import type { CommitField } from '@/ui/hooks/useCommitField.ts'

const DIRECTIONS: Array<1 | -1> = [1, -1]

interface Props {
  field: CommitField
  min: number
  max: number
  step?: number
  /** Shown when empty, and where the stepper starts from then. */
  placeholder?: string
  'aria-label': string
}

/**
 * A number input with steppers drawn to match the rest of the interface; the
 * browser's own spin buttons are hidden. A step commits at once, like any
 * other button, while typing still waits for Enter or blur.
 */
export function NumberField({ field, min, max, step = 1, placeholder, 'aria-label': label }: Props) {
  const stepBy = (direction: 1 | -1): void => {
    const typed = Number(field.input.value.trim() === '' ? placeholder ?? min : field.input.value)
    const base = Number.isFinite(typed) ? typed : min
    // Snap to the step grid so 437.3 steps to 437.5, not 437.8.
    const next = Math.round((base + direction * step) / step) * step
    field.commit(String(Math.min(max, Math.max(min, Number(next.toFixed(6))))))
  }
  return (
    <span className="num">
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
        {...field.input}
        aria-label={label}
      />
      <span className="num-steps">
        {DIRECTIONS.map((direction) => (
          <button
            key={direction}
            type="button"
            tabIndex={-1}
            aria-label={direction === 1 ? 'Increase' : 'Decrease'}
            // Keep focus in the field: a blur would commit the draft first.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => stepBy(direction)}
          >
            <svg viewBox="0 0 8 5" aria-hidden="true">
              <path d={direction === 1 ? 'M1 4l3-3 3 3' : 'M1 1l3 3 3-3'} />
            </svg>
          </button>
        ))}
      </span>
    </span>
  )
}
