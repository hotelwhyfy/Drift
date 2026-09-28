import type { Song } from './song.ts'
import { macrosAt } from './macrosAt.ts'
import type { Macros } from '../macros/macros.ts'
import { buildPatch } from '../macros/patch.ts'

/**
 * The tempo a bar is played at. Read at the downbeat — a bar's length is fixed
 * when it starts — and shared by the engine and by `songFrames`, because an
 * export whose length was worked out differently from how it was rendered
 * would cut off or pad the ending.
 */
export function tempoAtBar(song: Song, dials: Macros, bar: number): number {
  return buildPatch(macrosAt(song, dials, bar).macros).compose.tempo
}
