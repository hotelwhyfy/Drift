import type { Chord, Mode } from '../core/theory.ts'

export type Role = 'bass' | 'chordal' | 'melodic' | 'colour'

/**
 * What an instrument asks for. Note what is absent: a pitch.
 *
 * Instruments describe the *shape* of what they want to play — how high in
 * their register, how hard, what musical job it is doing — and the resolver
 * decides what note that is. This is the mechanism behind "impossible to play a
 * wrong note": a wrong note is not filtered out downstream, it is
 * unrepresentable upstream. There is no field here in which to put one.
 */
export interface NoteIntent {
  readonly role: Role
  /** -1 (bottom of this instrument's register) to +1 (top). */
  readonly contour: number
  /** 0..1, becomes velocity. */
  readonly weight: number
  /** Sixteenth-note slot within the bar, 0..15. Decides harmonic licence. */
  readonly step: number
  /** How long the note is held, in sixteenths. */
  readonly lengthSteps: number
}

export interface Register {
  /** Centre of this instrument's range, MIDI. */
  readonly centre: number
  /** Half-width in semitones. */
  readonly span: number
}

export interface HarmonicContext {
  readonly chord: Chord
  readonly mode: Mode
  readonly rootMidi: number
}
