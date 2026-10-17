import type { MacroKey } from '@/macros/macros.ts'
import type { Song, MacroTrack } from '@/song/types.ts'

/** The song with one dial's track set, or removed when `track` is undefined. */
export function withMacroTrack(song: Song, key: MacroKey, track: MacroTrack | undefined): Song {
  const macros = { ...song.macros }
  if (track) macros[key] = track
  else delete macros[key]
  return { ...song, macros }
}
