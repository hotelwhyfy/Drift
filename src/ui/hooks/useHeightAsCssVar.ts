import { useLayoutEffect } from 'react'
import type { RefObject } from 'react'

/**
 * Publishes an element's height as a CSS custom property on its parent, for
 * layout that has to sit below something whose height CSS cannot know.
 *
 * The pinned visualiser uses it to stay just under the pinned header, whose
 * height depends on its content and changes when it compacts. The two cannot
 * share one sticky wrapper, because the page has to scroll between them: over
 * the visualiser, under the header.
 *
 * Written straight to the style, so a resize never re-renders anything. The
 * border box is observed because padding is part of the height, and the
 * default content box would miss a change to the padding alone.
 */
export function useHeightAsCssVar(ref: RefObject<HTMLElement | null>, name: string): void {
  useLayoutEffect(() => {
    const el = ref.current
    const parent = el?.parentElement
    if (!el || !parent) return
    const update = (): void => parent.style.setProperty(name, `${el.offsetHeight}px`)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el, { box: 'border-box' })
    return () => observer.disconnect()
  }, [ref, name])
}
