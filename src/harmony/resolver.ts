import type { Mode } from '../core/theory.ts'
import { stepInMode } from '../core/theory.ts'
import type { Chord } from '../core/theory.ts'
import { clamp } from '../core/curves.ts'
import { rngAt } from '../core/rng.ts'
import type { Rng } from '../core/rng.ts'

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

/**
 * Metrical strength of each sixteenth in a 4/4 bar.
 *
 * This table is the entire licence system. A note on beat one is load-bearing
 * and must be a chord tone; a note on the last sixteenth is passing and can be
 * almost anything, because the ear reads it as decoration on the way somewhere.
 * Applying one rule to every position is what makes generative music sound
 * either stiff (all chord tones) or wrong (all scale tones).
 */
const STRENGTH = [
  1.0, 0.15, 0.4, 0.2, 0.75, 0.15, 0.45, 0.2,
  0.9, 0.15, 0.4, 0.2, 0.75, 0.15, 0.45, 0.25,
]

export function beatStrength(step: number): number {
  return STRENGTH[((step % 16) + 16) % 16]
}

/**
 * Turns intents into pitches, and owns every decision that could produce a
 * wrong note.
 *
 * It is a single object shared by the whole rack rather than one per
 * instrument, because the most audible wrong notes are not wrong in isolation —
 * they are two instruments colliding. Only something that sees all of them at
 * once can prevent that.
 */
interface Sounding {
  readonly pitch: number
  readonly owner: string
  /** Sixteenth-note span this note occupies. */
  readonly start: number
  readonly end: number
}

export class Resolver {
  private sounding: Sounding[] = []
  private bar = 0

  constructor(private seed: number) {}

  /** A new seed means new decisions from the next bar on; nothing is rebuilt. */
  setSeed(seed: number): void {
    this.seed = seed
  }

  /** Called at the top of each bar; forgets the previous bar's collisions. */
  beginBar(bar: number): void {
    this.sounding.length = 0
    this.bar = bar
  }

  /**
   * @param owner  instrument id, so an instrument does not collide with itself
   */
  resolve(
    intent: NoteIntent,
    ctx: HarmonicContext,
    register: Register,
    owner: string,
  ): number | null {
    const strength = beatStrength(intent.step)
    // Seeded on the note's own musical coordinates rather than drawn from a
    // running stream. With a stream, bar 400's chromatic decisions would depend
    // on how many notes happened to be resolved before it, so seeking there
    // would produce different music from playing there — the one thing the
    // whole design is not allowed to do.
    const rng = rngAt(this.seed, 'resolve', this.bar, owner, intent.step)
    const candidates = this.candidatesFor(intent.role, ctx, strength, rng)
    if (candidates.length === 0) return null

    // Where in the register the instrument asked to be.
    const target = register.centre + clamp(intent.contour, -1, 1) * register.span

    // Nearest permitted pitch to that target, in any octave.
    const scored = candidates
      .map((pc) => this.nearestInOctave(pc, target))
      .filter((p) => p >= register.centre - register.span - 6 &&
                     p <= register.centre + register.span + 6)
    if (scored.length === 0) return null
    scored.sort((a, b) => Math.abs(a - target) - Math.abs(b - target))

    const start = intent.step
    const end = intent.step + Math.max(1, intent.lengthSteps)
    for (const pitch of scored) {
      if (this.acceptable(pitch, owner, intent.role, start, end)) {
        this.sounding.push({ pitch, owner, start, end })
        return pitch
      }
    }
    // Everything collided. Staying silent is a legitimate musical answer and a
    // far better one than forcing a note nobody has room for.
    return null
  }

  /**
   * The permitted pitch classes for a role at a given metrical position.
   * Licence widens as metrical strength falls.
   */
  private candidatesFor(
    role: Role,
    ctx: HarmonicContext,
    strength: number,
    rng: Rng,
  ): number[] {
    const chordPcs = ctx.chord.notes.map((n) => ((n % 12) + 12) % 12)
    const rootPc = ((ctx.chord.root % 12) + 12) % 12
    const scalePcs = ctx.mode.steps.map((s) => ((ctx.rootMidi + s) % 12 + 12) % 12)

    switch (role) {
      case 'bass':
        // The bass defines the harmony; it does not get to be adventurous.
        // Root, fifth, and on weak beats the third.
        if (strength > 0.6) return [rootPc]
        return strength > 0.3
          ? [rootPc, (rootPc + 7) % 12]
          : [rootPc, (rootPc + 7) % 12, ...chordPcs]

      case 'chordal':
        return chordPcs

      case 'melodic': {
        if (strength > 0.7) return chordPcs
        if (strength > 0.35) return [...new Set([...chordPcs, ...scalePcs])]
        // Weakest positions admit a chromatic approach, but only one, and only
        // as a neighbour of a scale tone — never as a free choice.
        const approach = scalePcs.map((pc) => (pc + (rng() < 0.5 ? 11 : 1)) % 12)
        return [...new Set([...chordPcs, ...scalePcs, ...(rng() < 0.22 ? approach : [])])]
      }

      case 'colour':
        // Upper extensions and scale tones; colour parts sit above the harmony.
        return [...new Set([...chordPcs, ...scalePcs])]
    }
  }

  private nearestInOctave(pitchClass: number, target: number): number {
    const targetPc = ((Math.round(target) % 12) + 12) % 12
    let delta = pitchClass - targetPc
    if (delta > 6) delta -= 12
    if (delta < -6) delta += 12
    return Math.round(target) + delta
  }

  /**
   * Collision rules. These are the intervals that sound like mistakes when two
   * independent parts happen upon them, as opposed to when a composer writes
   * them deliberately.
   */
  private acceptable(
    pitch: number,
    owner: string,
    role: Role,
    start: number,
    end: number,
  ): boolean {
    for (const other of this.sounding) {
      // Only notes actually sounding at the same time can collide. Comparing
      // every note in the bar instead — as this once did — forbids a melodic
      // line from moving by a semitone, which is not a collision at all but
      // simply a line moving by a semitone.
      if (other.end <= start || other.start >= end) continue
      const gap = Math.abs(pitch - other.pitch)
      if (other.owner === owner) {
        // An instrument may double itself at the octave but not in unison.
        if (gap === 0) return false
        continue
      }
      // Unison between two different instruments muddies both.
      if (gap === 0) return false
      // Minor seconds and minor ninths between parts read as errors.
      if (gap === 1 || gap === 13) return false
      // Anything close together low down turns to mud regardless of interval.
      if (Math.min(pitch, other.pitch) < 52 && gap < 7 && role !== 'bass') return false
    }
    return true
  }

  /** Register presets by role, so instruments need not invent their own. */
  static registerFor(role: Role, rootMidi: number): Register {
    switch (role) {
      case 'bass':
        return { centre: rootMidi, span: 7 }
      case 'chordal':
        return { centre: rootMidi + 22, span: 9 }
      case 'melodic':
        return { centre: rootMidi + 29, span: 12 }
      case 'colour':
        return { centre: rootMidi + 36, span: 12 }
    }
  }
}

export { stepInMode }
