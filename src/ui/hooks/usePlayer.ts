import { useCallback, useEffect, useRef, useState } from 'react'
import { Player } from '@/audio/player.ts'
import type { Macros } from '@/macros/macros.ts'
import type { EngineSnapshot } from '@/engine/types.ts'

export interface PlayerState {
  player: Player
  playing: boolean
  /** The engine's latest report, or null before the first one after a start or seek. */
  snapshot: EngineSnapshot | null
  /** Forgets the snapshot, for when the position it describes is no longer where playback is. */
  clearSnapshot: () => void
  /** 0..1 while a capture is rendering, otherwise null. */
  captureProgress: number | null
  setCaptureProgress: (progress: number | null) => void
}

/**
 * One Player for the life of the page, with its reports as state.
 *
 * Recreating it would rebuild the AudioContext, and browsers limit how many of
 * those a page may have. `macros` and `seed` start it off and are not read
 * again; later changes go through the player's own methods.
 */
export function usePlayer(macros: Macros, seed: number): PlayerState {
  const [playing, setPlaying] = useState(false)
  const [snapshot, setSnapshot] = useState<EngineSnapshot | null>(null)
  const [captureProgress, setCaptureProgress] = useState<number | null>(null)
  const playerRef = useRef<Player | null>(null)

  if (playerRef.current === null) {
    playerRef.current = new Player(macros, seed, {
      onSnapshot: setSnapshot,
      onStateChange: setPlaying,
      onCaptureProgress: (p) => setCaptureProgress(p),
    })
  }
  const player = playerRef.current

  useEffect(() => () => player.dispose(), [player])

  // Dev-only diagnostic handle. The queue depth is exactly how long a mute or
  // level change takes to be heard, and it is worth being able to measure
  // rather than infer.
  useEffect(() => {
    if (!import.meta.env.DEV) return
    Reflect.set(window, '__drift', player)
    return () => { Reflect.deleteProperty(window, '__drift') }
  }, [player])

  const clearSnapshot = useCallback(() => setSnapshot(null), [])

  return { player, playing, snapshot, clearSnapshot, captureProgress, setCaptureProgress }
}
