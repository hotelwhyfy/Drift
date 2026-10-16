import type { InstrumentDef, PatternContext, PercussionEvent } from '@/instruments/types.ts'
import { Cymbals } from '@/voices/cymbals.ts'
import { lerp, clamp01 } from '@/core/curves.ts'

const CYMBAL_EVERY = [4, 8, 16]
const CYMBAL_KINDS = ['Mixed', 'Swells', 'Rolls']

/**
 * Gestures that build into a phrase's downbeat. Each one is scheduled in the
 * bar it starts, `length` bars before the line it lands on, so whether bar N
 * starts a swell depends on N alone — which is what keeps it seekable.
 */
function cymbalGestures(ctx: PatternContext): PercussionEvent[] {
  const every = CYMBAL_EVERY[Math.floor(ctx.params.every ?? 0)] ?? 4
  const length = Math.max(1, Math.min(every, Math.round(ctx.params.length ?? 2)))
  const lands = ctx.bar + length
  if (lands % every !== 0) return []
  const rng = ctx.phraseRng('gesture', lands / every)
  if (rng() >= clamp01(ctx.params.chance ?? 0.6)) return []
  const kinds = CYMBAL_KINDS[Math.floor(ctx.params.kind ?? 0)]
  const roll = kinds === 'Rolls' || (kinds === 'Mixed' && rng() < clamp01(ctx.params.rollBias ?? 0.3))
  return [{
    step: 0,
    kind: roll ? 'roll' : 'swell',
    velocity: lerp(0.65, 0.9, rng()),
    lengthSteps: length * 16,
  }]
}

export const cymbals: InstrumentDef = {
  id: 'cymbals',
  name: 'Cymbals',
  role: 'colour',
  blurb: 'Reversed swells and mallet rolls that build into the top of a phrase.',
  create: (sr, rng) => new Cymbals(sr, rng),
  rules: {
    outputs: {
      tone: { min: 2800, max: 10000, scale: 'exp' },
      metal: { min: 0.1, max: 0.8 },
      pitch: { min: 300, max: 650, scale: 'exp' },
      curve: { min: 1.2, max: 4 },
      tail: { min: 1, max: 5, scale: 'exp' },
      width: { min: 0.3, max: 1 },
      length: { min: 1, max: 4 },
      chance: { min: 0.25, max: 1 },
      rollBias: { min: 0, max: 0.8 },
    },
    rules: [
      { when: { brightness: 'high' }, then: { tone: 'high', metal: 'high' } },
      { when: { brightness: 'mid' }, then: { tone: 'mid', metal: 'mid' } },
      { when: { brightness: 'low' }, then: { tone: 'low', metal: 'low' } },
      // Weight is scale: a heavy piece builds longer and rings longer.
      { when: { weight: 'high' }, then: { length: 'high', tail: 'high' } },
      { when: { weight: 'mid' }, then: { length: 'mid', tail: 'mid' } },
      { when: { weight: 'low' }, then: { length: 'low', tail: 'low' } },
      { when: { density: 'high' }, then: { chance: 'high', rollBias: 'high', width: 'high' } },
      { when: { density: 'mid' }, then: { chance: 'mid', rollBias: 'mid', width: 'mid' } },
      { when: { density: 'low' }, then: { chance: 'low', rollBias: 'low', width: 'low' } },
      // Motion arrives sooner; stillness hangs back and rushes in at the end.
      { when: { motion: 'high' }, then: { curve: 'low' } },
      { when: { motion: 'mid' }, then: { curve: 'mid' } },
      { when: { motion: 'low' }, then: { curve: 'high' } },
      { when: { tension: 'high' }, then: { pitch: 'high', metal: 'high' } },
      { when: { tension: 'mid' }, then: { pitch: 'mid' } },
      { when: { tension: 'low' }, then: { pitch: 'low' } },
    ],
  },
  fixed: {
    every: { min: 0, max: CYMBAL_EVERY.length - 0.01, default: 0.5 / CYMBAL_EVERY.length },
    kind: { min: 0, max: CYMBAL_KINDS.length - 0.01, default: 0.5 / CYMBAL_KINDS.length },
  },
  apply: (voice, p, level) => {
    if (voice instanceof Cymbals) {
      voice.set({
        tone: p.tone, metal: p.metal, pitch: p.pitch, curve: p.curve,
        tail: p.tail, width: p.width, level: level * 0.4,
      })
    }
  },
  hits: cymbalGestures,
  controls: [
    { param: 'kind', label: 'Kind', group: 'pattern', options: CYMBAL_KINDS },
    { param: 'every', label: 'Every', group: 'pattern', options: CYMBAL_EVERY.map((n) => `${n} bars`) },
    { param: 'length', label: 'Length', group: 'pattern' },
    { param: 'chance', label: 'Chance', group: 'pattern' },
    { param: 'rollBias', label: 'Rolls', group: 'pattern' },
    { param: 'curve', label: 'Curve', group: 'shape' },
    { param: 'tail', label: 'Tail', group: 'shape' },
    { param: 'tone', label: 'Tone', group: 'sound' },
    { param: 'metal', label: 'Metal', group: 'sound' },
    { param: 'pitch', label: 'Pitch', group: 'sound' },
    { param: 'width', label: 'Width', group: 'sound' },
  ],
}
