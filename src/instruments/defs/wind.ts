import type { InstrumentDef, PatternContext } from '@/instruments/types.ts'
import type { NoteIntent } from '@/harmony/types.ts'
import { Wind } from '@/voices/wind.ts'
import { clamp, clamp01, lerp } from '@/core/curves.ts'

/** Bars in a phrase: the span over which the line rises and falls once. */
const PHRASE_BARS = 4

export const wind: InstrumentDef = {
  id: 'wind',
  name: 'Wind',
  role: 'melodic',
  blurb: 'A breathy flute-like line. One player, phrases that rise and settle.',
  create: (sr, rng) => new Wind(sr, rng),
  rules: {
    outputs: {
      attack: { min: 0.04, max: 0.5, scale: 'exp' },
      release: { min: 0.6, max: 4.5, scale: 'exp' },
      space: { min: 0.15, max: 0.85 },
      tone: { min: 0, max: 1 },
      breath: { min: 0.1, max: 0.8 },
      vibrato: { min: 0, max: 24 },
      vibratoDelay: { min: 0.25, max: 1.6, scale: 'exp' },
      width: { min: 0.2, max: 0.9 },
      // Notes per minute inside a phrase, and the chance a phrase is rested.
      rate: { min: 3, max: 36, scale: 'exp' },
      rest: { min: 0.1, max: 0.85 },
    },
    rules: [
      { when: { brightness: 'high' }, then: { tone: 'high', breath: 'mid' } },
      { when: { brightness: 'mid' }, then: { tone: 'mid', breath: 'mid' } },
      { when: { brightness: 'low' }, then: { tone: 'low', breath: 'high' } },
      { when: { weight: 'high' }, then: { release: 'high', attack: 'high' } },
      { when: { weight: 'low' }, then: { release: 'low', attack: 'low' } },
      { when: { motion: 'high' }, then: { vibrato: 'high', vibratoDelay: 'low' } },
      { when: { motion: 'mid' }, then: { vibrato: 'mid' } },
      { when: { motion: 'low' }, then: { vibrato: 'low', vibratoDelay: 'high' } },
      // Like the rhodes, density only reaches the middle of the dial.
      { when: { density: 'high' }, then: { rate: 'mid', rest: 'low', space: 'mid' } },
      { when: { density: 'mid' }, then: { rate: 'mid', rest: 'mid', width: 'mid', space: 'mid' } },
      // A sparse line is a voice across a big room.
      { when: { density: 'low' }, then: { rate: 'low', rest: 'high', width: 'low', space: 'high' } },
      { when: { tension: 'high' }, then: { breath: 'high', tone: 'high', attack: 'low' } },
      { when: { tension: 'low' }, then: { breath: 'low', vibratoDelay: 'high' } },
    ],
  },
  apply: (voice, p, level) => {
    if (voice instanceof Wind) {
      voice.set({
        attack: p.attack, release: p.release, tone: p.tone, breath: p.breath,
        vibrato: p.vibrato, vibratoDelay: p.vibratoDelay, width: p.width,
        space: p.space, level: level * 0.4,
      })
    }
  },
  notes: phrasedLine,
  controls: [
    { param: 'tone', label: 'Tone', group: 'sound' },
    { param: 'breath', label: 'Breath', group: 'sound' },
    { param: 'vibrato', label: 'Vibrato', group: 'sound' },
    { param: 'vibratoDelay', label: 'Vib delay', group: 'sound' },
    { param: 'attack', label: 'Attack', group: 'shape' },
    { param: 'release', label: 'Release', group: 'shape' },
    { param: 'width', label: 'Width', group: 'shape' },
    { param: 'space', label: 'Space', group: 'shape' },
    { param: 'rate', label: 'Notes', group: 'playing', display: (perMinute) => `${Math.round(perMinute)}/min` },
    { param: 'rest', label: 'Rests', group: 'playing', display: (chance) => `${Math.round(chance * 100)}% held` },
  ],
}

/**
 * A line that breathes in phrases. Each four bars share an arch — a start, a
 * peak and a direction, all drawn from the phrase's own generator — and the
 * notes in a bar sit on it with a little wander. Because the arch is keyed to
 * the phrase, bar 400 plays the same line whether it was reached or seeked to.
 *
 * Some phrases are rested whole, so the line is an occasional voice rather
 * than a part: a flute across a field, not a lead.
 */
function phrasedLine(ctx: PatternContext): NoteIntent[] {
  const phrase = Math.floor(ctx.bar / PHRASE_BARS)
  const within = (ctx.bar % PHRASE_BARS) / PHRASE_BARS
  const arch = ctx.phraseRng('arch', phrase)
  const startContour = arch() * 1.0 - 0.6
  const peak = arch() * 0.9 + 0.1
  const restDraw = arch()
  const rate = Math.max(0, ctx.params.rate ?? 12)
  const rest = clamp01(ctx.params.rest ?? 0.4)
  if (restDraw < rest * 0.7) return []

  // Rise to the phrase's peak in the first half, settle in the second.
  const shape = Math.sin(Math.PI * within * 1.1)
  const base = lerp(startContour, peak, clamp01(shape))
  const stepSec = 60 / ctx.tempo / 4
  const chance = clamp01((rate / 60) * stepSec)
  const out: NoteIntent[] = []
  let busyUntil = 0
  for (let step = 0; step < 16; step++) {
    const roll = ctx.rng()
    const wander = ctx.rng()
    const weight = ctx.rng()
    const length = ctx.rng()
    // One player: no new note until the last has had its length.
    if (step < busyUntil || roll >= chance) continue
    const lengthSteps = 3 + length * 8
    busyUntil = step + Math.ceil(lengthSteps) + 1
    out.push({
      role: 'melodic',
      contour: clamp(base + (wander - 0.5) * 0.5, -1, 1),
      weight: 0.4 + weight * 0.3,
      step,
      lengthSteps,
    })
  }
  return out
}
