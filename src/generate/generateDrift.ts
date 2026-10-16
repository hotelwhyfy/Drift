import type { Macros, MacroKey } from '../macros/macros.ts'
import { MACRO_KEYS, SCENES } from '../macros/macros.ts'
import type { SlotDesc } from '../engine/types.ts'
import { instrumentById } from '../instruments/registry.ts'
import type { Expression } from '../fuzzy/expression.ts'
import { EXPRESSION_KEYS, NEUTRAL } from '../fuzzy/expression.ts'
import { makeLane } from '../automation/lane.ts'
import type { Lane } from '../automation/lane.ts'
import type { Breakpoint, MacroTrack, Song } from '../song/types.ts'
import { clamp01, lerp } from '../core/curves.ts'
import { centred, deriveSeed, pick, pickWeighted, range, rngAt } from '../core/rng.ts'
import type { Rng } from '../core/rng.ts'

/**
 * A brand-new drift from nothing but a seed name: the dials, who is in the
 * room, their character, and a song that goes somewhere.
 *
 * Everything derives from the name, so a drift worth keeping can be had back by
 * typing its name into the seed field and generating — the same way the seed
 * already brings back the notes.
 */
export interface GeneratedDrift {
  readonly macros: Macros
  readonly slots: SlotDesc[]
  readonly song: Song
}

export function generateDrift(seedName: string): GeneratedDrift {
  const seed = deriveSeed(seedName)
  const macros = dialsFor(rngAt(seed, 'generate', 'dials'))
  return {
    macros,
    slots: rackFor(macros, seed),
    song: songFor(macros, rngAt(seed, 'generate', 'song')),
  }
}

/**
 * The dials start from one of the scenes and wander off it.
 *
 * Uniform noise across all six would land in the corners as often as anywhere,
 * and most of the corners are not music anyone would choose — full pulse with
 * no density, full space with full dust. The scenes are positions someone
 * picked by ear; starting near one keeps a new drift in the part of the space
 * that is known to sound like something, and the offset keeps it from being
 * that scene again.
 */
function dialsFor(rng: Rng): Macros {
  const scene = pick(rng, SCENES)
  const out: Macros = { ...scene.macros }
  for (const key of MACRO_KEYS) {
    out[key] = clamp01(scene.macros[key] + centred(rng, 0.22))
  }
  return out
}

interface Candidate {
  readonly defId: string
  /** 0..1, how likely it is to be in the room at these dials. */
  readonly chance: number
}

/**
 * Who is in the room.
 *
 * The pad and the bed are always there — something has to hold the harmony
 * and something has to be the room. Everyone else is a weighted coin, weighted
 * by the dials they belong to, so a dusty, warm setting tends to get dust and a
 * sub, a bright one bells, and only a setting with real pulse ever gets a kit.
 */
/** The instruments that play a line, rather than holding or colouring one. */
const VOICES: readonly string[] = ['rhodes', 'strings', 'shimmer', 'glass']

/**
 * The struck voices, whose notes are discrete events rather than a held sound.
 * Following the dials completely, they play as busily as the whole piece is
 * dense, which on a struck note reads as chatter. They lean sparse and still,
 * and only half follow, so a dense setting fills them out without filling
 * every step.
 */
const SPARSE: readonly string[] = ['rhodes', 'glass', 'arp']
const SPARSE_FOLLOW = 0.5

/**
 * The held, spacious voices: they lean on space and shy away from a beat,
 * since a drone under a groove is a different genre.
 */
function soundscapeCandidates(macros: Macros): Candidate[] {
  return [
    { defId: 'drone', chance: (0.05 + macros.space * 0.3 + macros.warmth * 0.2) * (1 - macros.pulse * 0.6) },
    { defId: 'choir', chance: 0.05 + macros.space * 0.35 + macros.drift * 0.1 },
    { defId: 'field', chance: (0.1 + macros.space * 0.3) * (1 - macros.pulse * 0.5) },
  ]
}

/**
 * The occasional voices: an arp that plays a run now and then, and cymbals
 * that build into the top of a phrase. Both lean on pulse; the arp backs off
 * as the piece drifts, and the cymbals' swells suit an open room.
 */
function gestureCandidates(macros: Macros): Candidate[] {
  return [
    { defId: 'arp', chance: (0.1 + macros.pulse * 0.35 + macros.density * 0.2) * (1 - macros.drift * 0.4) },
    { defId: 'cymbals', chance: 0.05 + macros.space * 0.25 + macros.pulse * 0.2 },
  ]
}

