import type { Song } from './song.ts'
import { tempoAtBar } from './tempoAtBar.ts'
import type { Macros } from '../macros/macros.ts'

/** How long the song lasts, for display. `songFrames` is the exact count. */
export function songSeconds(song: Song, dials: Macros): number {
  let seconds = 0
  for (let bar = 0; bar < song.lengthBars; bar++) seconds += (240 / tempoAtBar(song, dials, bar))
  return seconds
}
