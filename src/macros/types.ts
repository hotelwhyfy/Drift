import type { Mode } from '../core/theory.ts'
import type { Expression } from '../fuzzy/expression.ts'
import type { ProgressionStyle, Extensions } from '../song/types.ts'

export interface ReverbSettings {
  size: number
  decay: number
  damping: number
  preDelay: number
  width: number
  mix: number
}

export interface EchoSettings {
  time: number
  feedback: number
  tone: number
  mix: number
}

export interface MasterSettings {
  wow: number
  flutter: number
  drive: number
  /** Master lowpass in Hz — the top of the whole record. */
  tilt: number
  /** Rumble filter in Hz. */
  lowCut: number
  duckAmount: number
  duckRelease: number
  chorusDepth: number
  chorusMix: number
  gain: number
}

/** Everything the composer needs that is not a sound. */
export interface ComposeSettings {
  tempo: number
  mode: Mode
  rootMidi: number
  referenceHz: number
  /** Bars each chord is held. */
  chordBars: number
  /** 0..1 — how far the progression strays from its key. */
  wander: number
  /** Chord tone count, driven into buildChord. */
  richness: number
  /** 0..1 — 0 is dead straight, 0.5 is a hard shuffle. */
  swing: number
  /** 0..1 — how much velocities and timings scatter. */
  humanise: number
  /** 0..1 — probability a bar deviates from the previous figure. */
  variation: number
  /** How the progression chooses its next chord. The dials always say 'drift'. */
  style: ProgressionStyle
  /** Scale degrees the 'custom' style cycles through. */
  degrees: readonly number[]
  /** Which chord tones to stack; 'auto' lets richness decide. */
  extensions: Extensions
  /** First bar of the harmony section in force. A section start is always a chord change. */
  sectionStart: number
}

export interface Patch {
  /** The global expression every instrument is pulled towards. */
  expression: Expression
  reverb: ReverbSettings
  echo: EchoSettings
  master: MasterSettings
  compose: ComposeSettings
}
