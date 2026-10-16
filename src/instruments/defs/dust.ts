import type { InstrumentDef } from '@/instruments/types.ts'
import { Vinyl } from '@/voices/vinyl.ts'

export const dust: InstrumentDef = {
  id: 'dust',
  name: 'Dust',
  role: 'colour',
  blurb: 'Record surface: crackle, hiss and hum. Sits outside the room.',
  create: (sr, rng) => new Vinyl(sr, rng),
  continuous: true,
  unducked: true,
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
