import type { InstrumentDef } from '@/instruments/types.ts'
import { Field, FIELD_KINDS } from '@/voices/field.ts'
import { tri } from '@/fuzzy/membership.ts'

export const field: InstrumentDef = {
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
