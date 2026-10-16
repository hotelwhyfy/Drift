import { MACRO_KEYS } from '@/macros/macros.ts'
import type { Song } from '@/song/types.ts'
import { writeEnvelope } from '@/project/write/writeEnvelope.ts'

export function writeSong(song: Song): unknown {
  const macros: Record<string, unknown> = {}
  for (const key of MACRO_KEYS) {
    const track = song.macros[key]
    if (track) macros[key] = { enabled: track.enabled, points: writeEnvelope(track.envelope) }
  }
  return {
    lengthBars: song.lengthBars,
    end: song.end,
    macros,
    harmony: song.harmony.map((s) => ({ ...s, degrees: [...s.degrees] })),
    tuning: song.tuning,
  }
}
