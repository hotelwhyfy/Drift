import type { MacroKey } from '../macros/macros.ts'

/**
 * One colour per timeline lane, so six curves stacked together read as six
 * things rather than one accent repeated.
 *
 * Validated as a set, in this order, against the timeline's dark surface:
 * every neighbouring pair stays apart under the common colour-vision
 * deficiencies (worst ΔE 8.4) and to ordinary sight (worst 19.3). Reorder or
 * swap one and it needs checking again. Colour is never the only cue: every
 * lane is labelled.
 */
export const MACRO_COLOURS: Readonly<Record<MacroKey, string>> = {
  warmth: '#d95926',
  colour: '#3987e5',
  space: '#199e70',
  pulse: '#c98500',
  density: '#d55181',
  drift: '#008300',
}

/** Instrument lanes on the timeline take these, keyed by the lane, not its position. */
export const INSTRUMENT_LANE_COLOURS: readonly string[] = ['#9085e9', '#e66767']
