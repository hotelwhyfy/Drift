import type { Macros } from '../macros/macros.ts'
import type { EngineSnapshot } from '../engine/engine.ts'
import type { SlotDesc } from '../engine/rack.ts'
import type { Song } from '../song/song.ts'

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
  | {
      type: 'capture'
      /** 'song' renders the song once through plus its tail; 'minutes' renders `seconds`. */
      mode: 'song' | 'minutes'
      seconds: number
      macros: Macros
      seed: number
      slots: SlotDesc[]
      song: Song
      id: number
    }

export type FromWorker =
  | { type: 'chunk'; id: number; epoch: number; left: Float32Array<ArrayBuffer>; right: Float32Array<ArrayBuffer>; snapshot: EngineSnapshot }
  | { type: 'capture'; id: number; left: Float32Array<ArrayBuffer>; right: Float32Array<ArrayBuffer>; sampleRate: number }
  | { type: 'captureProgress'; id: number; progress: number }
