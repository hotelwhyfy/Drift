import { useEffect, useRef, useState } from 'react'

interface Props {
  value: string
  onCommit: (seed: string) => void
  onShuffle: () => void
}

/** Long enough for a sentence, short enough to stay a label. */
const MAX_SEED = 64

/**
 * The seed, as typed text.
 *
 * Any string works — it is hashed to a number — so there is no reason to hide
 * it behind a dice roll. Typing one makes a piece findable again and shareable
 * by name: "midnight garden" is the same music on any machine, at the same
 * dial positions, forever. The shuffle button is still there for when you want
 * somewhere to start rather than something in particular.
 */
export function SeedField({ value, onCommit, onShuffle }: Props) {
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  // Follow the seed when it changes from elsewhere — the shuffle button, or
  // opening a project.
  useEffect(() => setDraft(value), [value])

  const commit = (): void => {
    const trimmed = draft.trim()
    if (!trimmed) {
      setDraft(value)
      return
    }
    if (trimmed !== value) onCommit(trimmed)
  }

  return (
    <div className="seed">
      <div className="seed-row">
        <input
          ref={inputRef}
          type="text"
          className="seed-input"
          value={draft}
          maxLength={MAX_SEED}
          spellCheck={false}
          autoComplete="off"
          aria-label="Seed"
          title="Any text. The same seed and dials always give the same music."
          onChange={(e) => setDraft(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              commit()
              inputRef.current?.blur()
            } else if (e.key === 'Escape') {
              setDraft(value)
              inputRef.current?.blur()
            }
            // Space would otherwise reach the global play/pause shortcut.
            e.stopPropagation()
          }}
          onBlur={commit}
        />
        <button
          type="button"
          className="seed-shuffle"
          onClick={onShuffle}
          aria-label="Random seed"
          title="Somewhere else entirely"
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M2 4.2h2.6l6.8 7.6H14M2 11.8h2.6l2.1-2.3M9.3 6.1l2.1-1.9H14" />
            <path d="M12.2 2.6 14 4.2l-1.8 1.6M12.2 10.2 14 11.8l-1.8 1.6" />
          </svg>
        </button>
      </div>
      <span className="seed-hint">seed</span>
    </div>
  )
}
