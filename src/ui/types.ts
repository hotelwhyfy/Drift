import type { Macros } from '@/macros/macros.ts'
import type { SlotDesc } from '@/engine/types.ts'
import type { Song } from '@/song/types.ts'

/** Everything that makes up the piece on screen, and so everything undo restores. */
export interface Session {
  macros: Macros
  seedName: string
  slots: SlotDesc[]
  song: Song
  projectName: string
}
