import { useCallback, useRef } from 'react'
import type { PointerEvent } from 'react'
import { released } from '@/ui/released.ts'

export interface PointerDrag<T, E extends Element> {
  /** A press on the control. Return what the drag needs to remember, or null to ignore the press. */
  start: (e: PointerEvent<E>) => T | null
  /** The pointer moved with the drag under way. */
  move: (drag: T, e: PointerEvent<E>) => void
  /** The pointer moved with no drag under way. */
  hover?: (e: PointerEvent<E>) => void
  /** The drag finished: let go, cancelled, captured away, or a release that was never seen. */
  end?: (drag: T, e: PointerEvent<E>) => void
}

export interface PointerDragHandlers<E extends Element> {
  onPointerDown: (e: PointerEvent<E>) => void
  onPointerMove: (e: PointerEvent<E>) => void
  onPointerUp: (e: PointerEvent<E>) => void
  onPointerCancel: (e: PointerEvent<E>) => void
  onLostPointerCapture: (e: PointerEvent<E>) => void
}

/**
 * A drag with pointer capture, so the pointer can wander outside the control
 * without the gesture breaking — the alternative is a control that drops its
 * value the moment your hand drifts.
 *
 * The release is not always delivered: let go outside the window, over another
 * app, or as the tab loses focus, and the pointerup can simply never arrive. A
 * move with no button held therefore ends the drag too, so a control never keeps
 * following a pointer nobody is holding. Put every drag through this and that
 * rule cannot be forgotten.
 *
 * The returned handlers are stable and always call the latest `drag`.
 */
export function usePointerDrag<T, E extends Element = HTMLElement>(drag: PointerDrag<T, E>): PointerDragHandlers<E> {
  const state = useRef<T | null>(null)
  const latest = useRef(drag)
  latest.current = drag

  const finish = useCallback((e: PointerEvent<E>): void => {
    const current = state.current
    if (current === null) return
    state.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    latest.current.end?.(current, e)
  }, [])

  const onPointerDown = useCallback((e: PointerEvent<E>): void => {
    const started = latest.current.start(e)
    if (started === null) return
    e.currentTarget.setPointerCapture(e.pointerId)
    state.current = started
  }, [])

  const onPointerMove = useCallback((e: PointerEvent<E>): void => {
    const current = state.current
    if (current === null) {
      latest.current.hover?.(e)
      return
    }
    if (released(e)) {
      finish(e)
      return
    }
    latest.current.move(current, e)
  }, [finish])

  return { onPointerDown, onPointerMove, onPointerUp: finish, onPointerCancel: finish, onLostPointerCapture: finish }
}
