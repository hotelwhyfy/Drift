import type { Reverb } from '@/dsp/reverb.ts'
import type { WowFlutter, Saturator, Limiter } from '@/dsp/tape.ts'
import type { Chorus, PingPong, Ducker } from '@/dsp/modfx.ts'
import type { Svf } from '@/dsp/svf.ts'
import type { Expression } from '@/fuzzy/expression.ts'
import type { Lane } from '@/automation/lane.ts'
import type { DrumHit } from '@/core/types.ts'
import type { Macros } from '@/macros/macros.ts'

/**
 * A serialisable description of one slot. The interface owns this; the rack
 * reconciles itself to it.
 *
 * Mirroring state between a worker and the UI is a reliable source of bugs, so
 * there is only one authority: the UI sends what the rack should be, and the
 * rack works out the difference. Adding an instrument and dragging its level
 * go through the same path, which means there is one path to get right.
 */
export interface SlotDesc {
  readonly id: string
  readonly defId: string
  readonly name: string
  readonly level: number
  readonly muted: boolean
  readonly soloed: boolean
  readonly expression: Expression
  readonly follow: number
  readonly lanes: Lane[]
  /**
   * Direct settings, normalised 0..1 across each parameter's range. A
   * parameter with no entry is left to the rules; one with an entry overrides
   * them, and lanes then automate relative to it.
   */
  readonly knobs: Readonly<Record<string, number>>
}

export interface SlotState {
  readonly id: string
  readonly defId: string
  name: string
  level: number
  muted: boolean
  soloed: boolean
  /** The instrument's own expression, before automation. */
  expression: Expression
  /** 0 = entirely its own expression, 1 = entirely the global one. */
  follow: number
  lanes: Lane[]
  knobs: Readonly<Record<string, number>>
}

/** What a slot is doing right now, for the interface to show. */
export interface SlotReadout {
  readonly id: string
  readonly expression: Expression
  readonly level: number
  /** Loudest sample since the last readout, after level, mute and solo. */
  readonly peak: number
  /** RMS over the same span. Both are the instrument's dry contribution, before the room. */
  readonly rms: number
  /** Every parameter, normalised 0..1 — what an untouched knob would read. */
  readonly params: Readonly<Record<string, number>>
}

export interface ScheduledEvent {
  /** Samples from the start of the bar. */
  offset: number
  slotId: string
  midi?: number
  hit?: DrumHit
  velocity: number
  durationSec: number
}

export interface EngineSnapshot {
  bar: number
  barPhase: number
  chordDegree: number
  chordNotes: readonly number[]
  peak: number
  rms: number
  /** Per-slot state after automation, for the interface to display. */
  slots: SlotReadout[]
  /** The six dials as the music has them now — the song's where it drives them. */
  macros: Macros
  tempo: number
  modeName: string
  rootMidi: number
  /** A song set to stop has reached its end; only tails remain. */
  ended: boolean
}

/** Everything after the rack: one shared room, the tape, the limiter. */
export interface MasterChain {
  readonly reverb: Reverb
  readonly echo: PingPong
  readonly chorus: Chorus
  readonly wow: WowFlutter
  readonly sat: Saturator
  readonly limiter: Limiter
  readonly ducker: Ducker
  readonly tiltL: Svf
  readonly tiltR: Svf
  readonly lowCutL: Svf
  readonly lowCutR: Svf
}
