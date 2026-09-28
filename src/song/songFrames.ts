import type { Song } from './song.ts'
import { tempoAtBar } from './tempoAtBar.ts'
import type { Macros } from '../macros/macros.ts'
import { barLengthSamples } from '../engine/barLengthSamples.ts'

/**
 * Exactly how many samples the song lasts. The engine gives each bar a whole
 * number of samples — its length rounded up — so this sums the same.
 */
export function songFrames(song: Song, dials: Macros, sampleRate: number): number {
  let frames = 0
  for (let bar = 0; bar < song.lengthBars; bar++) {
    frames += Math.ceil(barLengthSamples(tempoAtBar(song, dials, bar), sampleRate))
  }
  return frames
}
