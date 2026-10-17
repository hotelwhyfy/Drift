import type { Song } from '@/song/types.ts'
import { MIN_TUNING, MAX_TUNING } from '@/song/song.ts'

/**
 * The song with its A4 set from what was typed: empty hands the reference back
 * to the dials, anything else is rounded to a tenth and kept within range.
 * Null when the text is not a number.
 */
export function withTuning(song: Song, text: string): Song | null {
  if (text.trim() === '') return { ...song, tuning: null }
  const hz = Number(text)
  if (!Number.isFinite(hz)) return null
  return { ...song, tuning: Math.round(Math.min(MAX_TUNING, Math.max(MIN_TUNING, hz)) * 10) / 10 }
}
