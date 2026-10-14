import type { InstrumentDef, InstrumentVoice, PatternContext, PercussionEvent, FixedParam } from './types.ts'
import type { NoteIntent } from '../harmony/resolver.ts'
import { beatStrength } from '../harmony/resolver.ts'
import { Keys } from '../voices/keys.ts'
import { Pad } from '../voices/pad.ts'
import { Bass } from '../voices/bass.ts'
import { Drums } from '../voices/drums.ts'
import { Vinyl } from '../voices/vinyl.ts'
import { Texture, TEXTURE_KINDS } from '../voices/texture.ts'
import { Strings } from '../voices/strings.ts'
import { Shimmer } from '../voices/shimmer.ts'
import { Drone } from '../voices/drone.ts'
import { Choir } from '../voices/choir.ts'
import { Field, FIELD_KINDS } from '../voices/field.ts'
import { Pluck } from '../voices/pluck.ts'
import { Cymbals } from '../voices/cymbals.ts'
import { drumPattern } from '../compose/drumPattern.ts'
import { DRUM_STYLES, FILL_EVERY } from '../compose/drumStyles.ts'
import { lerp, clamp01 } from '../core/curves.ts'
import { tri } from '../fuzzy/membership.ts'

/*
 * The rule bases below are the design documents for these instruments. Each
 * reads as a sentence — IF motion IS high THEN tremoloHz IS high — and because
 * the fuzzy sets overlap, two half-firing rules blend rather than fight. Adding
 * an instrument means writing sentences, not tuning a hundred interpolations.
 */

const isVoiceWith = <K extends string>(v: InstrumentVoice, key: K): boolean =>
  typeof (v as unknown as Record<string, unknown>)[key] === 'function'

/** Fractional beats → seconds, used when an instrument sets a note length. */
const stepsToSeconds = (steps: number, tempo: number): number => (steps / 4) * (60 / tempo)

// ─── Rhodes ────────────────────────────────────────────────────────────────
const rhodes: InstrumentDef = {
  id: 'rhodes',
  name: 'Rhodes',
  role: 'melodic',
  blurb: 'FM electric piano. The voice most lo-fi is built around.',
  create: (sr, rng) => new Keys(sr, rng),
  rules: {
    outputs: {
      bite: { min: 0.05, max: 0.9 },
      decay: { min: 1.1, max: 7, scale: 'exp' },
      release: { min: 0.5, max: 3.4, scale: 'exp' },
      tone: { min: 1400, max: 7000, scale: 'exp' },
      tremolo: { min: 0, max: 0.36 },
      tremoloHz: { min: 2.6, max: 7, scale: 'exp' },
      spread: { min: 0.2, max: 0.9 },
      // Notes wanted per bar; under a half rounds to none, so the bottom of
      // the dial is a silent bar rather than one note every bar.
      rate: { min: 0, max: 5 },
      // The chance each of those notes is dropped.
      rest: { min: 0.05, max: 0.85 },
    },
    rules: [
      { when: { brightness: 'high' }, then: { tone: 'high', bite: 'high' } },
      { when: { brightness: 'mid' }, then: { tone: 'mid', bite: 'mid' } },
      { when: { brightness: 'low' }, then: { tone: 'low', bite: 'low' } },
      // Heavy playing hits harder and rings longer; light playing is brief.
      { when: { weight: 'high' }, then: { decay: 'high', bite: 'mid' } },
      { when: { weight: 'low' }, then: { decay: 'low', release: 'low' } },
      { when: { motion: 'high' }, then: { tremoloHz: 'high', tremolo: 'high', rate: 'high' } },
      { when: { motion: 'low' }, then: { tremolo: 'low', rate: 'low', release: 'high' } },
      { when: { tension: 'high' }, then: { bite: 'high', spread: 'low' } },
      { when: { tension: 'low' }, then: { spread: 'high' } },
      { when: { density: 'high' }, then: { rate: 'high', rest: 'low', decay: 'low' } },
      { when: { density: 'mid' }, then: { rate: 'mid', rest: 'mid' } },
      { when: { density: 'low' }, then: { rate: 'low', rest: 'high', decay: 'high' } },
      // Sparse and still together means long, hanging notes — the two dials
      // reinforcing each other rather than averaging out.
      { when: { density: 'low', motion: 'low' }, then: { release: 'high', decay: 'high' }, weight: 1.4 },
    ],
  },
  apply: (voice, p, level) => {
    if (voice instanceof Keys) {
      voice.set({
        bite: p.bite, decay: p.decay, release: p.release, tone: p.tone,
        tremolo: p.tremolo, tremoloHz: p.tremoloHz, spread: p.spread, level: level * 0.45,
      })
    }
  },
  notes: (ctx) => intentsFor(ctx, 'melodic'),
  controls: [
    { param: 'tone', label: 'Tone', group: 'sound' },
    { param: 'bite', label: 'Bite', group: 'sound' },
    { param: 'decay', label: 'Decay', group: 'sound' },
    { param: 'release', label: 'Release', group: 'sound' },
    { param: 'tremolo', label: 'Tremolo', group: 'sound' },
    { param: 'tremoloHz', label: 'Trem rate', group: 'sound' },
    { param: 'spread', label: 'Width', group: 'sound' },
    { param: 'rate', label: 'Notes', group: 'playing' },
    { param: 'rest', label: 'Rests', group: 'playing' },
  ],
}

