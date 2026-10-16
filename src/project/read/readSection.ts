import { MAX_SONG_BARS, PROGRESSION_STYLES, EXTENSIONS, CHORD_BAR_CHOICES } from '@/song/song.ts'
import type { HarmonySection } from '@/song/types.ts'
import { MODES } from '@/core/theory.ts'
import { readNumber } from '@/project/read/readNumber.ts'

export function readSection(raw: unknown): HarmonySection | null {
  if (typeof raw !== 'object' || raw === null) return null
  const record: Record<string, unknown> = { ...raw }
  const key = typeof record.key === 'number' && Number.isFinite(record.key)
    ? ((Math.round(record.key) % 12) + 12) % 12
    : null
  const degrees = Array.isArray(record.degrees)
    ? record.degrees
      .filter((d): d is number => typeof d === 'number' && Number.isFinite(d))
      .map((d) => Math.min(6, Math.max(0, Math.round(d))))
      .slice(0, 16)
    : []
  return {
    startBar: Math.round(readNumber(record.startBar, 0, 0, MAX_SONG_BARS)),
    key,
    // A mode this build does not know becomes "the dials decide" rather than
    // a guess at the nearest one.
    mode: MODES.find((m) => m.name === record.mode)?.name ?? null,
    style: PROGRESSION_STYLES.find((s) => s === record.style) ?? 'drift',
    degrees: degrees.length > 0 ? degrees : [0, 5, 3, 4],
    chordBars: CHORD_BAR_CHOICES.find((c) => c === record.chordBars) ?? null,
    extensions: EXTENSIONS.find((e) => e === record.extensions) ?? 'auto',
  }
}
