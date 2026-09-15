import type { Rng } from '../core/rng.ts'
import type { Stereo } from '../voices/types.ts'
import type { RuleBase } from '../fuzzy/inference.ts'
import type { Expression } from '../fuzzy/expression.ts'
import type { NoteIntent, Role } from '../harmony/resolver.ts'
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
}
