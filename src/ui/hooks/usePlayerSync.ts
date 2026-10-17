import { useEffect } from 'react'
import type { Player } from '@/audio/player.ts'
import type { Macros } from '@/macros/macros.ts'
import type { SlotDesc } from '@/engine/types.ts'
import type { Song } from '@/song/types.ts'

/** Keeps the player's dials, rack and song in step with the interface's. */
export function usePlayerSync(player: Player, macros: Macros, slots: SlotDesc[], song: Song): void {
  useEffect(() => {
    player.setMacros(macros)
  }, [macros, player])

  useEffect(() => {
    player.setRack(slots)
  }, [slots, player])

  useEffect(() => {
    player.setSong(song)
  }, [song, player])
}
