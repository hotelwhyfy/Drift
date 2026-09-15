import type { Macros } from './macros.ts'
import { clamp01, clamp, lerp, lerpExp, bias, ramp, hump, dbToGain } from '../core/curves.ts'
import { MODES, modeAt } from '../core/theory.ts'
import type { Expression } from '../fuzzy/expression.ts'
import type { Mode } from '../core/theory.ts'

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
}

export interface Patch {
  /** The global expression every instrument is pulled towards. */
  expression: Expression
  reverb: ReverbSettings
  echo: EchoSettings
  master: MasterSettings
  compose: ComposeSettings
}

/**
 * Macros → the global expression.
 *
 * The six dials do not disappear now that instruments infer their own
 * parameters; they become the thing instruments infer *from*. A dial no longer
 * sets a filter — it moves a point in the expression space, and every rule base
 * in the rack reacts to that move in its own terms. Which is why one gesture
 * can still change everything without the master layer needing to know what is
 * loaded.
 *
 * Tension has no dial of its own. It is the one quality better derived than
 * dialled: darkness plus restlessness is what tension actually is, and giving
 * it a seventh dial would mostly produce settings that contradict the other
 * two.
 */
export function expressionFor(m: Macros): Expression {
  const warmth = clamp01(m.warmth)
  const colour = clamp01(m.colour)
  const drift = clamp01(m.drift)
  return {
    brightness: clamp01(colour * 0.82 + (1 - warmth) * 0.18),
    weight: clamp01(warmth * 0.62 + (1 - colour) * 0.38),
    motion: clamp01(drift * 0.74 + clamp01(m.pulse) * 0.26),
    tension: clamp01((1 - colour) * 0.52 + drift * 0.34 + (1 - clamp01(m.space)) * 0.14),
    density: clamp01(m.density),
  }
}

/** Nearest musical phrase length: 1, 2, 4 or 8 bars. */
function snapPhrase(bars: number): number {
  return bars > 6 ? 8 : bars > 3 ? 4 : bars > 1.5 ? 2 : 1
}

/**
 * Loudness compensation.
 *
 * Saturation, surface noise and extra voices all add level, so without this a
 * sweep of Warmth or Density is heard first as a volume change and only second
 * as the tonal change it is meant to be — and louder reliably reads as better,
 * which would quietly bias every judgement made with these dials.
 *
 * The coefficients are a least-squares fit of measured RMS across the eight
 * scenes against the four macros that move it, flattening an 8 dB spread to
 * about 1.2 dB. The fit is specific to what the rack contains and how loud each
 * instrument is: it was re-derived when instruments moved onto fuzzy inference,
 * and a stale fit is worse than none — the previous one had inverted, making
 * sparse settings the loudest. Re-fit with `npm run audition` after changing
 * any instrument's level.
 */
function levelTrim(
  warmth: number,
  _colour: number,
  space: number,
  pulse: number,
  density: number,
): number {
  const db = 13.6 - 15.4 * warmth + 5.5 * density - 2.3 * pulse - 2.4 * space
  return dbToGain(clamp(db, -6, 12))
}

/**
 * The macro fan-out.
 *
 * Every line below is a musical judgement, and the shape of the curve carries
 * most of it. Three patterns recur:
 *
 *   `bias(x, k)`  holds an effect back so the first third of a dial's travel is
 *                 subtle and the last third is dramatic — which is how the ear
 *                 hears most of these quantities anyway.
 *   `ramp(x,a,b)` brings a parameter in over only part of the travel, so one
 *                 dial can stage several changes in sequence instead of moving
 *                 everything at once. Pulse uses this heavily: the kit arrives
 *                 well after the tempo has started to firm up.
 *   `lerpExp`     interpolates frequencies and times geometrically, because a
 *                 linear sweep from 200 Hz to 8 kHz spends almost all of its
 *                 travel in a region the ear hears as one place.
 *
 * The guarantee this function owes the interface: every point in the six-cube
 * sounds like finished music. There are no bad corners to avoid, which is what
 * lets the UI be six dials and nothing else.
 */