// ─── Pad ───────────────────────────────────────────────────────────────────
const padInstrument: InstrumentDef = {
  id: 'pad',
  name: 'Pad',
  role: 'chordal',
  blurb: 'Detuned ensemble that holds the harmony underneath everything.',
  create: (sr, rng) => new Pad(sr, rng),
  rules: {
    outputs: {
      attack: { min: 0.35, max: 5.5, scale: 'exp' },
      release: { min: 1.4, max: 8, scale: 'exp' },
      cutoff: { min: 320, max: 2600, scale: 'exp' },
      resonance: { min: 0.05, max: 0.4 },
      detune: { min: 0.12, max: 0.85 },
      shape: { min: 0.1, max: 0.85 },
      motion: { min: 0.1, max: 0.95 },
      motionHz: { min: 0.02, max: 0.34, scale: 'exp' },
      spread: { min: 0.4, max: 1 },
      width: { min: 0.1, max: 1 },
      evolve: { min: 0, max: 0.9 },
      voices: { min: 3, max: 6 },
    },
    rules: [
      { when: { brightness: 'high' }, then: { cutoff: 'high', shape: 'high' } },
      { when: { brightness: 'mid' }, then: { cutoff: 'mid', shape: 'mid' } },
      { when: { brightness: 'low' }, then: { cutoff: 'low', shape: 'low' } },
      { when: { weight: 'high' }, then: { cutoff: 'low', release: 'high', width: 'mid' } },
      { when: { weight: 'low' }, then: { attack: 'high', spread: 'high', width: 'high' } },
      { when: { motion: 'high' }, then: { motion: 'high', motionHz: 'high', detune: 'high', evolve: 'high' } },
      { when: { motion: 'mid' }, then: { evolve: 'mid' } },
      { when: { motion: 'low' }, then: { motion: 'low', motionHz: 'low', attack: 'high', evolve: 'low' } },
      { when: { tension: 'high' }, then: { resonance: 'high', detune: 'high', width: 'low' } },
      { when: { tension: 'low' }, then: { resonance: 'low', attack: 'high' } },
      { when: { density: 'high' }, then: { detune: 'high', spread: 'high', voices: 'high', width: 'high' } },
      { when: { density: 'mid' }, then: { voices: 'mid', width: 'mid' } },
      { when: { density: 'low' }, then: { detune: 'low', voices: 'low', width: 'low' } },
    ],
  },
  fixed: {
    /** Semitones up or down from where a chordal part normally sits. */
    register: { min: -12, max: 12, default: 0.5 },
    /** How far apart the chord's notes are spread, as a multiple of the usual span. */
    voicingSpread: { min: 0.3, max: 1.6, default: 0.54 },
  },
  register: (p, base) => ({
    centre: base.centre + Math.round(p.register ?? 0),
    span: base.span * (p.voicingSpread ?? 1),
  }),
  apply: (voice, p, level) => {
    if (voice instanceof Pad) {
      voice.set({
        attack: p.attack, release: p.release, cutoff: p.cutoff, resonance: p.resonance,
        detune: p.detune, shape: p.shape, motion: p.motion, motionHz: p.motionHz,
        spread: p.spread, width: p.width, evolve: p.evolve, level: level * 0.3,
      })
    }
  },
  controls: [
    { param: 'attack', label: 'Attack', group: 'shape' },
    { param: 'release', label: 'Release', group: 'shape' },
    { param: 'cutoff', label: 'Cutoff', group: 'shape' },
    { param: 'resonance', label: 'Resonance', group: 'shape' },
    { param: 'detune', label: 'Detune', group: 'shape' },
    { param: 'shape', label: 'Saw', group: 'shape' },
    { param: 'width', label: 'Width', group: 'shape' },
    { param: 'evolve', label: 'Evolve', group: 'shape' },
    { param: 'motion', label: 'Wander', group: 'shape' },
    { param: 'motionHz', label: 'Wander rate', group: 'shape' },
    { param: 'voices', label: 'Voices', group: 'voicing' },
    { param: 'voicingSpread', label: 'Spread', group: 'voicing' },
    { param: 'register', label: 'Register', group: 'voicing' },
    { param: 'spread', label: 'Pan', group: 'voicing' },
  ],
  notes: (ctx) => {
    // The pad restates the chord rather than playing a line: one intent per
    // voice of the chord, splayed so the entry breathes instead of striking.
    const voices = Math.round(ctx.params.voices ?? 3 + clamp01(ctx.expression.density) * 2)
    const out: NoteIntent[] = []
    for (let i = 0; i < voices; i++) {
      out.push({
        role: 'chordal',
        contour: -0.7 + (i / Math.max(1, voices - 1)) * 1.5,
        weight: lerp(0.5, 0.85, ctx.rng()),
        step: 0,
        lengthSteps: 16 * 1.05,
      })
    }
    return out
  },
}

// ─── Sub ───────────────────────────────────────────────────────────────────
const sub: InstrumentDef = {
  id: 'sub',
  name: 'Sub',
  role: 'bass',
  blurb: 'Mono low end. Centred, so it survives a phone speaker.',
  create: (sr) => new Bass(sr),
  rules: {
    outputs: {
      decay: { min: 0.8, max: 3.6, scale: 'exp' },
      release: { min: 0.25, max: 1.6, scale: 'exp' },
      cutoff: { min: 140, max: 520, scale: 'exp' },
      harmonics: { min: 0.05, max: 0.65 },
      drive: { min: 1, max: 2.4 },
      activity: { min: 0.25, max: 0.95 },
    },
    rules: [
      { when: { weight: 'high' }, then: { drive: 'high', decay: 'high', harmonics: 'high' } },
      { when: { weight: 'low' }, then: { decay: 'low', cutoff: 'low', harmonics: 'low' } },
      { when: { brightness: 'high' }, then: { cutoff: 'high', harmonics: 'high' } },
      { when: { brightness: 'low' }, then: { cutoff: 'low' } },
      { when: { motion: 'high' }, then: { activity: 'high', decay: 'low' } },
      { when: { motion: 'low' }, then: { activity: 'low', decay: 'high', release: 'high' } },
      { when: { density: 'high' }, then: { activity: 'high' } },
      { when: { density: 'low' }, then: { activity: 'low' } },
      { when: { tension: 'high' }, then: { drive: 'high' } },
    ],
  },
  apply: (voice, p, level) => {
    if (voice instanceof Bass) {
      voice.set({
        decay: p.decay, release: p.release, cutoff: p.cutoff,
        harmonics: p.harmonics, drive: p.drive, level: level * 0.18,
      })
    }
  },
  controls: [
    { param: 'cutoff', label: 'Cutoff', group: 'sound' },
    { param: 'harmonics', label: 'Harmonics', group: 'sound' },
    { param: 'drive', label: 'Drive', group: 'sound' },
    { param: 'decay', label: 'Decay', group: 'sound' },
    { param: 'release', label: 'Release', group: 'sound' },
    { param: 'activity', label: 'Movement', group: 'playing' },
  ],
  notes: (ctx) => {
    const out: NoteIntent[] = []
    const activity = ctx.params.activity ?? 0.5
    // A sub is a floor, not a line: one root held across the bar. Only real
    // movement earns a second note, and it keeps the downbeat's contour — two
    // contours either side of the root resolve to the same pitch an octave
    // apart, and the portamento turns that into a slide every bar.
    const second = ctx.rng() < clamp01((activity - 0.55) * 1.5)
    out.push({ role: 'bass', contour: -0.4, weight: lerp(0.75, 1, ctx.rng()), step: 0, lengthSteps: second ? 8 : 16 })
    if (second) {
      out.push({ role: 'bass', contour: -0.4, weight: lerp(0.45, 0.65, ctx.rng()), step: 8, lengthSteps: 8 })
    }
    return out
  },
}

// ─── Kit ───────────────────────────────────────────────────────────────────
/** A pan, stored 0..1 across the field; 0.5 is the centre. */
const pan = (at: number): FixedParam => ({ min: -1, max: 1, default: (at + 1) / 2 })

