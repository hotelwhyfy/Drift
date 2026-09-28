/**
 * Just enough theory for endless modal music. Modes are listed dark to
 * luminous, because that ordering *is* the Colour macro: moving the dial walks
 * this list, so the harmony brightens with the timbre rather than independently
 * of it.
 */
import { clamp, clamp01 } from './curves.ts'
import type { Rng } from './rng.ts'
import { pickWeighted } from './rng.ts'
import type { Extensions } from '../song/song.ts'

export interface Mode {
  readonly name: string
  readonly steps: readonly number[]
}

/** Ordered dark → luminous. The Colour macro indexes into this. */
export const MODES: readonly Mode[] = [
  { name: 'phrygian', steps: [0, 1, 3, 5, 7, 8, 10] },
  { name: 'aeolian', steps: [0, 2, 3, 5, 7, 8, 10] },
  { name: 'dorian', steps: [0, 2, 3, 5, 7, 9, 10] },
  { name: 'mixolydian', steps: [0, 2, 4, 5, 7, 9, 10] },
  { name: 'ionian', steps: [0, 2, 4, 5, 7, 9, 11] },
  { name: 'lydian', steps: [0, 2, 4, 6, 7, 9, 11] },
]

/** Pitch-class names, spelled the way they most often appear in these modes. */
export const NOTE_NAMES: readonly string[] = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B']

export function modeAt(colour: number): Mode {
  const i = Math.round(clamp01(colour) * (MODES.length - 1))
  return MODES[i]
}

/** MIDI note → Hz at a chosen concert pitch (A=432 is a common lo-fi choice). */
export function midiToHz(midi: number, referenceHz = 440): number {
  return referenceHz * Math.pow(2, (midi - 69) / 12)
}

/** Scale degree (0-based, may exceed the octave or go negative) → semitones. */
export function degreeToSemitone(mode: Mode, degree: number): number {
  const n = mode.steps.length
  const octave = Math.floor(degree / n)
  const idx = degree - octave * n
  return mode.steps[idx] + octave * 12
}

/** Snap any semitone to the nearest scale member, preserving octave. */
export function quantiseToMode(mode: Mode, semitone: number, root: number): number {
  const rel = semitone - root
  const octave = Math.floor(rel / 12)
  const pc = rel - octave * 12
  let best = mode.steps[0]
  let bestD = 99
  for (let i = 0; i < mode.steps.length; i++) {
    const d = Math.abs(mode.steps[i] - pc)
    if (d < bestD) { bestD = d; best = mode.steps[i] }
  }
  return root + octave * 12 + best
}

/**
 * Move `steps` scale degrees from a pitch, staying in the mode. Distinct from
 * quantising a semitone offset, which can snap straight back to where it
 * started and produce no movement at all.
 */
export function stepInMode(mode: Mode, root: number, pitch: number, steps: number): number {
  const n = mode.steps.length
  const rel = pitch - root
  const octave = Math.floor(rel / 12)
  const pc = rel - octave * 12
  let idx = 0
  let best = 99
  for (let i = 0; i < n; i++) {
    const d = Math.abs(mode.steps[i] - pc)
    if (d < best) { best = d; idx = i }
  }
  const target = idx + steps
  const targetOctave = Math.floor(target / n)
  const targetIdx = target - targetOctave * n
  return root + (octave + targetOctave) * 12 + mode.steps[targetIdx]
}

export interface Chord {
  /** Scale degree the chord is built on, 0-based. */
  readonly degree: number
  /** Absolute MIDI pitches, already voiced. */
  readonly notes: readonly number[]
  /** Root pitch for the bass, an octave or two down. */
  readonly root: number
}

/**
 * Stack thirds on a degree, then add extensions. `richness` 0..1 grows the
 * chord from a bare triad to a ninth/eleventh — the Density macro's harmonic
 * half, so a sparse setting also means simpler chords.
 */
