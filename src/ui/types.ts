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

export interface SelectOption<T extends string> {
  value: T
  label: string
  /** A dot in this colour before the label — automation acting on it, say. */
  mark?: string
  /** Read after the label by assistive technology, for what the mark means. */
  note?: string
}

export interface SelectGroup<T extends string> {
  group: string
  options: readonly SelectOption<T>[]
}

export type SelectItem<T extends string> = SelectOption<T> | SelectGroup<T>
