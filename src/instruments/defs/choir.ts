import type { InstrumentDef } from '@/instruments/types.ts'
import type { NoteIntent } from '@/harmony/types.ts'
import { Choir } from '@/voices/choir.ts'
import { lerp } from '@/core/curves.ts'

export const choir: InstrumentDef = {
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
    return Array.from({ length: voices }, (_, i): NoteIntent => ({
      role: 'chordal',
      contour: -0.5 + (i / Math.max(1, voices - 1)) * 1.2,
      weight: lerp(0.55, 0.8, ctx.rng()),
      step: 0,
      lengthSteps: 16 * 1.05,
    }))
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
