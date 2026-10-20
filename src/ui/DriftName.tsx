import { useEffect, useState } from 'react'
import { Tooltip } from '@/ui/Tooltip.tsx'

interface Props {
  value: string
  /** A different name was entered: build that drift. */
  onCommit: (name: string) => void
}

/** Long enough for a sentence, short enough to stay a label. */
const MAX_NAME = 64

/**
 * The drift's name, which is also its seed: one name, one drift.
 *
 * Any text works — it is hashed — so "midnight garden" is the same dials,
 * rack, song and notes on any machine, forever, and typing a name you were
 * given brings that drift back. Building one replaces everything on screen,
 * so only Enter commits; a stray blur or Escape puts the name back.
 */
export function DriftName({ value, onCommit }: Props) {
  const [draft, setDraft] = useState(value)

  // Follow the name when it changes from elsewhere: generating, opening, undo.
  useEffect(() => setDraft(value), [value])

  return (
    <Tooltip content="The drift's name. Type another and press Enter to build that drift — the same name always gives the same drift.">
      {/* The input and an invisible copy of its text share one grid cell,
          so the field is exactly as wide as the name. */}
      <span className="drift-name">
        <span className="drift-name-mirror" aria-hidden="true">{draft || ' '}</span>
        <input
          type="text"
          className="drift-name-input"
          value={draft}
          maxLength={MAX_NAME}
          spellCheck={false}
          autoComplete="off"
          aria-label="Drift name"
          onChange={(e) => setDraft(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const name = draft.trim()
              if (name && name !== value) onCommit(name)
              else setDraft(value)
              e.currentTarget.blur()
            } else if (e.key === 'Escape') {
              setDraft(value)
              e.currentTarget.blur()
            }
            // Space would otherwise reach the global play/pause shortcut.
            e.stopPropagation()
          }}
          onBlur={() => setDraft(value)}
        />
      </span>
    </Tooltip>
  )
}
