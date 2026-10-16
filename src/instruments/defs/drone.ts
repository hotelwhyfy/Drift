import type { InstrumentDef } from '@/instruments/types.ts'
import type { NoteIntent } from '@/harmony/types.ts'
import { Drone } from '@/voices/drone.ts'
import { lerp } from '@/core/curves.ts'

export const drone: InstrumentDef = {
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
    return Array.from({ length: voices }, (_, i): NoteIntent => ({
      role: 'chordal',
      contour: -0.9 + i * 0.7,
      weight: lerp(0.65, 0.8, ctx.rng()),
      step: 0,
      lengthSteps: 16 * 1.05,
    }))
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
