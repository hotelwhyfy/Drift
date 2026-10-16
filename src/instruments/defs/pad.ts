import type { InstrumentDef } from '@/instruments/types.ts'
import type { NoteIntent } from '@/harmony/types.ts'
import { Pad } from '@/voices/pad.ts'
import { lerp, clamp01 } from '@/core/curves.ts'

export const pad: InstrumentDef = {
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
    return Array.from({ length: voices }, (_, i): NoteIntent => ({
      role: 'chordal',
      contour: -0.7 + (i / Math.max(1, voices - 1)) * 1.5,
      weight: lerp(0.5, 0.85, ctx.rng()),
      step: 0,
      lengthSteps: 16 * 1.05,
    }))
  },
}