const kit: InstrumentDef = {
  id: 'kit',
  name: 'Kit',
  role: 'melodic',
  blurb: 'Synthesised drums, soft and filtered. Every piece and the groove are yours to set.',
  create: (sr, rng) => new Drums(sr, rng),
  rules: {
    outputs: {
      tone: { min: 0.2, max: 0.9 },
      kickPitch: { min: 40, max: 75, scale: 'exp' },
      kickDecay: { min: 0.16, max: 0.7, scale: 'exp' },
      kickPunch: { min: 0.2, max: 1 },
      kickLevel: { min: 0.7, max: 1.1 },
      snareBody: { min: 0.15, max: 0.7 },
      snareDecay: { min: 0.09, max: 0.3, scale: 'exp' },
      snareLevel: { min: 0.3, max: 0.8 },
      hatDecay: { min: 0.022, max: 0.07, scale: 'exp' },
      hatLevel: { min: 0.15, max: 0.7 },
      busy: { min: 0.1, max: 0.95 },
    },
    rules: [
      { when: { brightness: 'high' }, then: { tone: 'high', hatLevel: 'high' } },
      { when: { brightness: 'mid' }, then: { tone: 'mid', hatLevel: 'mid' } },
      { when: { brightness: 'low' }, then: { tone: 'low', hatLevel: 'low' } },
      { when: { weight: 'high' }, then: { kickDecay: 'high', kickPitch: 'low', kickPunch: 'high', kickLevel: 'high', snareBody: 'high' } },
      { when: { weight: 'mid' }, then: { kickDecay: 'mid', kickPitch: 'mid', kickPunch: 'mid', snareBody: 'mid' } },
      { when: { weight: 'low' }, then: { kickDecay: 'low', kickPitch: 'high', kickLevel: 'low', snareDecay: 'low' } },
      { when: { density: 'high' }, then: { busy: 'high' } },
      { when: { density: 'mid' }, then: { busy: 'mid' } },
      { when: { density: 'low' }, then: { busy: 'low', hatLevel: 'low' } },
      { when: { motion: 'high' }, then: { busy: 'high', hatDecay: 'low' } },
      { when: { motion: 'low' }, then: { busy: 'low', hatDecay: 'high' } },
      { when: { tension: 'high' }, then: { snareLevel: 'high', tone: 'high', snareDecay: 'low' } },
      { when: { tension: 'mid' }, then: { snareLevel: 'mid', snareDecay: 'mid' } },
      { when: { tension: 'low' }, then: { snareLevel: 'low', snareDecay: 'high' } },
    ],
  },
  fixed: {
    kickPan: pan(0),
    snarePitch: { min: 140, max: 260, scale: 'exp', default: 0.424 },
    snarePan: pan(0),
    rimPitch: { min: 280, max: 640, scale: 'exp', default: 0.461 },
    rimDecay: { min: 0.02, max: 0.12, scale: 'exp', default: 0.414 },
    rimLevel: { min: 0, max: 1.2, default: 0.4 },
    rimPan: pan(0),
    hatPitch: { min: 0.6, max: 1.6, scale: 'exp', default: 0.52 },
    hatPan: pan(0.12),
    openHatDecay: { min: 0.12, max: 0.9, scale: 'exp', default: 0.42 },
    openHatLevel: { min: 0, max: 1, default: 0.45 },
    openHatPan: pan(-0.2),
    style: { min: 0, max: DRUM_STYLES.length - 0.01, default: 0.5 / DRUM_STYLES.length },
    fill: { min: 0, max: 1, default: 0.4 },
    fillEvery: { min: 0, max: FILL_EVERY.length - 0.01, default: 2.5 / FILL_EVERY.length },
    ghost: { min: 0, max: 1, default: 0.3 },
    openHats: { min: 0, max: 1, default: 0.3 },
    variation: { min: 0, max: 1, default: 0.3 },
  },
  apply: (voice, p, level) => {
    if (voice instanceof Drums) {
      voice.set({
        tone: p.tone, level: level * 0.55,
        kickPitch: p.kickPitch, kickDecay: p.kickDecay, kickPunch: p.kickPunch,
        kickLevel: p.kickLevel, kickPan: p.kickPan,
        snarePitch: p.snarePitch, snareDecay: p.snareDecay, snareBody: p.snareBody,
        snareLevel: p.snareLevel, snarePan: p.snarePan,
        rimPitch: p.rimPitch, rimDecay: p.rimDecay, rimLevel: p.rimLevel, rimPan: p.rimPan,
        hatPitch: p.hatPitch, hatDecay: p.hatDecay, hatLevel: p.hatLevel, hatPan: p.hatPan,
        openHatDecay: p.openHatDecay, openHatLevel: p.openHatLevel, openHatPan: p.openHatPan,
      })
    }
  },
  hits: drumPattern,
  controls: [
    { param: 'style', label: 'Style', group: 'pattern', options: DRUM_STYLES.map((s) => s.name) },
    { param: 'fillEvery', label: 'Fill every', group: 'pattern', options: FILL_EVERY.map((n) => `${n} bars`) },
    { param: 'busy', label: 'Busy', group: 'pattern' },
    { param: 'variation', label: 'Variation', group: 'pattern' },
    { param: 'ghost', label: 'Ghosts', group: 'pattern' },
    { param: 'openHats', label: 'Open hats', group: 'pattern' },
    { param: 'fill', label: 'Fills', group: 'pattern' },
    { param: 'tone', label: 'Tone', group: 'pattern' },
    { param: 'kickPitch', label: 'Pitch', group: 'kick' },
    { param: 'kickDecay', label: 'Decay', group: 'kick' },
    { param: 'kickPunch', label: 'Punch', group: 'kick' },
    { param: 'kickLevel', label: 'Level', group: 'kick' },
    { param: 'kickPan', label: 'Pan', group: 'kick' },
    { param: 'snarePitch', label: 'Pitch', group: 'snare' },
    { param: 'snareDecay', label: 'Decay', group: 'snare' },
    { param: 'snareBody', label: 'Body', group: 'snare' },
    { param: 'snareLevel', label: 'Level', group: 'snare' },
    { param: 'snarePan', label: 'Pan', group: 'snare' },
    { param: 'rimPitch', label: 'Pitch', group: 'rim' },
    { param: 'rimDecay', label: 'Decay', group: 'rim' },
    { param: 'rimLevel', label: 'Level', group: 'rim' },
    { param: 'rimPan', label: 'Pan', group: 'rim' },
    { param: 'hatPitch', label: 'Pitch', group: 'hats' },
    { param: 'hatDecay', label: 'Closed', group: 'hats' },
    { param: 'openHatDecay', label: 'Open', group: 'hats' },
    { param: 'hatLevel', label: 'Level', group: 'hats' },
    { param: 'openHatLevel', label: 'Open lvl', group: 'hats' },
    { param: 'hatPan', label: 'Pan', group: 'hats' },
    { param: 'openHatPan', label: 'Open pan', group: 'hats' },
  ],
}

// ─── Cymbals ───────────────────────────────────────────────────────────────
const CYMBAL_EVERY = [4, 8, 16]
const CYMBAL_KINDS = ['Mixed', 'Swells', 'Rolls']

/**
 * Gestures that build into a phrase's downbeat. Each one is scheduled in the
 * bar it starts, `length` bars before the line it lands on, so whether bar N
 * starts a swell depends on N alone — which is what keeps it seekable.
 */
function cymbalGestures(ctx: PatternContext): PercussionEvent[] {
  const every = CYMBAL_EVERY[Math.floor(ctx.params.every ?? 0)] ?? 4
  const length = Math.max(1, Math.min(every, Math.round(ctx.params.length ?? 2)))
  const lands = ctx.bar + length
  if (lands % every !== 0) return []
  const rng = ctx.phraseRng('gesture', lands / every)
  if (rng() >= clamp01(ctx.params.chance ?? 0.6)) return []
  const kinds = CYMBAL_KINDS[Math.floor(ctx.params.kind ?? 0)]
  const roll = kinds === 'Rolls' || (kinds === 'Mixed' && rng() < clamp01(ctx.params.rollBias ?? 0.3))
  return [{
    step: 0,
    kind: roll ? 'roll' : 'swell',
    velocity: lerp(0.65, 0.9, rng()),
    lengthSteps: length * 16,
  }]
}

