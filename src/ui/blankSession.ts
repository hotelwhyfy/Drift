import type { Session } from '@/ui/types.ts'
import { DEFAULT_MACROS } from '@/macros/macros.ts'
import { DEFAULT_SONG } from '@/song/song.ts'
import { defaultSlots } from '@/ui/defaultSlots.ts'
import { randomSeedName } from '@/ui/randomSeedName.ts'

export function blankSession(): Session {
  return {
    macros: DEFAULT_MACROS,
    seedName: randomSeedName(),
    slots: defaultSlots(),
    song: DEFAULT_SONG,
    projectName: 'untitled',
  }
}
