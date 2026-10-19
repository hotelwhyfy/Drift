import type { InstrumentDef } from '@/instruments/types.ts'
import type { NoteIntent } from '@/harmony/types.ts'
import { Brass } from '@/voices/brass.ts'
import { lerp, clamp01 } from '@/core/curves.ts'
import { spread } from '@/instruments/spread.ts'

export const brass: InstrumentDef = {
  id: 'brass',
  name: 'Brass',
  role: 'chordal',
  blurb: 'Horns that swell out of nothing and let go. Brighter as they get louder.',
  create: (sr, rng) => new Brass(sr, rng),
  rules: {
    outputs: {
      attack: { min: 1.2, max: 6, scale: 'exp' },
      release: { min: 1.2, max: 6, scale: 'exp' },
      brightness: { min: 700, max: 4200, scale: 'exp' },
      edge: { min: 0, max: 0.9 },
      scoop: { min: 0, max: 0.8 },
      chiff: { min: 0, max: 0.5 },
      vibrato: { min: 0, max: 14 },
      ensemble: { min: 0.1, max: 0.8 },
      width: { min: 0.2, max: 0.9 },
      voices: { min: 2, max: 4 },
      // The chance a bar brings a swell. Never certain: a horn that answers
      // every downbeat is a loop.
      swells: { min: 0.25, max: 0.95 },
    },
    rules: [
      { when: { brightness: 'high' }, then: { brightness: 'high', edge: 'mid' } },
      { when: { brightness: 'mid' }, then: { brightness: 'mid', edge: 'low' } },
      { when: { brightness: 'low' }, then: { brightness: 'low', edge: 'low' } },
      // Heavy playing is slow and broad; light playing is quick to arrive.
      { when: { weight: 'high' }, then: { attack: 'high', release: 'high', ensemble: 'high' } },
      { when: { weight: 'mid' }, then: { attack: 'mid', release: 'mid', ensemble: 'mid' } },
      { when: { weight: 'low' }, then: { attack: 'low', release: 'low' } },
      { when: { motion: 'high' }, then: { vibrato: 'high', scoop: 'high', chiff: 'mid' } },
      { when: { motion: 'mid' }, then: { vibrato: 'mid', scoop: 'mid' } },
      { when: { motion: 'low' }, then: { vibrato: 'low', scoop: 'low', chiff: 'low' } },
      { when: { density: 'high' }, then: { voices: 'high', swells: 'high', width: 'high' } },
      { when: { density: 'mid' }, then: { voices: 'mid', swells: 'mid', width: 'mid' } },
      { when: { density: 'low' }, then: { voices: 'low', swells: 'low', width: 'low' } },
      // Strain leans on the horn: harder edge, a faster way into the note.
      { when: { tension: 'high' }, then: { edge: 'high', chiff: 'high', attack: 'low' } },
      { when: { tension: 'mid' }, then: { edge: 'mid' } },
      { when: { tension: 'low' }, then: { edge: 'low', attack: 'high' } },
    ],
  },
  fixed: {
    register: { min: -12, max: 12, default: 0.5 },
  },
  // Below the strings and the choir: horns live in the middle of the chord,
  // where their weight sits under the rest instead of on top of it.
  register: (p, base) => ({ centre: base.centre - 8 + Math.round(p.register ?? 0), span: base.span - 2 }),
  apply: (voice, p, level) => {
    if (voice instanceof Brass) {
      voice.set({
        attack: p.attack, release: p.release, brightness: p.brightness, edge: p.edge,
        scoop: p.scoop, chiff: p.chiff, vibrato: p.vibrato, ensemble: p.ensemble,
        width: p.width, level: level * 0.22,
      })
    }
  },
  notes: (ctx) => {
    const voices = Math.round(ctx.params.voices ?? 3)
    // Every draw is taken whether or not the swell happens, so the bar's
    // outcome never shifts what the next bar rolls.
    const roll = ctx.rng()
    const start = ctx.rng()
    const span = ctx.rng()
    // Spread rather than flipped, so one swell is followed by a rest more
    // often than independent coins would manage.
    const phase = ctx.phraseRng('spread-phase')()
    if (spread(phase, ctx.bar, roll) >= clamp01(ctx.params.swells ?? 0.6)) return []
    // A swell comes in on the downbeat or the third beat, and holds into the
    // next bar or two: the shape is a breath, not a stab.
    const step = start < 0.65 ? 0 : 8
    const length = (16 - step) + lerp(4, 18, span)
    return Array.from({ length: voices }, (_, i): NoteIntent => ({
      role: 'chordal',
      contour: -0.6 + (i / Math.max(1, voices - 1)) * 1.1,
      weight: lerp(0.5, 0.8, ctx.rng()),
      step,
      lengthSteps: length,
    }))
  },
  controls: [
    { param: 'brightness', label: 'Brightness', group: 'sound' },
    { param: 'edge', label: 'Edge', group: 'sound' },
    { param: 'scoop', label: 'Scoop', group: 'sound' },
    { param: 'chiff', label: 'Chiff', group: 'sound' },
    { param: 'vibrato', label: 'Vibrato', group: 'sound' },
    { param: 'attack', label: 'Attack', group: 'shape' },
    { param: 'release', label: 'Release', group: 'shape' },
    { param: 'ensemble', label: 'Ensemble', group: 'shape' },
    { param: 'width', label: 'Width', group: 'shape' },
    { param: 'swells', label: 'Swells', group: 'playing', display: (chance) => `${Math.round(chance * 100)}% of bars` },
    { param: 'voices', label: 'Voices', group: 'voicing' },
    { param: 'register', label: 'Register', group: 'voicing' },
  ],
}
