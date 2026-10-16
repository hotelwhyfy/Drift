import type { InstrumentDef } from '@/instruments/types.ts'
import type { NoteIntent } from '@/harmony/types.ts'
import { Keys } from '@/voices/keys.ts'
import { lerp, clamp01 } from '@/core/curves.ts'

/**
 * A second pitched instrument built entirely from pieces the Rhodes already uses, to show
 * what adding one costs: a different register, a different rule base, and a
 * sparser pattern. No new DSP at all — the Rhodes engine at extreme settings
 * is a bell, which is what FM has always been good for.
 */
export const glass: InstrumentDef = {
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
  controls: [
    { param: 'tone', label: 'Tone', group: 'sound' },
    { param: 'bite', label: 'Strike', group: 'sound' },
    { param: 'decay', label: 'Decay', group: 'sound' },
    { param: 'release', label: 'Release', group: 'sound' },
    { param: 'tremolo', label: 'Shimmer', group: 'sound' },
    { param: 'spread', label: 'Width', group: 'sound' },
    { param: 'chance', label: 'Chance', group: 'playing' },
  ],
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
