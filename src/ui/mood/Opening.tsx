import { useEffect, useRef, useState } from 'react'
import type { Prompt } from '../../mood/prompts.ts'

interface Props {
  prompt: Prompt
  onAnswer: (text: string) => void
}

/**
 * The question.
 *
 * One line, one field, nothing else on screen. Everything the app can do is
 * downstream of this answer, and putting any of it here — a play button, a
 * settings icon, a logo — would turn a question into a form.
 */
export function Opening({ prompt, onAnswer }: Props) {
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // Focused, but the question is readable first: nothing moves, nothing
    // scrolls, the cursor is simply already where it needs to be.
    const timer = window.setTimeout(() => inputRef.current?.focus(), 420)
    return () => window.clearTimeout(timer)
  }, [prompt.id])

  const submit = (value: string): void => {
    const trimmed = value.trim()
    if (trimmed.length === 0) return
    onAnswer(trimmed)
  }

  return (
    <main className="opening">
      <form
        className="opening-inner"
        onSubmit={(e) => {
          e.preventDefault()
          submit(text)
        }}
      >
        <h1 className="opening-question">{prompt.question}</h1>

        <div className="opening-field">
          <input
            ref={inputRef}
            type="text"
            value={text}
            placeholder={prompt.placeholder}
            onChange={(e) => setText(e.target.value)}
            aria-label={prompt.question}
            spellCheck={false}
            autoComplete="off"
            maxLength={120}
          />
          <button
            type="submit"
            className="opening-go"
            disabled={text.trim().length === 0}
            aria-label="Begin"
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M3 8h9.5M8.6 4.2 12.9 8l-4.3 3.8" />
            </svg>
          </button>
        </div>

        <div className="opening-offers">
          {prompt.offers.map((offer) => (
            <button key={offer} type="button" onClick={() => submit(offer)}>
              {offer}
            </button>
          ))}
        </div>
      </form>
    </main>
  )
}