const cymbals: InstrumentDef = {
  id: 'cymbals',
  name: 'Cymbals',
  role: 'colour',
  blurb: 'Reversed swells and mallet rolls that build into the top of a phrase.',
  create: (sr, rng) => new Cymbals(sr, rng),
  rules: {
    outputs: {
      tone: { min: 2800, max: 10000, scale: 'exp' },
      metal: { min: 0.1, max: 0.8 },
      pitch: { min: 300, max: 650, scale: 'exp' },
      curve: { min: 1.2, max: 4 },
      tail: { min: 1, max: 5, scale: 'exp' },
      width: { min: 0.3, max: 1 },
      length: { min: 1, max: 4 },
      chance: { min: 0.25, max: 1 },
      rollBias: { min: 0, max: 0.8 },
    },
    rules: [
      { when: { brightness: 'high' }, then: { tone: 'high', metal: 'high' } },
      { when: { brightness: 'mid' }, then: { tone: 'mid', metal: 'mid' } },
      { when: { brightness: 'low' }, then: { tone: 'low', metal: 'low' } },
      // Weight is scale: a heavy piece builds longer and rings longer.
      { when: { weight: 'high' }, then: { length: 'high', tail: 'high' } },
      { when: { weight: 'mid' }, then: { length: 'mid', tail: 'mid' } },
      { when: { weight: 'low' }, then: { length: 'low', tail: 'low' } },
      { when: { density: 'high' }, then: { chance: 'high', rollBias: 'high', width: 'high' } },
      { when: { density: 'mid' }, then: { chance: 'mid', rollBias: 'mid', width: 'mid' } },
      { when: { density: 'low' }, then: { chance: 'low', rollBias: 'low', width: 'low' } },
      // Motion arrives sooner; stillness hangs back and rushes in at the end.
      { when: { motion: 'high' }, then: { curve: 'low' } },
      { when: { motion: 'mid' }, then: { curve: 'mid' } },
      { when: { motion: 'low' }, then: { curve: 'high' } },
      { when: { tension: 'high' }, then: { pitch: 'high', metal: 'high' } },
      { when: { tension: 'mid' }, then: { pitch: 'mid' } },
      { when: { tension: 'low' }, then: { pitch: 'low' } },
    ],
  },
  fixed: {
    every: { min: 0, max: CYMBAL_EVERY.length - 0.01, default: 0.5 / CYMBAL_EVERY.length },
    kind: { min: 0, max: CYMBAL_KINDS.length - 0.01, default: 0.5 / CYMBAL_KINDS.length },
  },
  apply: (voice, p, level) => {
    if (voice instanceof Cymbals) {
      voice.set({
        tone: p.tone, metal: p.metal, pitch: p.pitch, curve: p.curve,
        tail: p.tail, width: p.width, level: level * 0.4,
      })
    }
  },
  hits: cymbalGestures,
  controls: [
    { param: 'kind', label: 'Kind', group: 'pattern', options: CYMBAL_KINDS },
    { param: 'every', label: 'Every', group: 'pattern', options: CYMBAL_EVERY.map((n) => `${n} bars`) },
    { param: 'length', label: 'Length', group: 'pattern' },
    { param: 'chance', label: 'Chance', group: 'pattern' },
    { param: 'rollBias', label: 'Rolls', group: 'pattern' },
    { param: 'curve', label: 'Curve', group: 'shape' },
    { param: 'tail', label: 'Tail', group: 'shape' },
    { param: 'tone', label: 'Tone', group: 'sound' },
    { param: 'metal', label: 'Metal', group: 'sound' },
    { param: 'pitch', label: 'Pitch', group: 'sound' },
    { param: 'width', label: 'Width', group: 'sound' },
  ],
}

// ─── Dust ──────────────────────────────────────────────────────────────────
const dust: InstrumentDef = {
  id: 'dust',
  name: 'Dust',
  role: 'colour',
  blurb: 'Record surface: crackle, hiss and hum. Sits outside the room.',
  create: (sr, rng) => new Vinyl(sr, rng),
  continuous: true,
  unducked: true,
  rules: {
    outputs: {
      crackle: { min: 0, max: 0.9 },
      hiss: { min: 0, max: 0.45 },
      hum: { min: 0, max: 0.35 },
    },
    rules: [
      { when: { weight: 'high' }, then: { crackle: 'high', hum: 'high' } },
      { when: { weight: 'low' }, then: { crackle: 'low', hum: 'low' } },
      { when: { brightness: 'high' }, then: { hiss: 'high', crackle: 'low' } },
      { when: { brightness: 'low' }, then: { hiss: 'low' } },
      { when: { density: 'high' }, then: { crackle: 'high' } },
      { when: { tension: 'high' }, then: { hum: 'high' } },
    ],
  },
  apply: (voice, p, level) => {
    if (voice instanceof Vinyl) {
      voice.set({
        crackle: p.crackle, hiss: p.hiss, hum: p.hum,
        humHz: p.mains >= 1 ? 60 : 50, level: level * 0.3,
      })
    }
  },
  fixed: {
    mains: { min: 0, max: 1.99, default: 0.25 },
  },
  controls: [
    { param: 'crackle', label: 'Crackle' },
    { param: 'hiss', label: 'Hiss' },
    { param: 'hum', label: 'Hum' },
    { param: 'mains', label: 'Mains', options: ['50 Hz', '60 Hz'] },
  ],
}

// ─── Bed ───────────────────────────────────────────────────────────────────
const bed: InstrumentDef = {
  id: 'bed',
  name: 'Bed',
  role: 'colour',
  blurb: 'Ocean, air, wind or rain. Fills the room sparse music leaves empty.',
  create: (sr, rng) => new Texture(sr, rng),
  continuous: true,
  rules: {
    outputs: {
      tone: { min: 0.12, max: 0.92 },
      motion: { min: 0.1, max: 0.95 },
      // Terms centred on ocean, air and rain, so the rules pick a kind cleanly
      // and wind is what a blend of air and rain lands on.
      kind: {
        min: 0,
        max: TEXTURE_KINDS.length - 0.01,
        terms: { low: tri(0, 0.125, 0.25), mid: tri(0.25, 0.375, 0.5), high: tri(0.75, 0.875, 1) },
      },
    },
    rules: [
      { when: { brightness: 'high' }, then: { tone: 'high', kind: 'high' } },
      { when: { brightness: 'mid' }, then: { tone: 'mid', kind: 'mid' } },
      { when: { brightness: 'low' }, then: { tone: 'low', kind: 'low' } },
      { when: { motion: 'high' }, then: { motion: 'high' } },
      { when: { motion: 'low' }, then: { motion: 'low' } },
      { when: { weight: 'high' }, then: { kind: 'low', tone: 'low' } },
    ],
  },
  apply: (voice, p, level) => {
    if (voice instanceof Texture) {
      voice.set({
        kind: TEXTURE_KINDS[Math.min(TEXTURE_KINDS.length - 1, Math.max(0, Math.floor(p.kind)))],
        tone: p.tone, motion: p.motion, level: level * 0.16,
      })
    }
  },
  controls: [
    { param: 'kind', label: 'Kind', options: TEXTURE_KINDS },
    { param: 'tone', label: 'Tone' },
    { param: 'motion', label: 'Swell' },
  ],
}

// ─── Glass ─────────────────────────────────────────────────────────────────
/**
 * A second pitched instrument built entirely from the pieces above, to show
 * what adding one costs: a different register, a different rule base, and a
 * sparser pattern. No new DSP at all — the Rhodes engine at extreme settings
 * is a bell, which is what FM has always been good for.
 */
