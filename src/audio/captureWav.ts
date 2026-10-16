import { Engine } from '../engine/engine.ts'
import type { Macros } from '../macros/macros.ts'
import type { SlotDesc } from '../engine/types.ts'
import type { Song } from '../song/types.ts'
import { songFrames } from '../song/songFrames.ts'
import { WavEncoder, wavHeader } from './wav.ts'

/** How long a song capture keeps rendering after the last bar, for the tails. */
export const SONG_TAIL_SECONDS = 8

/** Rendered in slices so progress can be reported; the engine is indifferent
 *  to where the boundaries fall. */
const SLICE_SECONDS = 2

export interface CaptureRequest {
  /** 'song' renders the song once through plus its tail; 'minutes' renders `seconds`. */
  readonly mode: 'song' | 'minutes'
  readonly seconds: number
  readonly macros: Macros
  readonly seed: number
  readonly slots: SlotDesc[]
  readonly song: Song
  readonly sampleRate: number
}

/** The number of frames a capture will produce, header aside. */
export function captureFrames(request: CaptureRequest): number {
  return request.mode === 'song'
    ? songFrames({ ...request.song, end: 'stop' }, request.macros, request.sampleRate) +
      Math.floor(SONG_TAIL_SECONDS * request.sampleRate)
    : Math.floor(request.seconds * request.sampleRate)
}

/**
 * Renders a capture as a WAV, a piece at a time: the header, then each slice
 * as it is rendered, faded and encoded. Nothing is held beyond the slice being
 * worked on — where the pieces go, and whether they are kept, is up to `emit`.
 */
export function captureWav(
  request: CaptureRequest,
  emit: (bytes: Uint8Array<ArrayBuffer>) => void,
  onProgress: (progress: number) => void = () => {},
): void {
  const { sampleRate } = request
  const engine = new Engine(sampleRate, request.macros, request.seed)
  // A song capture plays the song once and then lets it ring out: forced to
  // stop, whatever the song's own ending, so nothing new starts in the tail.
  const song: Song = request.mode === 'song' ? { ...request.song, end: 'stop' } : request.song
  engine.setSong(song)
  engine.snapMacros(request.macros)
  engine.rack.sync(request.slots)
  // From the top, against the rack and song it was just given — exactly what
  // pressing play at bar one does.
  engine.seek(0)

  const frames = captureFrames(request)
  const fades = new Fades(frames, sampleRate, request.mode === 'song' ? SONG_TAIL_SECONDS * 0.6 : 4)
  const encoder = new WavEncoder()
  emit(wavHeader(frames, sampleRate))

  const sliceFrames = Math.floor(sampleRate * SLICE_SECONDS)
  const left = new Float32Array(sliceFrames)
  const right = new Float32Array(sliceFrames)
  let done = 0
  while (done < frames) {
    const n = Math.min(sliceFrames, frames - done)
    engine.render(left, right, n)
    fades.apply(left, right, done, n)
    emit(encoder.encode(left, right, n))
    done += n
    onProgress(done / frames)
  }
}

/**
 * Endless music has no ending, so a capture has to be given one. A long fade
 * out and a short fade in: starting abruptly is fine because the first thing
 * heard is an attack, but stopping abruptly on a reverb tail is not.
 *
 * Applied per slice, by absolute frame, so the result does not depend on where
 * the slices fall.
 */
class Fades {
  private readonly inFrames: number
  private readonly outFrames: number
  private readonly outStart: number

  constructor(frames: number, sampleRate: number, outSeconds: number) {
    this.inFrames = Math.min(Math.floor(sampleRate * 0.35), frames)
    this.outFrames = Math.min(Math.floor(sampleRate * outSeconds), frames)
    this.outStart = frames - this.outFrames
  }

  apply(left: Float32Array, right: Float32Array, from: number, n: number): void {
    const inEnd = Math.min(this.inFrames - from, n)
    for (let i = 0; i < inEnd; i++) {
      const g = (from + i) / this.inFrames
      left[i] *= g
      right[i] *= g
    }
    for (let i = Math.max(0, this.outStart - from); i < n; i++) {
      // Equal-power rather than linear, so the tail does not appear to duck
      // in the middle of the fade.
      const g = Math.cos(((from + i - this.outStart) / this.outFrames) * Math.PI * 0.5)
      left[i] *= g
      right[i] *= g
    }
  }
}
