import type { Song, HarmonySection } from './song.ts'

/** The harmony section in force at a bar, or null where the dials decide. */
export function sectionAt(song: Song, bar: number): HarmonySection | null {
  const sections = song.harmony
  let lo = 0
  let hi = sections.length - 1
  let found: HarmonySection | null = null
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (sections[mid].startBar <= bar) {
      found = sections[mid]
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return found
}
