import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@/ui/types.ts'

export interface Notice {
  text: string
  /** What the toast's Undo puts back, if it offers one. */
  undo: Session | null
}

/**
 * The toast. One state, so a later notice can never show an earlier one's
 * Undo. Notices clear themselves; they are confirmations, not state, and one
 * that offers Undo stays long enough to reach for it.
 */
export function useNotice(): { notice: Notice | null, say: (text: string, undo?: Session | null) => void } {
  const [notice, setNotice] = useState<Notice | null>(null)
  const say = useCallback((text: string, undo: Session | null = null) => setNotice({ text, undo }), [])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), notice.undo ? 8000 : 4500)
    return () => window.clearTimeout(timer)
  }, [notice])

  return { notice, say }
}