export function buildPatch(m: Macros): Patch {
  const warmth = clamp01(m.warmth)
  const colour = clamp01(m.colour)
  const space = clamp01(m.space)
  const pulse = clamp01(m.pulse)
  const density = clamp01(m.density)
  const drift = clamp01(m.drift)

  // ── Harmony ──────────────────────────────────────────────────────────────
  // Colour walks the modal list dark → luminous, so brightening the timbre and
  // brightening the harmony are the same gesture rather than two controls the
  // user has to keep consistent by hand.
  const mode = modeAt(colour)
  // Dark settings also sit lower. Pitch height and mode both carry "dark", and
  // moving them together is much stronger than either alone.
  const rootMidi = Math.round(lerp(45, 53, colour))
  // A=432 at the warm end: not a claim about the tuning, just that a slightly
  // flatter reference suits dusty material and a brighter one suits open.
  const referenceHz = lerp(432, 441, colour * 0.6 + (1 - warmth) * 0.4)

  // ── Time ─────────────────────────────────────────────────────────────────
  // At pulse 0 there is no beat at all, but the composer still needs a clock to
  // hang slow events on, so tempo never actually reaches zero.
  const tempo = lerp(54, 88, bias(pulse, 0.75))
  // Swing peaks in the middle: dead straight at the ambient end because there
  // is nothing to swing, and straighter again at the top where the beat wants
  // to drive rather than lope.
  const swing = hump(pulse, 0.55, 0.5) * 0.34

  // ── Reverb ───────────────────────────────────────────────────────────────
  const reverb: ReverbSettings = {
    size: lerp(0.2, 1, bias(space, 0.85)),
    decay: lerpExp(0.9, 16, bias(space, 1.15)),
    // Bright rooms at the luminous end, dark ones at the warm end. Damping is
    // where Colour and Warmth meet, and it is the most convincing single cue
    // for how a space feels.
    damping: clamp01(lerp(0.72, 0.18, colour) + warmth * 0.22),
    preDelay: lerp(0.006, 0.075, bias(space, 1.3)),
    width: lerp(0.55, 1, space),
    // Never fully dry and never fully wet — the mix is the one parameter where
    // the extremes really are worse, so the dial does not reach them.
    mix: lerp(0.09, 0.62, bias(space, 1.05)),
  }

  // ── Echo ─────────────────────────────────────────────────────────────────
  const beatSec = 60 / tempo
  const echo: EchoSettings = {
    // Locked to a dotted eighth, the one delay time that sits inside a lo-fi
    // groove instead of fighting it.
    time: beatSec * 0.75,
    feedback: lerp(0.15, 0.62, space) * lerp(0.6, 1, drift),
    tone: lerpExp(1200, 4200, colour),
    mix: ramp(space, 0.22, 1) * lerp(0.18, 0.34, density),
  }

  // ── Master character ─────────────────────────────────────────────────────
  const master: MasterSettings = {
    // Wow arrives early and keeps growing; flutter is held back so the low
    // settings read as "a warm recording" rather than "a broken machine".
    wow: bias(warmth, 0.8) * 0.85,
    flutter: ramp(warmth, 0.25, 1) * 0.7,
    drive: lerp(0.8, 3.4, bias(warmth, 1.2)),
    // The single most effective lo-fi move: take the top off. Geometric,
    // because the last 2 kHz of the sweep matter as much as the first 8.
    tilt: lerpExp(15500, 5200, bias(warmth, 0.9)) * lerp(0.82, 1.15, colour),
    lowCut: lerp(24, 46, warmth),
    // Ducking only makes sense once there is a kick to duck against, so it
    // rides Pulse and arrives with the kit.
    duckAmount: ramp(pulse, 0.14, 0.8) * 0.42,
    duckRelease: lerp(0.34, 0.16, pulse),
    chorusDepth: lerp(0.25, 0.7, drift),
    chorusMix: lerp(0.12, 0.42, space) * lerp(0.7, 1, drift),
    gain: levelTrim(warmth, colour, space, pulse, density),
  }

  // ── Composition ──────────────────────────────────────────────────────────
  const compose: ComposeSettings = {
    tempo,
    mode,
    rootMidi,
    referenceHz,
    // Held for eight bars at the static end, changing every bar at the
    // restless end. This is the strongest thing Drift does.
    //
    // Snapped to powers of two rather than left continuous: a five-bar
    // harmonic rhythm is permanently out of phase with the four-bar drum
    // phrasing, so the two never agree about where the music restarts. Odd
    // lengths are a deliberate compositional device, not something a dial
    // should wander into by accident.
    chordBars: snapPhrase(lerp(8, 1, bias(drift, 0.85))),
    wander: bias(drift, 1.4) * 0.75,
    richness: lerp(0.15, 0.95, density),
    swing,
    humanise: lerp(0.25, 0.75, warmth * 0.5 + drift * 0.5),
    variation: lerp(0.08, 0.8, drift),
  }

  return { expression: expressionFor(m), reverb, echo, master, compose }
}

/** Exposed for the UI: which mode a Colour position lands on. */
export function modeNameAt(colour: number): string {
  return MODES[Math.round(clamp01(colour) * (MODES.length - 1))].name
}
