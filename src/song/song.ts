import type { BreakpointShape, ProgressionStyle, Extensions, HarmonySection, Song } from './types.ts'

/**
 * A song: the six dials, and optionally the harmony, laid out over a timeline
 * of any length.
 *
 * Everything here is a function of the bar position and nothing else. That is
 * not a stylistic preference — it is what lets a click on bar 300 hear the same
 * music as playing to bar 300, and what lets an export render exactly what the
 * timeline shows.
 */

export const BREAKPOINT_SHAPES: readonly BreakpointShape[] = ['linear', 'smooth', 'step']

export const PROGRESSION_STYLES: readonly ProgressionStyle[] = ['drift', 'pedal', 'circle', 'rise', 'custom']

export const EXTENSIONS: readonly Extensions[] = ['auto', 'triad', 'seventh', 'ninth', 'eleventh', 'sus2', 'sus4']

export const MAX_SONG_BARS = 9999
export const CHORD_BAR_CHOICES: readonly number[] = [1, 2, 4, 8, 16]
/** Wide enough for baroque 415 and the sharp end of orchestral practice. */
export const MIN_TUNING = 400
export const MAX_TUNING = 480

/** A song with nothing on it behaves exactly like the endless stream. */
export const DEFAULT_SONG: Song = {
  lengthBars: 64,
  end: 'hold',
  macros: {},
  harmony: [],
  tuning: null,
}

export function autoSection(startBar: number): HarmonySection {
  return {
    startBar,
    key: null,
    mode: null,
    style: 'drift',
    degrees: [0, 5, 3, 4],
    chordBars: null,
    extensions: 'auto',
  }
}
