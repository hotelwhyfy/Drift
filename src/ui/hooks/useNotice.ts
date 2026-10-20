import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@/ui/types.ts'

export interface Notice {
  /** Changes with every notice, so a replacement plays its entrance afresh. */
  id: number
  text: string
  /** What the toast's Undo puts back, if it offers one. */
  undo: Session | null
  /** Playing its exit; gone once that has had time to finish. */
  leaving: boolean
}

/** How long the toast's exit animation runs; matches `toast-out` in styles.css. */
export const TOAST_EXIT_MS = 160

/**
 * The toast. One state, so a later notice can never show an earlier one's
 * Undo. Notices clear themselves; they are confirmations, not state, and one
 * that offers Undo stays long enough to reach for it.
 *
 * Clearing is two steps — leaving, then gone — so the toast can animate out.
 * The second step is a timer rather than `animationend`, which never fires
 * when reduced motion turns the animation off.
 */
export function useNotice(): { notice: Notice | null, say: (text: string, undo?: Session | null) => void } {
  const [notice, setNotice] = useState<Notice | null>(null)
  const say = useCallback((text: string, undo: Session | null = null) => {
    setNotice((previous) => ({ id: (previous?.id ?? 0) + 1, text, undo, leaving: false }))
  }, [])

  useEffect(() => {
    if (!notice) return
    const timer = notice.leaving
      ? window.setTimeout(() => setNotice(null), TOAST_EXIT_MS)
      : window.setTimeout(() => setNotice({ ...notice, leaving: true }), notice.undo ? 8000 : 4500)
    return () => window.clearTimeout(timer)
  }, [notice])

  return { notice, say }
}
