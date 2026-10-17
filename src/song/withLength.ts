import type { Song } from '@/song/types.ts'
import { MAX_SONG_BARS } from '@/song/song.ts'

/** The song at `bars` long, rounded and kept within 1 and the maximum; null when `bars` is not a number. */
export function withLength(song: Song, bars: number): Song | null {
  const n = Math.round(bars)
  if (!Number.isFinite(n)) return null
  return { ...song, lengthBars: Math.min(MAX_SONG_BARS, Math.max(1, n)) }
}
