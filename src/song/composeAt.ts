import type { HarmonySection } from './song.ts'
import type { ComposeSettings } from '../macros/patch.ts'
import { MODES } from '../core/theory.ts'

/**
 * The dials' compose settings with a harmony section laid over them. Anything
 * the section leaves as null stays with the dials, so pinning the key does not
 * also freeze how often the chords change.
 *
 * A chosen key sits in the same octave band the Colour dial moves the root
 * through, so the bass and the pads stay where the instruments were voiced to
 * sit.
 */
export function composeAt(base: ComposeSettings, section: HarmonySection | null): ComposeSettings {
  if (!section) return base
  const mode = section.mode === null ? base.mode : MODES.find((m) => m.name === section.mode) ?? base.mode
  const rootMidi = section.key === null ? base.rootMidi : 44 + ((((section.key - 44) % 12) + 12) % 12)
  return {
    ...base,
    mode,
    rootMidi,
    chordBars: section.chordBars ?? base.chordBars,
    style: section.style,
    degrees: section.degrees,
    extensions: section.extensions,
    sectionStart: section.startBar,
  }
}
