// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { usePlayerSync } from '@/ui/hooks/usePlayerSync.ts'
import { Player } from '@/audio/player.ts'
import { DEFAULT_MACROS } from '@/macros/macros.ts'
import { DEFAULT_SONG } from '@/song/song.ts'
import { defaultSlots } from '@/ui/defaultSlots.ts'

function setup() {
  // Before audio starts, a Player only remembers what it is told.
  const player = new Player(DEFAULT_MACROS, 1)
  const setMacros = vi.spyOn(player, 'setMacros')
  const setRack = vi.spyOn(player, 'setRack')
  const setSong = vi.spyOn(player, 'setSong')
  const slots = defaultSlots()
  const hook = renderHook(
    (props: { macros: typeof DEFAULT_MACROS, slots: typeof slots, song: typeof DEFAULT_SONG }) =>
      usePlayerSync(player, props.macros, props.slots, props.song),
    { initialProps: { macros: DEFAULT_MACROS, slots, song: DEFAULT_SONG } },
  )
  return { setMacros, setRack, setSong, slots, ...hook }
}

describe('usePlayerSync', () => {
  it('hands the player everything on the first render', () => {
    const { setMacros, setRack, setSong, slots } = setup()
    expect(setMacros).toHaveBeenCalledWith(DEFAULT_MACROS)
    expect(setRack).toHaveBeenCalledWith(slots)
    expect(setSong).toHaveBeenCalledWith(DEFAULT_SONG)
  })

  it('passes on only what changed', () => {
    const { setMacros, setRack, setSong, slots, rerender } = setup()
    const macros = { ...DEFAULT_MACROS, space: 0.9 }
    rerender({ macros, slots, song: DEFAULT_SONG })
    expect(setMacros).toHaveBeenCalledTimes(2)
    expect(setMacros).toHaveBeenLastCalledWith(macros)
    expect(setRack).toHaveBeenCalledTimes(1)
    expect(setSong).toHaveBeenCalledTimes(1)

    const song = { ...DEFAULT_SONG, lengthBars: 10 }
    rerender({ macros, slots, song })
    expect(setSong).toHaveBeenLastCalledWith(song)
    expect(setMacros).toHaveBeenCalledTimes(2)
  })
})
