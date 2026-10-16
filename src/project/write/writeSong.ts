import { MACRO_KEYS } from '@/macros/macros.ts'
import type { Song } from '@/song/types.ts'
import { writeEnvelope } from '@/project/write/writeEnvelope.ts'

export function writeSong(song: Song): unknown {
  const macros: Record<string, unknown> = Object.fromEntries(MACRO_KEYS.flatMap((key) => {
    const track = song.macros[key]
    return track ? [[key, { enabled: track.enabled, points: writeEnvelope(track.envelope) }]] : []
  }))
  return {
    lengthBars: song.lengthBars,
    end: song.end,
    macros,
    harmony: song.harmony.map((s) => ({ ...s, degrees: [...s.degrees] })),
    tuning: song.tuning,
  }
}