const glass: InstrumentDef = {
  id: 'glass',
  name: 'Glass',
  role: 'colour',
  blurb: 'High struck bells. Sparse by nature; sits above everything.',
  create: (sr, rng) => new Keys(sr, rng, 8),
  rules: {
    outputs: {
      bite: { min: 0.45, max: 1 },
      decay: { min: 2.5, max: 9, scale: 'exp' },
      release: { min: 1.5, max: 5, scale: 'exp' },
      tone: { min: 2600, max: 9000, scale: 'exp' },
      tremolo: { min: 0, max: 0.18 },
      tremoloHz: { min: 1.6, max: 4.2, scale: 'exp' },
      spread: { min: 0.5, max: 1 },
      chance: { min: 0.06, max: 0.7 },
    },
    rules: [
      { when: { brightness: 'high' }, then: { tone: 'high', bite: 'high' } },
      { when: { brightness: 'low' }, then: { tone: 'low', bite: 'low' } },
      { when: { density: 'high' }, then: { chance: 'high' } },
      { when: { density: 'low' }, then: { chance: 'low', decay: 'high' } },
      { when: { motion: 'high' }, then: { chance: 'high', decay: 'low' } },
      { when: { motion: 'low' }, then: { decay: 'high', release: 'high' } },
      { when: { weight: 'low' }, then: { spread: 'high', decay: 'high' } },
      { when: { tension: 'high' }, then: { bite: 'high' } },
    ],
  },
  apply: (voice, p, level) => {
    if (voice instanceof Keys) {
      voice.set({
        bite: p.bite, decay: p.decay, release: p.release, tone: p.tone,
        tremolo: p.tremolo, tremoloHz: p.tremoloHz, spread: p.spread, level: level * 0.22,
      })
    }
  },
  controls: [
    { param: 'tone', label: 'Tone', group: 'sound' },
    { param: 'bite', label: 'Strike', group: 'sound' },
    { param: 'decay', label: 'Decay', group: 'sound' },
    { param: 'release', label: 'Release', group: 'sound' },
    { param: 'tremolo', label: 'Shimmer', group: 'sound' },
    { param: 'spread', label: 'Width', group: 'sound' },
    { param: 'chance', label: 'Chance', group: 'playing' },
  ],
  notes: (ctx) => {
    // Bells are an event, not a part. A handful of chances per bar, weighted
    // to the spaces between the strong beats.
    const chance = clamp01(ctx.params.chance ?? 0.2)
    const out: NoteIntent[] = []
    for (const step of [2, 6, 7, 10, 14, 15]) {
      if (ctx.rng() < chance * 0.5) {
        out.push({
          role: 'colour',
          contour: -0.2 + ctx.rng() * 1.2,
          weight: lerp(0.25, 0.6, ctx.rng()),
          step,
          lengthSteps: 8 + ctx.rng() * 12,
        })
      }
    }
    return out
  },
}

// ─── Arp ───────────────────────────────────────────────────────────────────
const ARP_DIRECTIONS = ['Up', 'Down', 'Up-down', 'Random']
const ARP_RATES = ['Quarters', 'Eighths', 'Sixteenths']
const ARP_STRIDES = [4, 2, 1]
const ARP_EVERY = [1, 2, 4, 8]

/** Where step `k` of the arp sits among `n` rising slots, for each direction. */
function arpSlot(direction: number, k: number, n: number, shuffle: readonly number[]): number {
  switch (ARP_DIRECTIONS[direction]) {
    case 'Down':
      return n - 1 - (k % n)
    case 'Up-down': {
      // A ping-pong that does not repeat its ends: 0 1 2 3 2 1 0 1 …
      const cycle = Math.max(1, 2 * n - 2)
      const i = k % cycle
      return i < n ? i : cycle - i
    }
    case 'Random':
      return shuffle[k % n]
    default:
      return k % n
  }
}

const arp: InstrumentDef = {
  id: 'arp',
  name: 'Arp',
  role: 'chordal',
  blurb: 'A plucked synth that now and then runs up or down the chord, then leaves space.',
  create: (sr, rng) => new Pluck(sr, rng),
  rules: {
    outputs: {
      cutoff: { min: 350, max: 2800, scale: 'exp' },
      envAmt: { min: 1, max: 9, scale: 'exp' },
      decay: { min: 0.12, max: 0.9, scale: 'exp' },
      shape: { min: 0, max: 1 },
      resonance: { min: 0.6, max: 2.6, scale: 'exp' },
      spread: { min: 0.1, max: 0.8 },
      rest: { min: 0, max: 0.5 },
      rate: { min: 0, max: ARP_RATES.length - 0.01 },
      chance: { min: 0.1, max: 0.9 },
      length: { min: 0.2, max: 0.9 },
      wander: { min: 0, max: 0.8 },
    },
    rules: [
      { when: { brightness: 'high' }, then: { cutoff: 'high', envAmt: 'high' } },
      { when: { brightness: 'mid' }, then: { cutoff: 'mid', envAmt: 'mid' } },
      { when: { brightness: 'low' }, then: { cutoff: 'low', envAmt: 'low' } },
      // Weight is body: a heavy arp rings longer and leans to the square.
      { when: { weight: 'high' }, then: { decay: 'high', shape: 'high' } },
      { when: { weight: 'mid' }, then: { decay: 'mid', shape: 'mid' } },
      { when: { weight: 'low' }, then: { decay: 'low', shape: 'low' } },
      { when: { motion: 'high' }, then: { rate: 'high', decay: 'low' } },
      { when: { motion: 'mid' }, then: { rate: 'mid' } },
      { when: { motion: 'low' }, then: { rate: 'low', decay: 'high' } },
      // Density is how much of the time the arp is playing at all: a sparse
      // piece hears an occasional short run, a dense one longer and more often.
      { when: { density: 'high' }, then: { chance: 'high', length: 'high', rest: 'low', spread: 'high' } },
      { when: { density: 'mid' }, then: { chance: 'mid', length: 'mid', rest: 'mid', spread: 'mid' } },
      { when: { density: 'low' }, then: { chance: 'low', length: 'low', rest: 'high', spread: 'low' } },
      // Tension unsettles the walk: runs start anywhere and turn back.
      { when: { tension: 'high' }, then: { resonance: 'high', envAmt: 'high', wander: 'high' } },
      { when: { tension: 'mid' }, then: { resonance: 'mid', wander: 'mid' } },
      { when: { tension: 'low' }, then: { resonance: 'low', wander: 'low' } },
    ],
  },
  fixed: {
    direction: { min: 0, max: ARP_DIRECTIONS.length - 0.01, default: 0.5 / ARP_DIRECTIONS.length },
    octaves: { min: 1, max: 3, default: 0.5 },
    gate: { min: 0.2, max: 1.5, default: 0.5 },
    register: { min: -12, max: 12, default: 0.5 },
    every: { min: 0, max: ARP_EVERY.length - 0.01, default: 1.5 / ARP_EVERY.length },
    swell: { min: 0, max: 1, default: 0.6 },
  },
  // The bottom of the arp sits just above the middle of the pad and the range
  // grows upwards, so more octaves climb into the air rather than into the
  // pad, whose notes would otherwise push the arp's out of order.
  register: (p, base) => {
    const octaves = Math.round(p.octaves ?? 1)
    const bottom = base.centre + 6 + Math.round(p.register ?? 0)
    return { centre: bottom + 6 * octaves, span: 6 * octaves }
  },
  apply: (voice, p, level) => {
    if (voice instanceof Pluck) {
      voice.set({
        shape: p.shape, cutoff: p.cutoff, envAmt: p.envAmt, decay: p.decay,
        resonance: p.resonance, spread: p.spread, level: level * 0.5,
      })
    }
  },
  notes: (ctx) => {
    const stride = ARP_STRIDES[Math.floor(ctx.params.rate ?? 1)] ?? 2
    const octaves = Math.round(ctx.params.octaves ?? 1)
    const rest = clamp01(ctx.params.rest ?? 0.2)
    const gate = ctx.params.gate ?? 0.85
    const wander = clamp01(ctx.params.wander ?? 0.3)
    const swell = clamp01(ctx.params.swell ?? 0.6)

    // An arp that never stops is a ringtone. Time is cut into windows of a
    // few bars, and each window may hold one run, somewhere inside it. The
    // window, not the bar, owns that decision, so the run is the same one
    // whichever of its bars playback starts on.
    const bars = ARP_EVERY[Math.floor(ctx.params.every ?? 1)] ?? 2
    const window = Math.floor(ctx.bar / bars)
    const run = ctx.phraseRng('run', bars, window)
    // Every value is drawn whether or not it is used, so turning one knob
    // never reshuffles the decisions the others lead to.
    const plays = run() < clamp01(ctx.params.chance ?? 0.5)
    const startRoll = run()
    const turnRoll = run()
    const turnTo = Math.floor(run() * ARP_DIRECTIONS.length)
    const offsetRoll = run()
    if (!plays) return []

    const total = bars * 16
    const count = Math.max(3, Math.min(total / stride, Math.round((clamp01(ctx.params.length ?? 0.5) * total) / stride)))
    const start = Math.floor(startRoll * (total / stride - count + 1)) * stride
    const direction = turnRoll < wander * 0.6 ? turnTo : Math.floor(ctx.params.direction ?? 0)

    // About a chord tone per slot: the resolver snaps each to the nearest one.
    const n = 3 * octaves + 1
    // A calm run starts at the bottom of its direction; a wandering one
    // anywhere in it.
    const offset = Math.floor(offsetRoll * n * wander)
    const shuffle = Array.from({ length: n }, (_, i) => i)
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(run() * (i + 1))
      const t = shuffle[i]
      shuffle[i] = shuffle[j]
      shuffle[j] = t
    }

    const out: NoteIntent[] = []
    const barStart = (ctx.bar - window * bars) * 16
    for (let step = 0; step < 16; step += stride) {
      const skip = ctx.rng() < rest
      const slip = ctx.rng()
      const i = (barStart + step - start) / stride
      if (i < 0 || i >= count || skip) continue
      let slot = arpSlot(direction, i + offset, n, shuffle)
      // Wandering also lets a note slip a slot either way, so a run is not a
      // perfect staircase.
      if (slip < wander * 0.25) slot = Math.max(0, Math.min(n - 1, slot + (slip < wander * 0.125 ? -1 : 1)))
      // The run fades in and away rather than starting and stopping like a
      // sequencer being switched on.
      const arc = lerp(1, Math.sin((Math.PI * (i + 0.5)) / count), swell)
      out.push({
        role: 'chordal',
        contour: -1 + (2 * slot) / (n - 1),
        weight: Math.max(0.12, lerp(0.5, 0.95, beatStrength(step)) * arc),
        step,
        lengthSteps: stride * gate,
      })
    }
    return out
  },
  controls: [
    { param: 'chance', label: 'Chance', group: 'runs' },
    { param: 'every', label: 'Every', group: 'runs', options: ARP_EVERY.map((n) => (n === 1 ? '1 bar' : `${n} bars`)) },
    { param: 'length', label: 'Length', group: 'runs' },
    { param: 'swell', label: 'Swell', group: 'runs' },
    { param: 'wander', label: 'Wander', group: 'runs' },
    { param: 'rate', label: 'Rate', group: 'pattern', options: ARP_RATES },
    { param: 'direction', label: 'Direction', group: 'pattern', options: ARP_DIRECTIONS },
    { param: 'octaves', label: 'Octaves', group: 'pattern' },
    { param: 'gate', label: 'Gate', group: 'pattern' },
    { param: 'rest', label: 'Rests', group: 'pattern' },
    { param: 'register', label: 'Register', group: 'pattern' },
    { param: 'cutoff', label: 'Cutoff', group: 'sound' },
    { param: 'envAmt', label: 'Pluck', group: 'sound' },
    { param: 'resonance', label: 'Reso', group: 'sound' },
    { param: 'decay', label: 'Decay', group: 'sound' },
    { param: 'shape', label: 'Shape', group: 'sound' },
    { param: 'spread', label: 'Width', group: 'sound' },
  ],
}

