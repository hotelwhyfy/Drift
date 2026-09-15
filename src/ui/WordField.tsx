import { useState, useCallback } from 'react'
import { positionPhrase, SUGGESTIONS } from '../fuzzy/lexicon.ts'
import type { Expression } from '../fuzzy/expression.ts'

interface Props {
  onApply: (expression: Expression) => void
  accent: string
}

/**
 * Type a word, get a sound.
 *
 * The confidence readout is the important part of the interface here: it says
 * plainly when a word was understood, when it was matched to something close,
 * and when it was simply hashed. Without it the control feels like it is
 * pretending to understand language, which it is not — it knows two hundred
 * words and is honest about the rest.
 */
export function WordField({ onApply, accent }: Props) {
  const [text, setText] = useState('')
  const [report, setReport] = useState<string | null>(null)

  const apply = useCallback((phrase: string) => {
    const trimmed = phrase.trim()
    if (!trimmed) return
    const result = positionPhrase(trimmed)
    if (result.matches.length === 0) {
      setReport('no usable words')
      return
    }
    onApply(result.expression)
    setReport(
      result.matches
        .map((m) => {
          if (m.confidence >= 0.999) return m.word
          if (m.nearest && m.confidence > 0.34) return `${m.word} ≈ ${m.nearest}`
          return `${m.word} (invented)`
        })
        .join(' · '),
    )
  }, [onApply])

  return (
    <div className="word">
      <form
        onSubmit={(e) => { e.preventDefault(); apply(text) }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="describe it…"
          aria-label="Describe the sound in words"
          spellCheck={false}
        />
        <button type="submit" style={{ color: accent }}>set</button>
      </form>
      <div className="word-suggestions">
        {SUGGESTIONS.slice(0, 7).map((w) => (
          <button key={w} type="button" onClick={() => { setText(w); apply(w) }}>{w}</button>
        ))}
      </div>
      {report && <div className="word-report">{report}</div>}
    </div>
  )
}
