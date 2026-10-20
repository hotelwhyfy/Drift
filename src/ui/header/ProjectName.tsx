import { useEffect, useRef, useState } from 'react'
import { Tooltip } from '@/ui/controls/Tooltip.tsx'

interface Props {
  value: string
  /** The seed the drift was generated from, mentioned once the name moves away from it. */
  seed: string
  onRename: (name: string) => void
}

/** Long enough for a sentence, short enough to stay a label. */
const MAX_NAME = 64

/**
 * The project's name, editable in place like any text field: Enter or
 * clicking away keeps what was typed, Escape puts the old name back.
 *
 * Renaming changes nothing about the music. The drift's seed is separate and
 * picked by generate; the name only starts out the same.
 */
export function ProjectName({ value, seed, onRename }: Props) {
  const [draft, setDraft] = useState(value)
  // Escape blurs the field, and the blur must not then keep the draft.
  const cancelled = useRef(false)

  // Follow the name when it changes from elsewhere: generating, opening, undo.
  useEffect(() => setDraft(value), [value])

  const keep = (): void => {
    const name = draft.trim()
    if (name && name !== value) onRename(name)
    else setDraft(value)
  }

  const tip = `The project's name, used when you save or capture.${seed !== value ? ` Generated from ${seed}.` : ''}`

  return (
    <Tooltip content={tip}>
      {/* The input and an invisible copy of its text share one grid cell,
          so the field is exactly as wide as the name. */}
      <span className="project-name">
        <span className="project-name-mirror" aria-hidden="true">{draft || ' '}</span>
        <input
          type="text"
          className="project-name-input"
          value={draft}
          maxLength={MAX_NAME}
          spellCheck={false}
          autoComplete="off"
          aria-label="Project name"
          onChange={(e) => setDraft(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.currentTarget.blur()
            } else if (e.key === 'Escape') {
              cancelled.current = true
              setDraft(value)
              e.currentTarget.blur()
            }
            // Space would otherwise reach the global play/pause shortcut.
            e.stopPropagation()
          }}
          onBlur={() => {
            if (cancelled.current) cancelled.current = false
            else keep()
          }}
        />
      </span>
    </Tooltip>
  )
}
