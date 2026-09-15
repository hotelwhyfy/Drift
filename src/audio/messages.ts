import type { Macros } from '../macros/macros.ts'
import type { EngineSnapshot } from '../engine/engine.ts'
import type { SlotDesc } from '../engine/rack.ts'

export type ToWorker =
  | { type: 'init'; sampleRate: number; macros: Macros; seed: number }
  | { type: 'macros'; macros: Macros }
  | { type: 'reseed'; seed: number; macros: Macros }
  | { type: 'rack'; slots: SlotDesc[] }
  | { type: 'render'; frames: number; id: number }
  | { type: 'capture'; seconds: number; macros: Macros; seed: number; slots: SlotDesc[]; id: number }

export type FromWorker =
  | { type: 'chunk'; id: number; left: Float32Array<ArrayBuffer>; right: Float32Array<ArrayBuffer>; snapshot: EngineSnapshot }
  | { type: 'capture'; id: number; left: Float32Array<ArrayBuffer>; right: Float32Array<ArrayBuffer>; sampleRate: number }
  | { type: 'captureProgress'; id: number; progress: number }
