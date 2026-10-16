import type { MacroKey } from '@/macros/macros.ts'
import { MACRO_KEYS } from '@/macros/macros.ts'
import { DEFAULT_SONG, MAX_SONG_BARS, MIN_TUNING, MAX_TUNING } from '@/song/song.ts'
import type { Song, MacroTrack, HarmonySection, SongEnd } from '@/song/types.ts'
import { readNumber } from '@/project/read/readNumber.ts'
import { readBoolean } from '@/project/read/readBoolean.ts'
import { readEnvelope } from '@/project/read/readEnvelope.ts'
import { readSection } from '@/project/read/readSection.ts'

/** A missing or unreadable song is an empty one, which plays as the endless stream. */
export function readSong(raw: unknown): Song {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_SONG
  const record: Record<string, unknown> = { ...raw }
  const ends: SongEnd[] = ['loop', 'hold', 'stop']
  const macros: Partial<Record<MacroKey, MacroTrack>> = {}
  if (typeof record.macros === 'object' && record.macros !== null) {
    const tracks: Record<string, unknown> = { ...record.macros }
    for (const key of MACRO_KEYS) {
      const track = tracks[key]
      if (typeof track !== 'object' || track === null) continue
      const envelope = readEnvelope(Reflect.get(track, 'points'))
      if (envelope.points.length === 0) continue
      macros[key] = { enabled: readBoolean(Reflect.get(track, 'enabled'), true), envelope }
    }
  }
  const sections = Array.isArray(record.harmony)
    ? record.harmony.map(readSection).filter((s): s is HarmonySection => s !== null)
    : []
  sections.sort((a, b) => a.startBar - b.startBar)
  const harmony = sections.filter((s, i) => i === sections.length - 1 || sections[i + 1].startBar !== s.startBar)
  return {
    lengthBars: Math.round(readNumber(record.lengthBars, DEFAULT_SONG.lengthBars, 1, MAX_SONG_BARS)),
    end: ends.find((e) => e === record.end) ?? DEFAULT_SONG.end,
    macros,
    harmony,
    // Absent in older files, which is the same as leaving it to the dials.
    tuning: typeof record.tuning === 'number' && Number.isFinite(record.tuning)
      ? readNumber(record.tuning, 440, MIN_TUNING, MAX_TUNING)
      : null,
  }
}
