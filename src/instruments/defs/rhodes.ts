import type { InstrumentDef, PatternContext } from '@/instruments/types.ts'
import type { NoteIntent } from '@/harmony/types.ts'
import { Keys } from '@/voices/keys.ts'
import { clamp01 } from '@/core/curves.ts'

export const rhodes: InstrumentDef = {
  id: 'rhodes',
  name: 'Rhodes',
  role: 'melodic',
  blurb: 'FM electric piano. The voice most lo-fi is built around.',
  create: (sr, rng) => new Keys(sr, rng),
  rules: {
    outputs: {
      bite: { min: 0.05, max: 0.9 },
      decay: { min: 1.1, max: 7, scale: 'exp' },
      release: { min: 0.5, max: 3.4, scale: 'exp' },
      tone: { min: 1400, max: 7000, scale: 'exp' },
      tremolo: { min: 0, max: 0.36 },
      tremoloHz: { min: 2.6, max: 7, scale: 'exp' },
      spread: { min: 0.2, max: 0.9 },
      // Key presses per minute, at random moments. Exponential, so most of
      // the dial is the sparse end: the middle is one every ~13 s.
      rate: { min: 0.75, max: 30, scale: 'exp' },
      // The chance each of those presses is held back.
      rest: { min: 0.05, max: 0.85 },
    },
    rules: [
      { when: { brightness: 'high' }, then: { tone: 'high', bite: 'high' } },
      { when: { brightness: 'mid' }, then: { tone: 'mid', bite: 'mid' } },
      { when: { brightness: 'low' }, then: { tone: 'low', bite: 'low' } },
      // Heavy playing hits harder and rings longer; light playing is brief.
      { when: { weight: 'high' }, then: { decay: 'high', bite: 'mid' } },
      { when: { weight: 'low' }, then: { decay: 'low', release: 'low' } },
      { when: { motion: 'high' }, then: { tremoloHz: 'high', tremolo: 'high' } },
      { when: { motion: 'low' }, then: { tremolo: 'low', release: 'high' } },
      // Restlessness brings the hand down a little more often, but only a
      // little: on its own it must never turn the passer-by into a player.
      { when: { motion: 'high' }, then: { rate: 'mid' }, weight: 0.5 },
      { when: { motion: 'low' }, then: { rate: 'low' }, weight: 0.5 },
      { when: { tension: 'high' }, then: { bite: 'high', spread: 'low' } },
      { when: { tension: 'low' }, then: { spread: 'high' } },
      // Even a busy piece only gets the middle of the dial; anything busier
      // is a hand on the knob.
      { when: { density: 'high' }, then: { rate: 'mid', rest: 'low', decay: 'low' } },
      { when: { density: 'mid' }, then: { rate: 'mid', rest: 'mid' } },
      { when: { density: 'low' }, then: { rate: 'low', rest: 'high', decay: 'high' } },
      // Sparse and still together means long, hanging notes — the two dials
      // reinforcing each other rather than averaging out.
      { when: { density: 'low', motion: 'low' }, then: { release: 'high', decay: 'high' }, weight: 1.4 },
    ],
  },
  apply: (voice, p, level) => {
    if (voice instanceof Keys) {
      voice.set({
        bite: p.bite, decay: p.decay, release: p.release, tone: p.tone,
        tremolo: p.tremolo, tremoloHz: p.tremoloHz, spread: p.spread, level: level * 0.45,
      })
    }
  },
  notes: wanderingKeys,
  controls: [
    { param: 'tone', label: 'Tone', group: 'sound' },
    { param: 'bite', label: 'Bite', group: 'sound' },
    { param: 'decay', label: 'Decay', group: 'sound' },
    { param: 'release', label: 'Release', group: 'sound' },
    { param: 'tremolo', label: 'Tremolo', group: 'sound' },
    { param: 'tremoloHz', label: 'Trem rate', group: 'sound' },
    { param: 'spread', label: 'Width', group: 'sound' },
    { param: 'rate', label: 'Notes', group: 'playing', display: (perMinute) => `~${everySeconds(perMinute)}` },
    { param: 'rest', label: 'Rests', group: 'playing', display: (chance) => `${Math.round(chance * 100)}% held` },
  ],
}

/** How long, on average, between presses at this many a minute. */
function everySeconds(perMinute: number): string {
  const seconds = 60 / Math.max(perMinute, 1e-6)
  return seconds < 60 ? `${Math.round(seconds)}s` : `${(seconds / 60).toFixed(1)}m`
}

/**
 * Someone walking past a piano and pressing a key when they feel like it.
 *
 * Every sixteenth has the same small, independent chance of a note, so the
 * gaps are irregular — two presses close together, then nothing for half a
 * minute — and no beat, the downbeat included, is preferred. `rate` is presses
 * per minute rather than per bar, so a tempo change doesn't change how often
 * the hand comes down. It used to fill a bar's strongest beats first, which
 * however sparse it got still read as a part keeping time.
 */
function wanderingKeys(ctx: PatternContext): NoteIntent[] {
  const rate = Math.max(0, ctx.params.rate ?? 4)
  const rest = clamp01(ctx.params.rest ?? 0.3)
  const stepSec = 60 / ctx.tempo / 4
  const chance = clamp01((rate / 60) * stepSec * (1 - rest))
  const out: NoteIntent[] = []
  let previous = 0
  for (let step = 0; step < 16; step++) {
    // Every draw is taken whether or not the note sounds, so one step's
    // outcome never shifts what the next step rolls.
    const roll = ctx.rng()
    const drift = ctx.rng()
    const weight = ctx.rng()
    const length = ctx.rng()
    if (roll >= chance) continue
    // Contour wanders by small amounts, so a press lands near the last one
    // rather than anywhere in the register.
    previous = Math.max(-1, Math.min(1, previous + (drift - 0.5) * 0.9))
    out.push({
      role: 'melodic',
      contour: previous,
      // Soft and unaccented: nobody is counting.
      weight: 0.4 + weight * 0.25,
      step,
      lengthSteps: 2 + length * 6,
    })
  }
  return out
}