export function buildChord(
  mode: Mode,
  rootMidi: number,
  degree: number,
  richness: number,
  extensions: Extensions = 'auto',
): readonly number[] {
  return chordStack(extensions, richness).map((s) => rootMidi + degreeToSemitone(mode, degree + s))
}

/**
 * Which scale steps above the chord's root to stack, as degree offsets. The
 * suspended shapes replace the third with the second or fourth — the most
 * useful chord in ambient music, because it has no major-or-minor to commit
 * to — and pick up a seventh once richness asks for more than three notes.
 */
export function chordStack(extensions: Extensions, richness: number): number[] {
  const r = clamp01(richness)
  switch (extensions) {
    case 'triad': return [0, 2, 4]
    case 'seventh': return [0, 2, 4, 6]
    case 'ninth': return [0, 2, 4, 6, 8]
    case 'eleventh': return [0, 2, 4, 6, 8, 10]
    case 'sus2': return r > 0.25 ? [0, 1, 4, 6] : [0, 1, 4]
    case 'sus4': return r > 0.25 ? [0, 3, 4, 6] : [0, 3, 4]
    case 'auto': {
      const stack = [0, 2, 4] // triad
      if (r > 0.25) stack.push(6) // seventh
      if (r > 0.62) stack.push(8) // ninth
      if (r > 0.88) stack.push(10) // eleventh / thirteenth region
      return stack
    }
  }
}

/**
 * Voice a chord near a previous voicing so successive chords share register and
 * move by small steps. Without this an endless progression jumps around and
 * stops sounding like one instrument playing.
 */
export function voiceNear(
  notes: readonly number[],
  previous: readonly number[],
  centre: number,
): number[] {
  const target = previous.length > 0
    ? previous.reduce((a, b) => a + b, 0) / previous.length
    : centre
  // Stack the chord upward from just under the previous voicing's centre,
  // each note in the lowest octave that still clears the one below it. Common
  // tones therefore stay put and the rest move by a step or two.
  const sorted = [...notes].sort((a, b) => a - b)
  const out: number[] = []
  let floor = target - 7
  for (let i = 0; i < sorted.length; i++) {
    let p = sorted[i]
    while (p < floor) p += 12
    while (p - 12 >= floor) p -= 12
    out.push(clamp(p, centre - 26, centre + 26))
    floor = p + 2 // no unisons, no minor seconds at the bottom of the stack
  }
  return out
}

/**
 * Weights for moving from one degree to the next. Modal ambient wants motion
 * that circles rather than resolves, so the tonic is attractive but never
 * final, and the fifth and fourth carry most of the traffic.
 */
const DEGREE_TRANSITIONS: readonly (readonly number[])[] = [
  //     I    ii   iii  IV   V    vi   vii
  /*I*/ [0.6, 1.0, 0.7, 1.5, 1.4, 1.6, 0.4],
  /*ii*/ [1.0, 0.3, 0.5, 0.8, 1.8, 0.7, 0.5],
  /*iii*/ [0.9, 0.6, 0.2, 1.4, 0.6, 1.5, 0.3],
  /*IV*/ [1.6, 0.9, 0.6, 0.3, 1.5, 1.0, 0.4],
  /*V*/ [1.9, 0.5, 0.6, 0.7, 0.2, 1.3, 0.3],
  /*vi*/ [1.2, 1.1, 0.7, 1.5, 1.0, 0.3, 0.4],
  /*vii*/ [1.4, 0.4, 0.9, 0.6, 0.8, 0.9, 0.2],
]

/** The next degree in an endless modal walk, chosen deterministically. */
export function nextDegree(rng: Rng, from: number, wander: number): number {
  const row = DEGREE_TRANSITIONS[((from % 7) + 7) % 7]
  // `wander` flattens the table: at 1 every degree is nearly equally likely,
  // so the progression stops behaving like a key and starts drifting.
  const w = clamp01(wander)
  const flattened = row.map((x) => x * (1 - w) + 0.9 * w)
  return pickWeighted(rng, flattened)
}
