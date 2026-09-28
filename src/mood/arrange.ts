import type { Reading } from './interpret.ts'
import { restingPlace } from './interpret.ts'
import type { Macros } from '../macros/macros.ts'
import type { Expression } from '../fuzzy/expression.ts'
import type { SlotDesc } from '../engine/rack.ts'
import { instrumentById } from '../instruments/registry.ts'
import { makeLane } from '../automation/lane.ts'
import type { Lane } from '../automation/lane.ts'
import { clamp01, lerp } from '../core/curves.ts'
import { rngAt } from '../core/rng.ts'

/**
 * An expression position → the six master dials.
 *
 * The dials and the expression space overlap but are not the same thing: the
 * dials also carry decisions about *production* — how wet, how dusty, how fast
 * — that an emotional reading does not directly contain. This is where those
 * get decided.
 */
export function macrosFor(reading: Reading): Macros {
  const e = reading.expression
  return {
    // Brightness is the dominant term, lifted slightly by valence: a bright
    // but unhappy answer should not land in the same mode as a bright, glad one.
    colour: clamp01(e.brightness * 0.78 + reading.valence * 0.22),

    // Heaviness becomes tape and dust. Low valence adds to it too — the worn,
    // nostalgic end of the dial is where sadness sounds like something rather
    // than merely sounding thin.
    warmth: clamp01(0.3 + e.weight * 0.42 + (1 - reading.valence) * 0.2),

    // Emptiness reads as distance. Sparse, low-valence answers get a large
    // room; busy, contented ones get a close one.
    space: clamp01(0.36 + (1 - e.density) * 0.32 + (1 - reading.valence) * 0.18),

    // Arousal decides whether there is a beat at all — but capped well short of
    // the top. Someone who answers "wired" is told they were heard; they are
    // not handed something that winds them further up.
    pulse: clamp01(reading.arousal * 0.62),

    density: clamp01(e.density * 0.85 + 0.08),

    // Restlessness becomes harmonic and timbral motion.
    drift: clamp01(e.motion * 0.8 + reading.arousal * 0.15),
  }
}

/** Nudge one dimension of an expression without disturbing the others. */
function shade(base: Expression, changes: Partial<Expression>): Expression {
  return { ...base, ...changes }
}

interface Choice {
  defId: string
  /** Character offset from the reading. */
  expression: Expression
  /** How strongly it follows the master dials, and therefore the journey. */
  follow: number
  level: number
}

/**
 * Which instruments are in the room.
 *
 * Presence is the loudest decision this whole feature makes. An answer of
 * "exhausted" that comes back with a drum kit has not listened, however soft
 * the kit is — so the kit is genuinely absent below the threshold rather than
 * merely quiet, and the same goes for every other voice.
 */
