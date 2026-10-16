import type { InstrumentDef } from '@/instruments/types.ts'
import { Texture, TEXTURE_KINDS } from '@/voices/texture.ts'
import { tri } from '@/fuzzy/membership.ts'

export const bed: InstrumentDef = {
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