// ─── Strings ───────────────────────────────────────────────────────────────
const strings: InstrumentDef = {
  id: 'strings',
  name: 'Strings',
  role: 'chordal',
  blurb: 'A bowed section above the pad. Slow to arrive, and it can swell through a note.',
  create: (sr, rng) => new Strings(sr, rng),
  rules: {
    outputs: {
      attack: { min: 0.6, max: 6, scale: 'exp' },
      release: { min: 1.2, max: 7, scale: 'exp' },
      brightness: { min: 900, max: 6500, scale: 'exp' },
      ensemble: { min: 0.15, max: 0.9 },
      vibrato: { min: 0, max: 22 },
      vibratoDelay: { min: 0.3, max: 2.2, scale: 'exp' },
      swell: { min: 0, max: 0.9 },
      width: { min: 0.3, max: 1 },
      voices: { min: 2, max: 4 },
    },
    rules: [
      { when: { brightness: 'high' }, then: { brightness: 'high' } },
      { when: { brightness: 'mid' }, then: { brightness: 'mid' } },
      { when: { brightness: 'low' }, then: { brightness: 'low' } },
      { when: { motion: 'high' }, then: { vibrato: 'high', swell: 'high', vibratoDelay: 'low' } },
      { when: { motion: 'mid' }, then: { vibrato: 'mid', swell: 'mid' } },
      { when: { motion: 'low' }, then: { vibrato: 'low', swell: 'low', attack: 'high' } },
      { when: { weight: 'high' }, then: { release: 'high', ensemble: 'high' } },
      { when: { weight: 'mid' }, then: { release: 'mid', ensemble: 'mid' } },
      { when: { weight: 'low' }, then: { attack: 'high', width: 'high' } },
      { when: { density: 'high' }, then: { voices: 'high', width: 'high', ensemble: 'high' } },
      { when: { density: 'mid' }, then: { voices: 'mid', width: 'mid' } },
      { when: { density: 'low' }, then: { voices: 'low', width: 'low' } },
      { when: { tension: 'high' }, then: { vibrato: 'high', attack: 'low' } },
      { when: { tension: 'low' }, then: { attack: 'mid' } },
    ],
  },
  fixed: {
    register: { min: -12, max: 12, default: 0.5 },
  },
  // A fourth or so above where the pad sits, so the two share the chord
  // rather than doubling it. The resolver keeps them off each other's notes.
  register: (p, base) => ({ centre: base.centre + 5 + Math.round(p.register ?? 0), span: base.span }),
  apply: (voice, p, level) => {
    if (voice instanceof Strings) {
      voice.set({
        attack: p.attack, release: p.release, brightness: p.brightness, ensemble: p.ensemble,
        vibrato: p.vibrato, vibratoDelay: p.vibratoDelay, swell: p.swell, width: p.width,
        level: level * 0.2,
      })
    }
  },
  notes: (ctx) => {
    const voices = Math.round(ctx.params.voices ?? 3)
    const out: NoteIntent[] = []
    for (let i = 0; i < voices; i++) {
      out.push({
        role: 'chordal',
        contour: -0.2 + (i / Math.max(1, voices - 1)) * 1.1,
        weight: lerp(0.55, 0.8, ctx.rng()),
        step: 0,
        lengthSteps: 16 * 1.05,
      })
    }
    return out
  },
  controls: [
    { param: 'attack', label: 'Attack', group: 'bow' },
    { param: 'release', label: 'Release', group: 'bow' },
    { param: 'swell', label: 'Swell', group: 'bow' },
    { param: 'vibrato', label: 'Vibrato', group: 'bow' },
    { param: 'vibratoDelay', label: 'Vib delay', group: 'bow' },
    { param: 'brightness', label: 'Bright', group: 'tone' },
    { param: 'ensemble', label: 'Ensemble', group: 'tone' },
    { param: 'width', label: 'Width', group: 'tone' },
    { param: 'voices', label: 'Voices', group: 'voicing' },
    { param: 'register', label: 'Register', group: 'voicing' },
  ],
}

