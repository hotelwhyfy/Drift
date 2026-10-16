import { useState } from 'react'
import { Tooltip } from '@/ui/Tooltip.tsx'
import { MAX_CAPTURE_MINUTES, parseMinutes } from '@/ui/parseMinutes.ts'
import type { CaptureLength } from '@/ui/hooks/useCapture.ts'

const CAPTURE_LENGTHS = [1, 3, 10, 30]

interface Props {
  length: CaptureLength
  onLengthChange: (length: CaptureLength) => void
  /** The song's length, for the tooltip. */
  songSeconds: number
  /** 0..1 while a capture is running, otherwise null. */
  progress: number | null
  onCapture: () => void
}

/** Picks how much to export, and starts it. */
export function CaptureControls({ length, onLengthChange, songSeconds, progress, onCapture }: Props) {
  /** What is in the minutes field while it is being typed in. */
  const [minutesDraft, setMinutesDraft] = useState('')
  const minutes = Math.floor(songSeconds / 60)
  const rest = String(Math.floor(songSeconds % 60)).padStart(2, '0')

  return (
    <div className="capture">
      <div className="lengths" role="group" aria-label="Capture length">
        <Tooltip content={`The song once through, ${minutes}:${rest} plus its tail`}>
          <button
            type="button"
            className={length === 'song' ? 'on' : ''}
            onClick={() => onLengthChange('song')}
          >
            song
          </button>
        </Tooltip>
        {CAPTURE_LENGTHS.map((m) => (
          <button
            key={m}
            type="button"
            className={length === m ? 'on' : ''}
            onClick={() => { onLengthChange(m); setMinutesDraft('') }}
          >
            {m}m
          </button>
        ))}
        <Tooltip content={`Any length up to ${MAX_CAPTURE_MINUTES} minutes`}>
          <label
            className={`length-custom ${typeof length === 'number' && !CAPTURE_LENGTHS.includes(length) ? 'on' : ''}`}
          >
            <input
              type="text"
              inputMode="decimal"
              placeholder="…"
              aria-label="Capture length in minutes"
              value={minutesDraft}
              onChange={(e) => {
                setMinutesDraft(e.target.value)
                const m = parseMinutes(e.target.value)
                if (m !== null) onLengthChange(m)
              }}
              onBlur={() => {
                // Show what will actually be captured, once clamped and rounded.
                const m = parseMinutes(minutesDraft)
                setMinutesDraft(m === null || CAPTURE_LENGTHS.includes(m) ? '' : String(m))
                if (m !== null) onLengthChange(m)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
              }}
            />
            m
          </label>
        </Tooltip>
      </div>
      <button
        className="capture-go"
        onClick={onCapture}
        disabled={progress !== null}
        type="button"
      >
        {progress === null ? 'capture' : `${Math.round(progress * 100)}%`}
      </button>
    </div>
  )
}
