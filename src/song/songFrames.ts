import type { Song } from '@/song/types.ts'
import { tempoAtBar } from '@/song/tempoAtBar.ts'
import type { Macros } from '@/macros/macros.ts'
import { barLengthSamples } from '@/engine/barLengthSamples.ts'

/**
 * Exactly how many samples the song lasts. The engine gives each bar a whole
 * number of samples — its length rounded up — so this sums the same.
 */
export function songFrames(song: Song, dials: Macros, sampleRate: number): number {
  return Array.from({ length: song.lengthBars }, (_, bar) =>
    Math.ceil(barLengthSamples(tempoAtBar(song, dials, bar), sampleRate)),
  ).reduce((frames, barFrames) => frames + barFrames, 0)
}
