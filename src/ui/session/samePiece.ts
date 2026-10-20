import type { Session } from '@/ui/types.ts'

/** Whether two sessions are the same piece. The name is not part of it: renaming is not an edit. */
export function samePiece(a: Session, b: Session): boolean {
  return a.macros === b.macros && a.seedName === b.seedName && a.slots === b.slots && a.song === b.song
}
