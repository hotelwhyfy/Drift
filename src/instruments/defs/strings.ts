import type { InstrumentDef } from '@/instruments/types.ts'
import type { NoteIntent } from '@/harmony/types.ts'
import { Strings } from '@/voices/strings.ts'
import { lerp } from '@/core/curves.ts'

export const strings: InstrumentDef = {
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
    return Array.from({ length: voices }, (_, i): NoteIntent => ({
      role: 'chordal',
      contour: -0.2 + (i / Math.max(1, voices - 1)) * 1.1,
      weight: lerp(0.55, 0.8, ctx.rng()),
      step: 0,
      lengthSteps: 16 * 1.05,
    }))
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
