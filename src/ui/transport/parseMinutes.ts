/**
 * A capture streams to disk, so memory does not limit it; the WAV format does.
 * Its sizes are 32-bit, which at 48 kHz stereo 16-bit is a little over six
 * hours.
 */
export const MAX_CAPTURE_MINUTES = 360
const MIN_CAPTURE_MINUTES = 0.25

/** A typed length in minutes, or null when it is not one. */
export function parseMinutes(text: string): number | null {
  const n = Number(text.trim())
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.min(MAX_CAPTURE_MINUTES, Math.max(MIN_CAPTURE_MINUTES, Math.round(n * 4) / 4))
}
