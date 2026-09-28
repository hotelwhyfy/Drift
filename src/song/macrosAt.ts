import type { Song } from './song.ts'
import { sampleEnvelope } from './sampleEnvelope.ts'
import type { Macros, MacroKey } from '../macros/macros.ts'
import { MACRO_KEYS } from '../macros/macros.ts'

export interface SongMacros {
  readonly macros: Macros
  /** The dials the song is driving here; the rest are wherever the hand left them. */
  readonly driven: readonly MacroKey[]
}

/**
 * The six dials at a bar: the song's where it has a track, the hand's
 * elsewhere. Past the end of the song — a song set to hold — every track keeps
 * the value it had at the end, whatever points lie beyond it.
 */
export function macrosAt(song: Song, dials: Macros, bar: number): SongMacros {
  const at = Math.min(bar, song.lengthBars)
  const macros: Macros = { ...dials }
  const driven: MacroKey[] = []
  for (const key of MACRO_KEYS) {
    const track = song.macros[key]
    if (!track || !track.enabled || track.envelope.points.length === 0) continue
    macros[key] = sampleEnvelope(track.envelope, at)
    driven.push(key)
  }
  return { macros, driven }
}
