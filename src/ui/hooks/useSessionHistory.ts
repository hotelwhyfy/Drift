import { useCallback, useEffect, useRef, useState } from 'react'
import type { Session } from '@/ui/types.ts'
import { UndoHistory } from '@/ui/undoHistory.ts'
import { released } from '@/ui/released.ts'
import { samePiece } from '@/ui/samePiece.ts'

/** How long the document must sit still before it counts as one undoable step. */
const SETTLE_MS = 400

export interface SessionHistory {
  canUndo: boolean
  canRedo: boolean
  undo: () => void
  redo: () => void
  /** Call before replacing the whole session, so the replacement is a step of its own. */
  beforeReplace: () => void
}

/**
 * Undo history. A step is the document once it has settled: nothing changed
 * for SETTLE_MS and no pointer is held down. Dragging a dial or drawing a
 * curve sets state every frame, and undo should take back the gesture, not
 * one frame of it.
 *
 * `restore` puts a past state back; it is given the session it replaces.
 */
export function useSessionHistory(
  session: Session,
  restore: (past: Session, current: Session) => void,
): SessionHistory {
  const historyRef = useRef<UndoHistory<Session> | null>(null)
  if (historyRef.current === null) historyRef.current = new UndoHistory(session)
  const history = historyRef.current
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const sessionRef = useRef(session)
  sessionRef.current = session
  const pointerDown = useRef(false)
  /** Set by whole-session replacements, so they are a step of their own. */
  const settleNow = useRef(false)

  const settle = useCallback(() => {
    const now = sessionRef.current
    if (samePiece(history.current, now)) history.replace(now)
    else history.record(now)
    setCanUndo(history.canUndo)
    setCanRedo(history.canRedo)
  }, [history])

  useEffect(() => {
    if (samePiece(history.current, session)) {
      history.replace(session)
      settleNow.current = false
      return
    }
    if (settleNow.current) {
      settleNow.current = false
      settle()
      return
    }
    // Still dragging: the pointerup listener below settles it instead.
    const timer = window.setTimeout(() => { if (!pointerDown.current) settle() }, SETTLE_MS)
    return () => window.clearTimeout(timer)
  }, [session, history, settle])

  useEffect(() => {
    // Capture phase, so a control that stops propagation cannot hide a release.
    const down = (): void => { pointerDown.current = true }
    const up = (): void => {
      pointerDown.current = false
      if (!samePiece(history.current, sessionRef.current)) settle()
    }
    // A release that never arrived would otherwise hold the undo step open
    // until the next click.
    const move = (e: PointerEvent): void => { if (pointerDown.current && released(e)) up() }
    window.addEventListener('pointerdown', down, true)
    window.addEventListener('pointerup', up, true)
    window.addEventListener('pointercancel', up, true)
    window.addEventListener('pointermove', move, true)
    return () => {
      window.removeEventListener('pointerdown', down, true)
      window.removeEventListener('pointerup', up, true)
      window.removeEventListener('pointercancel', up, true)
      window.removeEventListener('pointermove', move, true)
    }
  }, [history, settle])

  const step = useCallback((travel: () => Session | null) => {
    // An edit still settling is the step being travelled from, not one to lose.
    if (!samePiece(history.current, sessionRef.current)) settle()
    const target = travel()
    if (target) {
      restore(target, sessionRef.current)
      setCanUndo(history.canUndo)
      setCanRedo(history.canRedo)
    }
  }, [history, settle, restore])

  const undo = useCallback(() => step(() => history.undo()), [step, history])
  const redo = useCallback(() => step(() => history.redo()), [step, history])

  const beforeReplace = useCallback(() => {
    // Whatever was being edited is its own step, and so is the replacement.
    if (!samePiece(history.current, sessionRef.current)) settle()
    settleNow.current = true
  }, [history, settle])

  return { canUndo, canRedo, undo, redo, beforeReplace }
}
