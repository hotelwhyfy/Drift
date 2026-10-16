import type { Macros } from '@/macros/macros.ts'
import type { SlotDesc } from '@/engine/types.ts'
import type { Song } from '@/song/types.ts'

export interface Project {
  version: number
  name: string
  saved: string
  macros: Macros
  seedName: string
  slots: SlotDesc[]
  song: Song
}

export interface ReadResult {
  project: Project
  /** Anything dropped or repaired on the way in, to tell the user about. */
  warnings: string[]
}
