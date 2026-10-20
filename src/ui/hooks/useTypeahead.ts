import { useCallback, useRef } from 'react'
import { findTypeahead } from '@/ui/controls/findTypeahead.ts'

/** Keys typed closer together than this build one search; further apart, a new one. */
const TYPEAHEAD_MS = 600

export interface Typeahead {
  /** Adds `ch` (typed at time `at`) to the search and returns the option it lands on, or -1. */
  search: (ch: string, at: number, from: number) => number
  /** Whether a key at time `at` would continue the search in progress. */
  isTyping: (at: number) => boolean
}

/** Type-to-jump over a list of option labels, for a control that keeps focus on its trigger. */
export function useTypeahead(labels: readonly string[]): Typeahead {
  const typed = useRef({ text: '', at: -Infinity })

  const search = useCallback((ch: string, at: number, from: number): number => {
    const t = typed.current
    t.text = at - t.at < TYPEAHEAD_MS ? t.text + ch.toLowerCase() : ch.toLowerCase()
    t.at = at
    return findTypeahead(labels, t.text, from)
  }, [labels])

  const isTyping = useCallback((at: number): boolean => at - typed.current.at < TYPEAHEAD_MS, [])

  return { search, isTyping }
}
