import { cloneElement, isValidElement, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { FocusEvent, KeyboardEvent, PointerEvent, ReactElement, ReactNode } from 'react'
import { createPortal } from 'react-dom'

type Placement = 'top' | 'bottom'

/** The handlers the tooltip attaches to its trigger, chained with the trigger's own. */
interface TriggerProps {
  onPointerEnter?: (e: PointerEvent<HTMLElement>) => void
  onPointerLeave?: (e: PointerEvent<HTMLElement>) => void
  onPointerDown?: (e: PointerEvent<HTMLElement>) => void
  onFocus?: (e: FocusEvent<HTMLElement>) => void
  onBlur?: (e: FocusEvent<HTMLElement>) => void
  onKeyDown?: (e: KeyboardEvent<HTMLElement>) => void
  'aria-describedby'?: string
}

interface Props {
  /** Nothing — null, undefined or '' — leaves the child exactly as it was. */
  content: ReactNode
  /** Preferred side; flips when there is no room. */
  placement?: Placement
  /** One element that accepts pointer and focus handlers — a button, an input. */
  children: ReactElement<TriggerProps>
}

/** Long enough that sweeping the pointer across the transport shows nothing. */
const SHOW_DELAY = 450
/** Once one tooltip is up, its neighbours appear at once for this long after. */
const WARM_WINDOW = 600
const GAP = 8
const GUTTER = 8

// UI-only state, outside the render path: when the last tooltip closed, so
// moving between neighbouring buttons reads them off without the delay each time.
let lastClosedAt = -Infinity

/**
 * A tooltip in the app's own voice, in place of the browser's `title`.
 *
 * The native one is a pale system box that appears after a second and a half
 * and ignores the accent; this one sits on the lifted background like the
 * toast does and takes the accent from `:root`, so it follows the music too.
 *
 * Hover opens it after a pause, keyboard focus opens it at once, and pressing
 * the trigger closes it — every control here is dragged, and a label stuck over
 * a dial while it turns is worse than none. Touch never opens it: there is no
 * hover on a phone, and a long press belongs to the control.
 */
export function Tooltip({ content, placement = 'top', children }: Props) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number; side: Placement } | null>(null)
  const anchorRef = useRef<HTMLElement | null>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // Mirrors `open` synchronously. Leaving one button and entering the next
  // happen in the same tick, before React renders, so the close time must be
  // written in the handler itself for the neighbour's show() to see it.
  const shown = useRef(false)

  const reveal = useCallback(() => {
    shown.current = true
    setOpen(true)
  }, [])

  const show = useCallback((anchor: HTMLElement, immediate: boolean) => {
    anchorRef.current = anchor
    clearTimeout(timer.current)
    if (immediate || performance.now() - lastClosedAt < WARM_WINDOW) {
      reveal()
    } else {
      timer.current = setTimeout(reveal, SHOW_DELAY)
    }
  }, [reveal])

  const hide = useCallback(() => {
    clearTimeout(timer.current)
    if (shown.current) lastClosedAt = performance.now()
    shown.current = false
    setOpen(false)
    setPos(null)
  }, [])

  useEffect(() => () => clearTimeout(timer.current), [])

  // Measure after the tooltip renders (hidden), then place it beside the
  // anchor: flip if the preferred side is off-screen, clamp to the viewport.
  const place = useCallback(() => {
    const anchor = anchorRef.current
    const tip = tipRef.current
    if (!anchor || !tip) return
    const a = anchor.getBoundingClientRect()
    const t = tip.getBoundingClientRect()
    const fitsAbove = a.top - GAP - t.height >= GUTTER
    const fitsBelow = a.bottom + GAP + t.height <= window.innerHeight - GUTTER
    const side: Placement = placement === 'top'
      ? (fitsAbove || !fitsBelow ? 'top' : 'bottom')
      : (fitsBelow || !fitsAbove ? 'bottom' : 'top')
    const top = side === 'top' ? a.top - GAP - t.height : a.bottom + GAP
    const centred = a.left + a.width / 2 - t.width / 2
    const left = Math.max(GUTTER, Math.min(centred, window.innerWidth - GUTTER - t.width))
    setPos({ left, top, side })
  }, [placement])

  useLayoutEffect(() => {
    if (!open) return
    place()
    // Listen in the capture phase so the page or any scrolling ancestor
    // moves the tooltip with its anchor.
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open, place, content])

  if (!isValidElement(children) || content === null || content === undefined || content === '') return children
  const own = children.props

  const trigger = cloneElement(children, {
    onPointerEnter: (e: PointerEvent<HTMLElement>) => {
      own.onPointerEnter?.(e)
      if (e.pointerType !== 'touch') show(e.currentTarget, false)
    },
    onPointerLeave: (e: PointerEvent<HTMLElement>) => {
      own.onPointerLeave?.(e)
      hide()
    },
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      own.onPointerDown?.(e)
      hide()
    },
    onFocus: (e: FocusEvent<HTMLElement>) => {
      own.onFocus?.(e)
      // Only keyboard focus: a click focuses the button too, and that should
      // not bring back the tooltip the press just dismissed. React's focus
      // bubbles, so on a label it is the input inside that holds focus.
      if (e.target.matches(':focus-visible')) show(e.currentTarget, true)
    },
    onBlur: (e: FocusEvent<HTMLElement>) => {
      own.onBlur?.(e)
      hide()
    },
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      own.onKeyDown?.(e)
      if (e.key === 'Escape') hide()
    },
    'aria-describedby': open
      ? [own['aria-describedby'], id].filter(Boolean).join(' ')
      : own['aria-describedby'],
  })

  return (
    <>
      {trigger}
      {open && createPortal(
        <div
          ref={tipRef}
          id={id}
          role="tooltip"
          className="tooltip"
          data-side={pos?.side ?? placement}
          style={pos ? { left: pos.left, top: pos.top } : { visibility: 'hidden' }}
        >
          {content}
        </div>,
        document.body,
      )}
    </>
  )
}