export function rackFor(reading: Reading): SlotDesc[] {
  const e = reading.expression
  const rng = rngAt(reading.seed, 'rack')
  const choices: Choice[] = []

  // The pad holds the harmony and is always present; without it a sparse
  // answer has nothing underneath it at all.
  choices.push({
    defId: 'pad',
    expression: shade(e, { density: clamp01(e.density * 0.8 + 0.15) }),
    follow: 0.8,
    level: lerp(0.72, 0.92, 1 - e.density),
  })

  // Room tone, likewise always — silence between sparse notes is much emptier
  // than people expect.
  choices.push({
    defId: 'bed',
    expression: shade(e, { motion: clamp01(e.motion * 0.7 + 0.15) }),
    follow: 0.55,
    level: lerp(0.5, 0.95, 1 - e.density),
  })

  // Weight wants a floor under it.
  if (e.weight > 0.3) {
    choices.push({
      defId: 'sub',
      expression: shade(e, { brightness: clamp01(e.brightness * 0.6) }),
      follow: 0.75,
      level: lerp(0.55, 0.95, e.weight),
    })
  }

  // The keys are the voice. They step back when the answer was very sparse or
  // very still, but they rarely disappear — something has to be playing.
  if (e.density > 0.14 && reading.conviction > 0.08) {
    choices.push({
      defId: 'rhodes',
      expression: e,
      follow: 0.85,
      level: lerp(0.6, 0.9, e.density),
    })
  }

  // A beat only once there is real activation behind it.
  if (reading.arousal > 0.45) {
    choices.push({
      defId: 'kit',
      expression: shade(e, { density: clamp01(e.density * 0.7 + reading.arousal * 0.2) }),
      follow: 0.9,
      level: lerp(0.45, 0.8, reading.arousal),
    })
  }

  // Bells for brightness, or for an edge that wants somewhere to go.
  if (e.brightness > 0.58 || e.tension > 0.6) {
    choices.push({
      defId: 'glass',
      expression: shade(e, { brightness: clamp01(e.brightness * 0.5 + 0.5) }),
      follow: 0.6,
      level: lerp(0.4, 0.75, Math.max(e.brightness, e.tension)),
    })
  }

  // Tape and surface noise for the heavy, worn, nostalgic end.
  if (e.weight > 0.52 || reading.valence < 0.42) {
    choices.push({
      defId: 'dust',
      expression: shade(e, { weight: clamp01(e.weight * 0.6 + 0.35) }),
      follow: 0.4,
      level: lerp(0.45, 0.85, Math.max(e.weight, 1 - reading.valence)),
    })
  }

  return choices.map((choice, index) => {
    const def = instrumentById(choice.defId)
    return {
      id: `${choice.defId}-${index}`,
      defId: choice.defId,
      name: def?.name ?? choice.defId,
      level: clamp01(choice.level),
      muted: false,
      soloed: false,
      expression: choice.expression,
      follow: choice.follow,
      lanes: lanesFor(choice, reading, rng()),
      knobs: {},
    }
  })
}

/**
 * Per-instrument automation.
 *
 * Deliberately sparse and all of it non-repeating. The journey itself is a
 * one-way move handled by the master dials; what the lanes add is the small
 * unrepeating variation that keeps an hour of this from feeling like a loop.
 * A drawn curve would loop exactly, which is the one thing it must not do.
 */
function lanesFor(choice: Choice, reading: Reading, roll: number): Lane[] {
  const lanes: Lane[] = []

  // Everything breathes a little, slowly, and never the same way twice.
  const breath = makeLane(`${choice.defId}-breath`, { kind: 'expression', key: 'motion' })
  lanes.push({
    ...breath,
    source: { kind: 'walk', smoothness: 0.85, seed: reading.seed + roll * 1e6 },
    mode: 'add',
    depth: lerp(0.12, 0.3, reading.expression.motion),
    bars: 16,
  })

  // Beds and bells swell and recede on their own, which is most of what stops
  // a texture from reading as a held chord.
  if (choice.defId === 'bed' || choice.defId === 'glass') {
    const swell = makeLane(`${choice.defId}-swell`, { kind: 'level' })
    lanes.push({
      ...swell,
      source: { kind: 'walk', smoothness: 0.92, seed: reading.seed + 7919 },
      mode: 'scale',
      depth: 0.4,
      bars: 32,
    })
  }

  return lanes
}

export interface Arrangement {
  readonly macros: Macros
  readonly resting: Macros
  readonly slots: SlotDesc[]
  readonly seed: number
  /** Minutes the journey from `macros` to `resting` should take. */
  readonly minutes: number
}

/**
 * The whole piece, from one sentence.
 *
 * `macros` is where the music meets them; `resting` is where it will have
 * arrived by the end. How long that takes depends on how far there is to go —
 * moving someone from panic to stillness in two minutes would be its own kind
 * of not listening.
 */
export function arrangementFor(reading: Reading): Arrangement {
  const macros = macrosFor(reading)
  const rest = restingPlace(reading)
  const restingReading: Reading = {
    ...reading,
    expression: rest,
    // The destination is calmer and kinder by definition.
    valence: clamp01(lerp(reading.valence, 0.78, 0.6)),
    arousal: clamp01(reading.arousal * 0.35),
  }
  const resting = macrosFor(restingReading)
  const distance = Math.abs(macros.pulse - resting.pulse) +
    Math.abs(macros.drift - resting.drift) +
    Math.abs(macros.colour - resting.colour) +
    Math.abs(macros.density - resting.density)

  return {
    macros,
    resting,
    slots: rackFor(reading),
    seed: reading.seed,
    minutes: lerp(7, 17, clamp01(distance / 1.6)),
  }
}
