import type { MacroKey } from '../macros/macros.ts'

/**
 * A song: the six dials, and optionally the harmony, laid out over a timeline
 * of any length.
 *
 * Everything here is a function of the bar position and nothing else. That is
 * not a stylistic preference — it is what lets a click on bar 300 hear the same
 * music as playing to bar 300, and what lets an export render exactly what the
 * timeline shows.
 */

/** How the segment *leaving* a breakpoint travels to the next one. */
export type BreakpointShape = 'linear' | 'smooth' | 'step'

export const BREAKPOINT_SHAPES: readonly BreakpointShape[] = ['linear', 'smooth', 'step']

export interface Breakpoint {
  /** Fractional bars from the start of the song. */
  readonly bar: number
  /** 0..1 */
  readonly value: number
  readonly shape: BreakpointShape
}

/**
 * A curve across the whole song, as breakpoints rather than a sampled grid.
 * A grid was fine for a loop of a few bars; across a thousand bars it would be
 * either far too coarse or far too large, and a hand-placed point would not
 * survive being resampled onto it.
 */
export interface Envelope {
  /** Sorted by bar. */
  readonly points: readonly Breakpoint[]
}

export interface MacroTrack {
  readonly enabled: boolean
  readonly envelope: Envelope
}

/** What happens at the end: start again, carry on as the last bar left it, or stop. */
export type SongEnd = 'loop' | 'hold' | 'stop'

export type ProgressionStyle = 'drift' | 'pedal' | 'circle' | 'rise' | 'custom'

export const PROGRESSION_STYLES: readonly ProgressionStyle[] = ['drift', 'pedal', 'circle', 'rise', 'custom']

export type Extensions = 'auto' | 'triad' | 'seventh' | 'ninth' | 'eleventh' | 'sus2' | 'sus4'

export const EXTENSIONS: readonly Extensions[] = ['auto', 'triad', 'seventh', 'ninth', 'eleventh', 'sus2', 'sus4']

/**
 * The harmony from one bar until the next section starts. Every field that
 * can be null means "the dials decide", so a section can pin the key and leave
 * everything else to Colour and Drift.
 */
export interface HarmonySection {
  readonly startBar: number
  /** Pitch class of the tonic, 0 = C. */
  readonly key: number | null
  /** A mode's name, as listed in MODES. */
  readonly mode: string | null
  readonly style: ProgressionStyle
  /** Scale degrees, 0-based, cycled through by the 'custom' style. */
  readonly degrees: readonly number[]
  /** Bars per chord. */
  readonly chordBars: number | null
  readonly extensions: Extensions
}

export interface Song {
  readonly lengthBars: number
  readonly end: SongEnd
  readonly macros: Partial<Record<MacroKey, MacroTrack>>
  /** Sorted by startBar. Empty means the dials decide everything. */
  readonly harmony: readonly HarmonySection[]
}

export const MAX_SONG_BARS = 9999
export const CHORD_BAR_CHOICES: readonly number[] = [1, 2, 4, 8, 16]

/** A song with nothing on it behaves exactly like the endless stream. */
export const DEFAULT_SONG: Song = {
  lengthBars: 64,
  end: 'hold',
  macros: {},
  harmony: [],
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