function rackFor(macros: Macros, seed: number): SlotDesc[] {
  const rng = rngAt(seed, 'generate', 'rack')
  const candidates: Candidate[] = [
    { defId: 'strings', chance: 0.25 + macros.space * 0.25 + macros.drift * 0.2 },
    { defId: 'shimmer', chance: 0.1 + macros.space * 0.45 + macros.colour * 0.15 },
    { defId: 'sub', chance: 0.2 + macros.warmth * 0.45 },
    { defId: 'rhodes', chance: 0.15 + macros.density * 0.5 },
    { defId: 'glass', chance: 0.05 + macros.colour * 0.5 },
    { defId: 'dust', chance: 0.1 + macros.warmth * 0.55 },
    // A beat only where the dials asked for one.
    { defId: 'kit', chance: macros.pulse < 0.4 ? 0 : (macros.pulse - 0.4) * 1.6 },
  ]

  const chosen = ['pad', 'bed']
  for (const c of candidates) {
    if (rng() < clamp01(c.chance)) chosen.push(c.defId)
  }
  // Pad, bed, sub and dust are harmony, room, floor and surface: all of it
  // can be in the room and still nothing plays a line. Without a voice that
  // does, it is a drone rather than a drift, so one is always there.
  if (!chosen.some((defId) => VOICES.includes(defId))) {
    const weights = VOICES.map((defId) => candidates.find((c) => c.defId === defId)?.chance ?? 0)
    chosen.push(VOICES[pickWeighted(rng, weights)])
  }
  // Later arrivals each toss their own coin rather than drawing from the
  // shared sequence, so a seed name kept from before they existed still gets
  // exactly the room it always did, plus at most a newcomer.
  for (const c of [...soundscapeCandidates(macros), ...gestureCandidates(macros)]) {
    if (rngAt(seed, 'generate', 'rack', c.defId)() < clamp01(c.chance)) chosen.push(c.defId)
  }

  return chosen.map((defId, index) => {
    const slotRng = rngAt(seed, 'generate', 'slot', defId)
    const sparse = SPARSE.includes(defId)
    const character = characterFor(slotRng)
    if (sparse) {
      character.density = range(slotRng, 0.05, 0.2)
      character.motion = range(slotRng, 0.1, 0.25)
    }
    return {
      id: `${defId}-${index}`,
      defId,
      name: instrumentById(defId)?.name ?? defId,
      level: clamp01(0.8 + centred(slotRng, 0.12)),
      muted: false,
      soloed: false,
      expression: character,
      // Following the dials completely, as a new slot does, so the six dials
      // still play the whole piece — except the struck voices, above.
      follow: sparse ? SPARSE_FOLLOW : 1,
      lanes: [breathFor(defId, slotRng, sparse)],
      knobs: {},
    }
  })
}

/** Each instrument leans a little away from neutral, so two drifts with the
 *  same lineup still differ in more than their notes. */
function characterFor(rng: Rng): Expression {
  const out: Expression = { ...NEUTRAL }
  for (const key of EXPRESSION_KEYS) {
    out[key] = clamp01(NEUTRAL[key] + centred(rng, 0.25))
  }
  return out
}

/**
 * A slow, never-repeating walk on each instrument's motion — the same small
 * life the mood version gives every voice, which is most of what stops a long
 * drift from sounding like a loop.
 *
 * On a sparse voice it scales rather than adds: the walk can only settle it
 * below where the dials put it, never push it into more notes.
 */
function breathFor(defId: string, rng: Rng, sparse: boolean): Lane {
  const lane = makeLane(`${defId}-breath`, { kind: 'expression', key: 'motion' })
  return {
    ...lane,
    source: { kind: 'walk', smoothness: range(rng, 0.8, 0.92), seed: Math.floor(rng() * 0xffffffff) },
    mode: sparse ? 'scale' : 'add',
    depth: range(rng, 0.12, 0.28),
    bars: pick(rng, [16, 24, 32]),
  }
}

/**
 * The dials a song may move. All six: Warmth's arc darkens and loosens the
 * tape over the piece, a natural lo-fi move. It never changes the key, though
 * it does nudge the tuning reference by a few cents along the way.
 */
const ARC_KEYS: readonly MacroKey[] = ['density', 'drift', 'colour', 'space', 'pulse', 'warmth']

/**
 * A song with an arc: two or three dials rise (or fall) toward a point past the
 * middle and come most of the way back, so the piece goes somewhere and returns
 * rather than sitting still for its whole length. Harmony is left to the dials,
 * which the arc is already moving.
 */
function songFor(macros: Macros, rng: Rng): Song {
  const lengthBars = pick(rng, [64, 96, 128, 160])
  const peakBar = Math.round(lengthBars * range(rng, 0.45, 0.65))
  const count = 2 + Math.floor(rng() * 2)

  const keys = [...ARC_KEYS]
  const tracks: Partial<Record<MacroKey, MacroTrack>> = {}
  for (let i = 0; i < count; i++) {
    const key = keys.splice(Math.floor(rng() * keys.length), 1)[0]
    const start = macros[key]
    // Head for whichever end has more room, so the move is always audible.
    const toward = start < 0.5 ? 1 : 0
    const peak = clamp01(lerp(start, toward, range(rng, 0.3, 0.55)))
    const end = clamp01(lerp(start, peak, range(rng, 0, 0.3)))
    const points: Breakpoint[] = [
      { bar: 0, value: start, shape: 'smooth' },
      { bar: peakBar, value: peak, shape: 'smooth' },
      { bar: lengthBars, value: end, shape: 'smooth' },
    ]
    tracks[key] = { enabled: true, envelope: { points } }
  }

  return { lengthBars, end: 'hold', macros: tracks, harmony: [], tuning: null }
}
