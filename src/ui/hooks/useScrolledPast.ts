import { useEffect, useState } from 'react'

/**
 * Whether the page has scrolled past `enter` pixels, with hysteresis: true
 * once `scrollY > enter`, false again only once `scrollY < leave`.
 *
 * The gap is required, not cosmetic. What this drives (the compact header)
 * is in flow, so switching it shortens the page and can pull `scrollY` back
 * by the same amount, through scroll anchoring or clamping at the bottom.
 * Keep `enter − (how much it shrinks) > leave` and it can never flicker.
 */
export function useScrolledPast(enter: number, leave: number): boolean {
  const [past, setPast] = useState(false)
  useEffect(() => {
    const update = (): void => {
      const y = window.scrollY
      // Functional, so the listener never needs the current value.
      setPast((was) => (was ? y >= leave : y > enter))
    }
    update()
    window.addEventListener('scroll', update, { passive: true })
    return () => window.removeEventListener('scroll', update)
  }, [enter, leave])
  return past
}
