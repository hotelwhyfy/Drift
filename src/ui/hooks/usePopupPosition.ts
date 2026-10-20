import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { placePopup } from '@/ui/placePopup.ts'
import type { PopupPosition } from '@/ui/placePopup.ts'

export interface PopupAnchor {
  triggerRef: RefObject<HTMLButtonElement | null>
  listRef: RefObject<HTMLDivElement | null>
  /** Null until the open list has been measured; render it hidden until then. */
  position: PopupPosition | null
}

/**
 * Positions a list under (or over) its trigger. Measures the list after it
 * renders hidden, then places it, and keeps it placed as the page scrolls;
 * a resize calls `onDismiss` instead. `onDismiss` must be stable.
 */
export function usePopupPosition(open: boolean, onDismiss: () => void): PopupAnchor {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<PopupPosition | null>(null)

  const place = useCallback(() => {
    const trigger = triggerRef.current
    const list = listRef.current
    if (!trigger || !list) return
    setPosition(placePopup({
      anchor: trigger.getBoundingClientRect(),
      naturalHeight: list.scrollHeight,
      listWidth: list.offsetWidth,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    }))
  }, [])

  useLayoutEffect(() => {
    if (!open) return
    place()
    // The page or any scrolling ancestor may move the trigger, so listen in
    // the capture phase — but not to the list's own scrolling.
    const onScroll = (e: Event): void => { if (e.target !== listRef.current) place() }
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onDismiss)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onDismiss)
      // A closed list is measured afresh when it next opens.
      setPosition(null)
    }
    // Not keyed on items: callers build them afresh every render, and a
    // re-measure on each would loop through setPosition.
  }, [open, place, onDismiss])

  return { triggerRef, listRef, position }
}
