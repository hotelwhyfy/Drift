import { useState } from 'react'
import type { ChangeEvent, FocusEvent, KeyboardEvent } from 'react'

export interface CommitFieldProps {
  value: string
  onChange: (e: ChangeEvent<HTMLInputElement>) => void
  onBlur: (e: FocusEvent<HTMLInputElement>) => void
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void
}

export interface CommitField {
  /** Spread onto the `<input>`. `input.value` is what the field shows now, typed or not. */
  input: CommitFieldProps
  /** Commits `text` at once and drops the draft — for a control beside the field, like a stepper. */
  commit: (text: string) => void
}

/**
 * A typed field that commits when it is done with.
 *
 * Shows `shown` until someone types, then shows what they typed; on blur or
 * Enter it hands the text to `commit` and goes back to `shown`, which is
 * whatever the committed value has become. Committing as they go would fight
 * the typing: clearing a number to retype it would first become zero.
 */
export function useCommitField(shown: string, commit: (text: string) => void): CommitField {
  const [draft, setDraft] = useState<string | null>(null)
  const finish = (text: string): void => {
    commit(text)
    setDraft(null)
  }
  return {
    input: {
      value: draft ?? shown,
      onChange: (e) => setDraft(e.target.value),
      onBlur: (e) => finish(e.target.value),
      onKeyDown: (e) => { if (e.key === 'Enter') finish(e.currentTarget.value) },
    },
    commit: finish,
  }
}
