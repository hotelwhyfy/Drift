import type { InstrumentDef, InstrumentVoice, PatternContext, FixedParam } from './types.ts'
import type { NoteIntent } from '../harmony/resolver.ts'
import { Keys } from '../voices/keys.ts'
import { Pad } from '../voices/pad.ts'
import { Bass } from '../voices/bass.ts'
import { Drums } from '../voices/drums.ts'
import { Vinyl } from '../voices/vinyl.ts'
import { Texture, TEXTURE_KINDS } from '../voices/texture.ts'
import { Strings } from '../voices/strings.ts'
import { Shimmer } from '../voices/shimmer.ts'
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
      rate: { min: 0.7, max: 7 },
      rest: { min: 0.05, max: 0.7 },
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
    out.push({ role: 'bass', contour: -0.4, weight: lerp(0.75, 1, ctx.rng()), step: 0, lengthSteps: 14 })
    if (ctx.rng() < activity * 0.6) {
      const step = [6, 8, 10, 11][Math.floor(ctx.rng() * 4)]
      out.push({ role: 'bass', contour: ctx.rng() < 0.5 ? -0.4 : 0.5, weight: lerp(0.45, 0.75, ctx.rng()), step, lengthSteps: 5 })
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

// ─── Dust ──────────────────────────────────────────────────────────────────
const dust: InstrumentDef = {
  id: 'dust',
  name: 'Dust',
  role: 'colour',
  blurb: 'Record surface: crackle, hiss and hum. Sits outside the room.',
  create: (sr, rng) => new Vinyl(sr, rng),
  continuous: true,
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

/** Generic melodic pattern, shared by pitched instruments that want a line. */
function intentsFor(ctx: PatternContext, role: 'melodic'): NoteIntent[] {
  const rate = ctx.params.rate ?? 3
  const rest = clamp01(ctx.params.rest ?? 0.3)
  const want = Math.max(0, Math.round(rate))
  // Strong positions first, so thinning out leaves a skeleton that still
  // swings rather than a random scatter.
  const order = [0, 8, 4, 12, 6, 14, 2, 10, 3, 11, 7, 15, 1, 9, 5, 13]
  const out: NoteIntent[] = []
  let previous = 0
  for (let i = 0; i < order.length && out.length < want; i++) {
    if (ctx.rng() < rest * 0.6) continue
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
  padInstrument, strings, shimmer, bed, sub, glass, rhodes, dust, kit,
]

export function instrumentById(id: string): InstrumentDef | undefined {
  return INSTRUMENTS.find((i) => i.id === id)
}

export { stepsToSeconds, isVoiceWith }
