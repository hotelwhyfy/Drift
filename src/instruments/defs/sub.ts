import type { InstrumentDef } from '@/instruments/types.ts'
import type { NoteIntent } from '@/harmony/types.ts'
import { Bass } from '@/voices/bass.ts'
import { lerp, clamp01 } from '@/core/curves.ts'

export const sub: InstrumentDef = {
  id: 'sub',
  name: 'Sub',
  role: 'bass',
  blurb: 'Mono low end. Centred, so it survives a phone speaker.',
  create: (sr) => new Bass(sr),
  rules: {
    outputs: {
      decay: { min: 0.8, max: 3.6, scale: 'exp' },
      release: { min: 0.25, max: 1.6, scale: 'exp' },
      cutoff: { min: 140, max: 520, scale: 'exp' },
      harmonics: { min: 0.05, max: 0.65 },
      drive: { min: 1, max: 2.4 },
      activity: { min: 0.25, max: 0.95 },
    },
    rules: [
      { when: { weight: 'high' }, then: { drive: 'high', decay: 'high', harmonics: 'high' } },
      { when: { weight: 'low' }, then: { decay: 'low', cutoff: 'low', harmonics: 'low' } },
      { when: { brightness: 'high' }, then: { cutoff: 'high', harmonics: 'high' } },
      { when: { brightness: 'low' }, then: { cutoff: 'low' } },
      { when: { motion: 'high' }, then: { activity: 'high', decay: 'low' } },
      { when: { motion: 'low' }, then: { activity: 'low', decay: 'high', release: 'high' } },
      { when: { density: 'high' }, then: { activity: 'high' } },
      { when: { density: 'low' }, then: { activity: 'low' } },
      { when: { tension: 'high' }, then: { drive: 'high' } },
    ],
  },
  apply: (voice, p, level) => {
    if (voice instanceof Bass) {
      voice.set({
        decay: p.decay, release: p.release, cutoff: p.cutoff,
        harmonics: p.harmonics, drive: p.drive, level: level * 0.18,
      })
    }
  },
  controls: [
    { param: 'cutoff', label: 'Cutoff', group: 'sound' },
    { param: 'harmonics', label: 'Harmonics', group: 'sound' },
    { param: 'drive', label: 'Drive', group: 'sound' },
    { param: 'decay', label: 'Decay', group: 'sound' },
    { param: 'release', label: 'Release', group: 'sound' },
    { param: 'activity', label: 'Movement', group: 'playing' },
  ],
  notes: (ctx) => {
    const out: NoteIntent[] = []
    const activity = ctx.params.activity ?? 0.5
    // A sub is a floor, not a line: one root held across the bar. Only real
    // movement earns a second note, and it keeps the downbeat's contour — two
    // contours either side of the root resolve to the same pitch an octave
    // apart, and the portamento turns that into a slide every bar.
    const second = ctx.rng() < clamp01((activity - 0.55) * 1.5)
    out.push({ role: 'bass', contour: -0.4, weight: lerp(0.75, 1, ctx.rng()), step: 0, lengthSteps: second ? 8 : 16 })
    if (second) {
      out.push({ role: 'bass', contour: -0.4, weight: lerp(0.45, 0.65, ctx.rng()), step: 8, lengthSteps: 8 })
    }
    return out
  },
}
