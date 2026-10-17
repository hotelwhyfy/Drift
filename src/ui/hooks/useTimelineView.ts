import { useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { barScale } from '@/ui/barScale.ts'
import type { BarScale } from '@/ui/barScale.ts'

const MIN_PX = 1
const MAX_PX = 96

export interface TimelineView {
  rowsRef: RefObject<HTMLDivElement | null>
  scrollRef: RefObject<HTMLDivElement | null>
  pxPerBar: number
  startBar: number
  /** The lane tracks' width in pixels, 0 until measured. */
  width: number
  visibleBars: number
  follow: boolean
  scale: BarScale
  zoomIn: () => void
  zoomOut: () => void
  /** Zoom so the whole song fits, from its first bar. */
  fit: (lengthBars: number) => void
  toggleFollow: () => void
  stopFollowing: () => void
  /** The scrollbar moved to `scrollLeft` pixels. */
  scrollTo: (scrollLeft: number) => void
}

/**
 * Which part of the song the timeline shows: zoom, scroll position, and whether
 * it pages to keep the playhead in view. Wheel scrolls sideways, and with Ctrl
 * or ⌘ it zooms around the pointer, from whole phrases per pixel to a beat per
 * finger-width.
 */
export function useTimelineView(playhead: number, playing: boolean): TimelineView {
  const [pxPerBar, setPxPerBar] = useState(10)
  const [startBar, setStartBar] = useState(0)
  const [follow, setFollow] = useState(true)
  const [width, setWidth] = useState(0)
  const rowsRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  // The wheel listener is registered once; it reads the view through this.
  const view = useRef({ pxPerBar, startBar })
  view.current = { pxPerBar, startBar }

  const scale = useMemo(() => barScale(pxPerBar, startBar), [pxPerBar, startBar])
  const visibleBars = width / pxPerBar

  // Canvas width follows the column the rows sit in.
  useEffect(() => {
    const el = rowsRef.current
    if (!el) return
    const observer = new ResizeObserver(() => {
      const probe = el.querySelector('.tl-track')
      setWidth(probe instanceof HTMLElement ? probe.clientWidth : 0)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Keep the playhead in view while playing, paging rather than scrolling
  // continuously — a timeline sliding under the pointer is hard to edit.
  useEffect(() => {
    if (!playing || !follow || visibleBars <= 0) return
    if (playhead < startBar || playhead > startBar + visibleBars * 0.92) {
      setStartBar(Math.max(0, playhead - visibleBars * 0.08))
    }
  }, [playhead, playing, follow, startBar, visibleBars])

  // The scrollbar and startBar describe the same thing; keep them in step.
  useEffect(() => {
    const el = scrollRef.current
    if (el && Math.abs(el.scrollLeft - startBar * pxPerBar) > 1) el.scrollLeft = startBar * pxPerBar
  }, [startBar, pxPerBar])

  // Wheel: sideways scrolls, Ctrl/⌘ zooms about the pointer. Registered by
  // hand because React's wheel listener is passive and cannot stop the page
  // from zooming too.
  useEffect(() => {
    const el = rowsRef.current
    if (!el) return
    const onWheel = (e: WheelEvent): void => {
      const track = el.querySelector('.tl-track')
      const left = track instanceof HTMLElement ? track.getBoundingClientRect().left : 0
      const { pxPerBar: px, startBar: sb } = view.current
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        // Zoom about the pointer: the bar under it stays under it.
        const x = e.clientX - left
        const next = Math.min(MAX_PX, Math.max(MIN_PX, px * Math.exp(-e.deltaY * 0.0025)))
        setPxPerBar(next)
        setStartBar(Math.max(0, sb + x / px - x / next))
        return
      }
      const dx = e.deltaX !== 0 ? e.deltaX : e.shiftKey ? e.deltaY : 0
      if (dx === 0) return
      e.preventDefault()
      // Scrolling away is a request to look somewhere else; following would
      // page straight back and fight it.
      setFollow(false)
      setStartBar(Math.max(0, sb + dx / px))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  return {
    rowsRef,
    scrollRef,
    pxPerBar,
    startBar,
    width,
    visibleBars,
    follow,
    scale,
    zoomIn: () => setPxPerBar((p) => Math.min(MAX_PX, p * 1.5)),
    zoomOut: () => setPxPerBar((p) => Math.max(MIN_PX, p / 1.5)),
    fit: (lengthBars) => {
      setPxPerBar(Math.max(MIN_PX, Math.min(MAX_PX, width / (lengthBars + 1))))
      setStartBar(0)
    },
    toggleFollow: () => setFollow((f) => !f),
    stopFollowing: () => setFollow(false),
    scrollTo: (scrollLeft) => {
      const next = scrollLeft / pxPerBar
      if (Math.abs(next - startBar) * pxPerBar > 1) setStartBar(next)
    },
  }
}
