import { useEffect } from 'react'
import { accentFor } from '@/ui/accent.ts'

/**
 * The accent colour for a Colour dial value, also published as the page's
 * `--accent` so everything styled with it follows the music.
 */
export function useAccent(colour: number): string {
  const accent = accentFor(colour)
  useEffect(() => {
    document.documentElement.style.setProperty('--accent', accent)
  }, [accent])
  return accent
}
