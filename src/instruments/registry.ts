import type { InstrumentDef, InstrumentVoice, PatternContext, PercussionEvent } from './types.ts'
import type { NoteIntent } from '../harmony/resolver.ts'
import { Keys } from '../voices/keys.ts'
import { Pad } from '../voices/pad.ts'
import { Bass } from '../voices/bass.ts'
import { Drums } from '../voices/drums.ts'
import { Vinyl } from '../voices/vinyl.ts'
import { Texture } from '../voices/texture.ts'
import { euclid } from '../compose/patterns.ts'
import { lerp, clamp01 } from '../core/curves.ts'

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
    },
    rules: [
      { when: { brightness: 'high' }, then: { cutoff: 'high', shape: 'high' } },
      { when: { brightness: 'mid' }, then: { cutoff: 'mid', shape: 'mid' } },
      { when: { brightness: 'low' }, then: { cutoff: 'low', shape: 'low' } },
      { when: { weight: 'high' }, then: { cutoff: 'low', release: 'high' } },
      { when: { weight: 'low' }, then: { attack: 'high', spread: 'high' } },
      { when: { motion: 'high' }, then: { motion: 'high', motionHz: 'high', detune: 'high' } },
      { when: { motion: 'low' }, then: { motion: 'low', motionHz: 'low', attack: 'high' } },
      { when: { tension: 'high' }, then: { resonance: 'high', detune: 'high' } },
      { when: { tension: 'low' }, then: { resonance: 'low', attack: 'high' } },
      { when: { density: 'high' }, then: { detune: 'high', spread: 'high' } },
      { when: { density: 'low' }, then: { detune: 'low' } },
    ],
  },
  apply: (voice, p, level) => {
    if (voice instanceof Pad) {
      voice.set({
        attack: p.attack, release: p.release, cutoff: p.cutoff, resonance: p.resonance,
        detune: p.detune, shape: p.shape, motion: p.motion, motionHz: p.motionHz,
        spread: p.spread, level: level * 0.3,
      })
    }
  },
  notes: (ctx) => {
    // The pad restates the chord rather than playing a line: one intent per
    // voice of the chord, splayed so the entry breathes instead of striking.
    const voices = 3 + Math.round(clamp01(ctx.expression.density) * 2)
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
        harmonics: p.harmonics, drive: p.drive, level: level * 0.5,
      })
    }
  },
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
const kit: InstrumentDef = {
  id: 'kit',
  name: 'Kit',
  role: 'melodic',
  blurb: 'Synthesised drums, soft and filtered. Sweepable to nothing.',
  create: (sr, rng) => new Drums(sr, rng),
  rules: {
    outputs: {
      tone: { min: 0.2, max: 0.9 },
      kickWeight: { min: 0.3, max: 0.85 },
      snareBody: { min: 0.15, max: 0.7 },
      hatLevel: { min: 0.15, max: 0.7 },
      snareLevel: { min: 0.3, max: 0.8 },
      kickLevel: { min: 0.7, max: 1.1 },
      busy: { min: 0.1, max: 0.95 },
    },
    rules: [
      { when: { brightness: 'high' }, then: { tone: 'high', hatLevel: 'high' } },
      { when: { brightness: 'low' }, then: { tone: 'low', hatLevel: 'low' } },
      { when: { weight: 'high' }, then: { kickWeight: 'high', kickLevel: 'high', snareBody: 'high' } },
      { when: { weight: 'low' }, then: { kickWeight: 'low', kickLevel: 'low' } },
      { when: { density: 'high' }, then: { busy: 'high' } },
      { when: { density: 'low' }, then: { busy: 'low', hatLevel: 'low' } },
      { when: { motion: 'high' }, then: { busy: 'high' } },
      { when: { motion: 'low' }, then: { busy: 'low' } },
      { when: { tension: 'high' }, then: { snareLevel: 'high', tone: 'high' } },
    ],
  },
  apply: (voice, p, level) => {
    if (voice instanceof Drums) {
      voice.set({
        tone: p.tone, kickWeight: p.kickWeight, snareBody: p.snareBody,
        level: level * 0.55, hatLevel: p.hatLevel, snareLevel: p.snareLevel,
        kickLevel: p.kickLevel,
      })
    }
  },
  hits: (ctx): PercussionEvent[] => {
    const busy = clamp01(ctx.params.busy ?? 0.5)
    const out: PercussionEvent[] = []
    const kickPulses = 2 + Math.floor(busy * 3)
    euclid(kickPulses, 16, Math.floor(ctx.rng() * 3)).forEach((on, i) => {
      if (on) out.push({ step: i, kind: 'kick', velocity: 0.75 + ctx.rng() * 0.25 })
    })
    out.push({ step: 0, kind: 'kick', velocity: 1 })
    // Cross-stick rather than snare when the kit is meant to stay out of the
    // way: it keeps the backbeat without the transient.
    const soft = busy < 0.45
    for (const step of [4, 12]) {
      out.push({ step, kind: soft ? 'rim' : 'snare', velocity: 0.65 + ctx.rng() * 0.3 })
    }
    const every = busy > 0.75 ? 1 : busy > 0.45 ? 2 : 4
    for (let i = 0; i < 16; i += every) {
      if (ctx.rng() < 0.88) {
        out.push({ step: i, kind: 'hat', velocity: (i % 4 === 0 ? 0.6 : 0.33) + ctx.rng() * 0.16 })
      }
    }
    return out
  },
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
      voice.set({ crackle: p.crackle, hiss: p.hiss, hum: p.hum, humHz: 50, level: level * 0.3 })
    }
  },
}

// ─── Bed ───────────────────────────────────────────────────────────────────
const bed: InstrumentDef = {
  id: 'bed',
  name: 'Bed',
  role: 'colour',
  blurb: 'Rain, air or ocean. Fills the room sparse music leaves empty.',
  create: (sr, rng) => new Texture(sr, rng),
  continuous: true,
  rules: {
    outputs: {
      tone: { min: 0.12, max: 0.92 },
      motion: { min: 0.1, max: 0.95 },
      kind: { min: 0, max: 2.99 },
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
      const kinds = ['ocean', 'air', 'rain'] as const
      voice.set({
        kind: kinds[Math.min(2, Math.max(0, Math.floor(p.kind)))],
        tone: p.tone, motion: p.motion, level: level * 0.16,
      })
    }
  },
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

export const INSTRUMENTS: readonly InstrumentDef[] = [
  rhodes, padInstrument, sub, kit, glass, dust, bed,
]

export function instrumentById(id: string): InstrumentDef | undefined {
  return INSTRUMENTS.find((i) => i.id === id)
}

export { stepsToSeconds, isVoiceWith }
