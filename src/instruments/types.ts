import type { Rng } from '../core/rng.ts'
import type { Stereo } from '../voices/types.ts'
import type { RuleBase, OutputSpec } from '../fuzzy/inference.ts'
import type { Expression } from '../fuzzy/expression.ts'
import type { NoteIntent, Register, Role } from '../harmony/resolver.ts'
import type { DrumHit } from '../voices/drums.ts'

/** What an instrument's sound engine must be able to do. */
export interface InstrumentVoice {
  /** Pitched instruments. `midi` has already been through the resolver. */
  noteOn?(midi: number, velocity: number, durationSec: number, referenceHz: number): void
  /** Percussive instruments. */
  hit?(kind: DrumHit, velocity: number): void
  process(out: Stereo): void
}

export interface PercussionEvent {
  readonly step: number
  readonly kind: DrumHit
  readonly velocity: number
}

export interface PatternContext {
  readonly bar: number
  readonly expression: Expression
  /** Defuzzified parameters, same keys as the rule base's outputs. */
  readonly params: Readonly<Record<string, number>>
  /** Seeded on (instrument, bar) — deterministic and seekable. */
  readonly rng: Rng
  /** Tempo, so an instrument can reason in seconds if it must. */
  readonly tempo: number
  /**
   * A generator keyed to this instrument and whatever coordinates are given —
   * for decisions that belong to a phrase rather than a bar, so four bars can
   * share a groove and still be seekable.
   */
  readonly phraseRng: (...parts: (string | number)[]) => Rng
}

/**
 * A parameter no rule sets. It sits at `default` (normalised 0..1) until a
 * knob or a lane moves it — for choices like a drum pattern's style, where
 * "the rules decide" would mean nothing.
 */
export interface FixedParam extends OutputSpec {
  readonly default: number
}

/**
 * One knob on an instrument's panel. Names either a rule output (the knob
 * overrides what the rules inferred) or a fixed parameter.
 */
export interface ControlSpec {
  readonly param: string
  readonly label: string
  /** Heading the knob is grouped under. */
  readonly group?: string
  /** An enumerated choice: the parameter's value, floored, indexes this. */
  readonly options?: readonly string[]
}

/**
 * An instrument definition.
 *
 * The important asymmetry: an instrument declares how it *responds* and what it
 * *wants to play*, and never touches pitch or the mix. It cannot choose a note
 * (only a contour, via NoteIntent) and it cannot set its own level relative to
 * the rest (the rack does). Both restrictions exist so that adding a twentieth
 * instrument cannot break the nineteen already there.
 */
export interface InstrumentDef {
  readonly id: string
  readonly name: string
  readonly role: Role
  /** One line, shown when picking an instrument. */
  readonly blurb: string
  readonly create: (sampleRate: number, rng: Rng) => InstrumentVoice
  readonly rules: RuleBase
  /** Push inferred parameters into the voice. Called at control rate. */
  readonly apply: (voice: InstrumentVoice, params: Record<string, number>, level: number) => void
  /** Pitched instruments: what to play this bar, as intents. */
  readonly notes?: (ctx: PatternContext) => NoteIntent[]
  /** Percussive instruments: what to hit this bar. */
  readonly hits?: (ctx: PatternContext) => PercussionEvent[]
  /** Textural instruments make no events; they simply run. */
  readonly continuous?: boolean
  readonly fixed?: Readonly<Record<string, FixedParam>>
  /** The knobs shown for this instrument, in order. */
  readonly controls?: readonly ControlSpec[]
  /**
   * Move the register the resolver places this instrument's notes in. The
   * resolver still chooses every pitch; this only says where to look.
   */
  readonly register?: (params: Readonly<Record<string, number>>, base: Register) => Register
}