// ─── Shimmer ───────────────────────────────────────────────────────────────
const shimmer: InstrumentDef = {
  id: 'shimmer',
  name: 'Shimmer',
  role: 'colour',
  blurb: 'A granular cloud on the harmony and its octaves. Light caught in the reverb.',
  create: (sr, rng) => new Shimmer(sr, rng),
  rules: {
    outputs: {
      grainSize: { min: 0.05, max: 0.6, scale: 'exp' },
      grainRate: { min: 3, max: 40, scale: 'exp' },
      spray: { min: 0, max: 1 },
      octaves: { min: 0, max: 0.85 },
      tone: { min: 1500, max: 9000, scale: 'exp' },
      width: { min: 0.3, max: 1 },
      attack: { min: 0.5, max: 6, scale: 'exp' },
      release: { min: 1, max: 10, scale: 'exp' },
    },
    rules: [
      { when: { brightness: 'high' }, then: { tone: 'high', octaves: 'high' } },
      { when: { brightness: 'mid' }, then: { tone: 'mid', octaves: 'mid' } },
      { when: { brightness: 'low' }, then: { tone: 'low', octaves: 'low' } },
      { when: { motion: 'high' }, then: { grainRate: 'high', spray: 'high' } },
      { when: { motion: 'mid' }, then: { grainRate: 'mid', spray: 'mid' } },
      { when: { motion: 'low' }, then: { grainRate: 'low', spray: 'low', grainSize: 'high' } },
      { when: { density: 'high' }, then: { grainRate: 'high', width: 'high', grainSize: 'mid' } },
      { when: { density: 'mid' }, then: { width: 'mid' } },
      { when: { density: 'low' }, then: { grainRate: 'low', grainSize: 'high', width: 'low' } },
      { when: { weight: 'high' }, then: { attack: 'high', release: 'high' } },
      { when: { weight: 'mid' }, then: { attack: 'mid', release: 'mid' } },
      { when: { weight: 'low' }, then: { attack: 'low', release: 'mid' } },
      { when: { tension: 'high' }, then: { spray: 'high', grainSize: 'low' } },
    ],
  },
  apply: (voice, p, level) => {
    if (voice instanceof Shimmer) {
      voice.set({
        grainSize: p.grainSize, grainRate: p.grainRate, spray: p.spray, octaves: p.octaves,
        tone: p.tone, width: p.width, attack: p.attack, release: p.release, level: level * 0.2,
      })
    }
  },
  notes: (ctx) => {
    // Two or three long notes a bar: the cloud needs something to be made of,
    // not a rhythm.
    const out: NoteIntent[] = []
    for (const step of [0, 8]) {
      if (step === 8 && ctx.rng() < 0.4) continue
      out.push({
        role: 'colour',
        contour: -0.6 + ctx.rng() * 1.2,
        weight: lerp(0.5, 0.85, ctx.rng()),
        step,
        lengthSteps: 20 + ctx.rng() * 12,
      })
    }
    return out
  },
  controls: [
    { param: 'grainSize', label: 'Grain', group: 'cloud' },
    { param: 'grainRate', label: 'Density', group: 'cloud' },
    { param: 'spray', label: 'Spray', group: 'cloud' },
    { param: 'octaves', label: 'Octaves', group: 'cloud' },
    { param: 'tone', label: 'Tone', group: 'cloud' },
    { param: 'width', label: 'Width', group: 'cloud' },
    { param: 'attack', label: 'Attack', group: 'shape' },
    { param: 'release', label: 'Release', group: 'shape' },
  ],
}

// ─── Drone ─────────────────────────────────────────────────────────────────
const drone: InstrumentDef = {
  id: 'drone',
  name: 'Drone',
  role: 'chordal',
  blurb: 'Low held tones whose harmonics beat and wander. The pitch never moves; the colour never stops.',
  create: (sr, rng) => new Drone(sr, rng),
  rules: {
    outputs: {
      attack: { min: 1.5, max: 9, scale: 'exp' },
      release: { min: 3, max: 12, scale: 'exp' },
      brightness: { min: 0.05, max: 0.85 },
      beat: { min: 0.08, max: 2.4, scale: 'exp' },
      evolve: { min: 0.1, max: 0.95 },
      evolveHz: { min: 0.02, max: 0.4, scale: 'exp' },
      width: { min: 0.2, max: 1 },
      voices: { min: 2, max: 3 },
    },
    rules: [
      { when: { brightness: 'high' }, then: { brightness: 'high' } },
      { when: { brightness: 'mid' }, then: { brightness: 'mid' } },
      { when: { brightness: 'low' }, then: { brightness: 'low' } },
      { when: { motion: 'high' }, then: { beat: 'high', evolve: 'high', evolveHz: 'high' } },
      { when: { motion: 'mid' }, then: { beat: 'mid', evolve: 'mid', evolveHz: 'mid' } },
      { when: { motion: 'low' }, then: { beat: 'low', evolve: 'low', evolveHz: 'low', attack: 'high' } },
      // Weight is depth: a heavy drone is darker and takes longer to leave.
      { when: { weight: 'high' }, then: { release: 'high', brightness: 'low' } },
      { when: { weight: 'mid' }, then: { release: 'mid' } },
      { when: { weight: 'low' }, then: { release: 'low', attack: 'mid' } },
      { when: { density: 'high' }, then: { voices: 'high', width: 'high' } },
      { when: { density: 'mid' }, then: { voices: 'mid', width: 'mid' } },
      { when: { density: 'low' }, then: { voices: 'low', width: 'low' } },
      // Tension is a faster beat: the same intervals, less at rest.
      { when: { tension: 'high' }, then: { beat: 'high', attack: 'low' } },
      { when: { tension: 'mid' }, then: { attack: 'mid' } },
      { when: { tension: 'low' }, then: { beat: 'low' } },
    ],
  },
  fixed: {
    register: { min: -12, max: 12, default: 0.5 },
  },
  // Under the pad's left hand. Low enough that the resolver's rule against
  // close intervals down there leaves open fifths and octaves, which is what
  // a drone wants anyway.
  register: (p, base) => ({ centre: base.centre - 14 + Math.round(p.register ?? 0), span: base.span }),
  apply: (voice, p, level) => {
    if (voice instanceof Drone) {
      voice.set({
        attack: p.attack, release: p.release, brightness: p.brightness, beat: p.beat,
        evolve: p.evolve, evolveHz: p.evolveHz, width: p.width, level: level * 0.12,
      })
    }
  },
  notes: (ctx) => {
    // The same low contours every bar, so a chord that stays is a drone that
    // stays: the voice holds a note it is asked for again rather than
    // restriking it.
    const voices = Math.round(ctx.params.voices ?? 2)
    const out: NoteIntent[] = []
    for (let i = 0; i < voices; i++) {
      out.push({
        role: 'chordal',
        contour: -0.9 + i * 0.7,
        weight: lerp(0.65, 0.8, ctx.rng()),
        step: 0,
        lengthSteps: 16 * 1.05,
      })
    }
    return out
  },
  controls: [
    { param: 'brightness', label: 'Bright', group: 'sound' },
    { param: 'beat', label: 'Beat', group: 'sound' },
    { param: 'evolve', label: 'Evolve', group: 'sound' },
    { param: 'evolveHz', label: 'Evolve rate', group: 'sound' },
    { param: 'width', label: 'Width', group: 'sound' },
    { param: 'attack', label: 'Attack', group: 'shape' },
    { param: 'release', label: 'Release', group: 'shape' },
    { param: 'voices', label: 'Voices', group: 'voicing' },
    { param: 'register', label: 'Register', group: 'voicing' },
  ],
}

