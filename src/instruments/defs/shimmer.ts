import type { InstrumentDef } from '@/instruments/types.ts'
import type { NoteIntent } from '@/harmony/types.ts'
import { Shimmer } from '@/voices/shimmer.ts'
import { lerp } from '@/core/curves.ts'

export const shimmer: InstrumentDef = {
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
    return [0, 8].flatMap((step): NoteIntent[] => {
      if (step === 8 && ctx.rng() < 0.4) return []
      return [{
        role: 'colour',
        contour: -0.6 + ctx.rng() * 1.2,
        weight: lerp(0.5, 0.85, ctx.rng()),
        step,
        lengthSteps: 20 + ctx.rng() * 12,
      }]
    })
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
