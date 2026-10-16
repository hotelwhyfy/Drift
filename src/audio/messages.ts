import type { Macros } from '../macros/macros.ts'
import type { EngineSnapshot, SlotDesc } from '../engine/types.ts'
import type { Song } from '../song/types.ts'
import type { CaptureRequest } from './captureWav.ts'

/**
 * `epoch` counts seeks. Audio rendered before a seek can still be in flight
 * when it happens, and without a way to recognise it the player would queue a
 * few hundred milliseconds of the old position after the jump.
 */
export type ToWorker =
  | { type: 'init'; sampleRate: number; macros: Macros; seed: number }
  | { type: 'macros'; macros: Macros }
  | { type: 'reseed'; seed: number; macros: Macros }
  | { type: 'rack'; slots: SlotDesc[] }
  | { type: 'song'; song: Song }
  | { type: 'seek'; bar: number; epoch: number }
  | { type: 'render'; frames: number; id: number; epoch: number }
  | ({ type: 'capture'; id: number } & CaptureRequest)

export type FromWorker =
  | { type: 'chunk'; id: number; epoch: number; left: Float32Array<ArrayBuffer>; right: Float32Array<ArrayBuffer>; snapshot: EngineSnapshot }
  /** The next piece of the WAV, in order: the header first, then each slice. */
  | { type: 'captureChunk'; id: number; bytes: Uint8Array<ArrayBuffer> }
  /** Every piece has been sent. */
  | { type: 'capture'; id: number }
  | { type: 'captureProgress'; id: number; progress: number }