// ─── Choir ─────────────────────────────────────────────────────────────────
const choir: InstrumentDef = {
  id: 'choir',
  name: 'Choir',
  role: 'chordal',
  blurb: 'Wordless voices holding the chord. The vowel opens with the light.',
  create: (sr, rng) => new Choir(sr, rng),
  rules: {
    outputs: {
      attack: { min: 0.8, max: 5, scale: 'exp' },
      release: { min: 1.5, max: 7, scale: 'exp' },
      vowel: { min: 0, max: 1 },
      vowelDrift: { min: 0.05, max: 1 },
      vibrato: { min: 2, max: 20 },
      breath: { min: 0.05, max: 0.6 },
      ensemble: { min: 0.15, max: 0.9 },
      width: { min: 0.3, max: 1 },
      voices: { min: 2, max: 4 },
    },
    rules: [
      // Dark is a closed mouth, bright an open one: oo through ah to eh.
      { when: { brightness: 'high' }, then: { vowel: 'high' } },
      { when: { brightness: 'mid' }, then: { vowel: 'mid' } },
      { when: { brightness: 'low' }, then: { vowel: 'low' } },
      { when: { motion: 'high' }, then: { vowelDrift: 'high', vibrato: 'high' } },
      { when: { motion: 'mid' }, then: { vowelDrift: 'mid', vibrato: 'mid' } },
      { when: { motion: 'low' }, then: { vowelDrift: 'low', vibrato: 'low', attack: 'high' } },
      { when: { weight: 'high' }, then: { ensemble: 'high', release: 'high' } },
      { when: { weight: 'mid' }, then: { ensemble: 'mid', release: 'mid' } },
      { when: { weight: 'low' }, then: { ensemble: 'low', attack: 'high' } },
      { when: { density: 'high' }, then: { voices: 'high', width: 'high' } },
      { when: { density: 'mid' }, then: { voices: 'mid', width: 'mid' } },
      { when: { density: 'low' }, then: { voices: 'low', width: 'low' } },
      // Strain shows as air in the voice and a wider vibrato.
      { when: { tension: 'high' }, then: { breath: 'high', vibrato: 'high', attack: 'low' } },
      { when: { tension: 'mid' }, then: { breath: 'mid' } },
      { when: { tension: 'low' }, then: { breath: 'low' } },
    ],
  },
  fixed: {
    register: { min: -12, max: 12, default: 0.5 },
  },
  // Between the pad and the strings. The resolver keeps all three off each
  // other's notes, so they share the chord rather than doubling it.
  register: (p, base) => ({ centre: base.centre + 3 + Math.round(p.register ?? 0), span: base.span }),
  apply: (voice, p, level) => {
    if (voice instanceof Choir) {
      voice.set({
        attack: p.attack, release: p.release, vowel: p.vowel, vowelDrift: p.vowelDrift,
        vibrato: p.vibrato, breath: p.breath, ensemble: p.ensemble, width: p.width,
        level: level * 0.6,
      })
    }
  },
  notes: (ctx) => {
    const voices = Math.round(ctx.params.voices ?? 3)
    const out: NoteIntent[] = []
    for (let i = 0; i < voices; i++) {
      out.push({
        role: 'chordal',
        contour: -0.5 + (i / Math.max(1, voices - 1)) * 1.2,
        weight: lerp(0.55, 0.8, ctx.rng()),
        step: 0,
        lengthSteps: 16 * 1.05,
      })
    }
    return out
  },
  controls: [
    { param: 'vowel', label: 'Vowel', group: 'voice' },
    { param: 'vowelDrift', label: 'Drift', group: 'voice' },
    { param: 'breath', label: 'Breath', group: 'voice' },
    { param: 'vibrato', label: 'Vibrato', group: 'voice' },
    { param: 'attack', label: 'Attack', group: 'shape' },
    { param: 'release', label: 'Release', group: 'shape' },
    { param: 'ensemble', label: 'Ensemble', group: 'shape' },
    { param: 'width', label: 'Width', group: 'shape' },
    { param: 'voices', label: 'Voices', group: 'voicing' },
    { param: 'register', label: 'Register', group: 'voicing' },
  ],
}

// ─── Field ─────────────────────────────────────────────────────────────────
const field: InstrumentDef = {
  id: 'field',
  name: 'Field',
  role: 'colour',
  blurb: 'A place outside: night crickets, a fire, a stream, or distant thunder.',
  create: (sr, rng) => new Field(sr, rng),
  continuous: true,
  unducked: true,
  rules: {
    outputs: {
      tone: { min: 0.1, max: 0.9 },
      activity: { min: 0.1, max: 0.95 },
      swell: { min: 0.1, max: 0.9 },
      // As the bed's: terms centred on rumble, fire and night, so stream is
      // what a blend of fire and night lands on.
      kind: {
        min: 0,
        max: FIELD_KINDS.length - 0.01,
        terms: { low: tri(0, 0.125, 0.25), mid: tri(0.25, 0.375, 0.5), high: tri(0.75, 0.875, 1) },
      },
    },
    rules: [
      { when: { brightness: 'high' }, then: { tone: 'high', kind: 'high' } },
      { when: { brightness: 'mid' }, then: { tone: 'mid', kind: 'mid' } },
      { when: { brightness: 'low' }, then: { tone: 'low', kind: 'low' } },
      { when: { weight: 'high' }, then: { kind: 'low', tone: 'low' } },
      { when: { density: 'high' }, then: { activity: 'high' } },
      { when: { density: 'mid' }, then: { activity: 'mid' } },
      { when: { density: 'low' }, then: { activity: 'low' } },
      { when: { motion: 'high' }, then: { swell: 'high' } },
      { when: { motion: 'mid' }, then: { swell: 'mid' } },
      { when: { motion: 'low' }, then: { swell: 'low' } },
    ],
  },
  apply: (voice, p, level) => {
    if (voice instanceof Field) {
      voice.set({
        kind: FIELD_KINDS[Math.min(FIELD_KINDS.length - 1, Math.max(0, Math.floor(p.kind)))],
        tone: p.tone, activity: p.activity, swell: p.swell, level: level * 0.3,
      })
    }
  },
  controls: [
    { param: 'kind', label: 'Kind', options: FIELD_KINDS },
    { param: 'tone', label: 'Tone' },
    { param: 'activity', label: 'Activity' },
    { param: 'swell', label: 'Swell' },
  ],
}

/** Generic melodic pattern, shared by pitched instruments that want a line. */
function intentsFor(ctx: PatternContext, role: 'melodic'): NoteIntent[] {
  const rate = ctx.params.rate ?? 3
  const rest = clamp01(ctx.params.rest ?? 0.3)
  const want = Math.max(0, Math.min(16, Math.round(rate)))
  // Strong positions first, so thinning out leaves a skeleton that still
  // swings rather than a random scatter.
  const order = [0, 8, 4, 12, 6, 14, 2, 10, 3, 11, 7, 15, 1, 9, 5, 13]
  const out: NoteIntent[] = []
  let previous = 0
  for (let i = 0; i < want; i++) {
    // A rest drops the note outright. It used to skip to the next position
    // and keep looking, which moved notes about but never removed one, so no
    // setting of the dial could make a bar sparser than its note count.
    if (ctx.rng() < rest) continue
    const step = order[i]
    // Contour wanders by small amounts, so the line has direction rather than
    // jumping around its register.
    previous = Math.max(-1, Math.min(1, previous + (ctx.rng() - 0.5) * 0.9))
    out.push({
      role,
      contour: previous,
      weight: clamp01((step % 4 === 0 ? 0.7 : 0.48) + (ctx.rng() - 0.5) * 0.3),
      step,
      lengthSteps: 2 + ctx.rng() * 6,
    })
  }
  return out.sort((a, b) => a.step - b.step)
}

/** In the order the picker lists them: the harmony and the room first. */
export const INSTRUMENTS: readonly InstrumentDef[] = [
  padInstrument, strings, choir, drone, shimmer, bed, field, sub, glass, arp, rhodes, dust, kit, cymbals,
]

export function instrumentById(id: string): InstrumentDef | undefined {
  return INSTRUMENTS.find((i) => i.id === id)
}

export { stepsToSeconds, isVoiceWith }
