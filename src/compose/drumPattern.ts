import type { PatternContext, PercussionEvent } from '../instruments/types.ts'
import type { DrumHit } from '../voices/drums.ts'
import { DRUM_STYLES, FILL_EVERY } from './drumStyles.ts'
import { beatStrength } from '../harmony/resolver.ts'
import { clamp01, lerp } from '../core/curves.ts'

/** Snare ghosts only where they cannot smudge the backbeat. */
const GHOST_STEPS = [1, 3, 6, 7, 9, 10, 14, 15]
const PHRASE_BARS = 4

/**
 * One bar of drums, still generative, but from a groove rather than a dice
 * roll.
 *
 * Three levels of decision, each seeded from where it sits in the music:
 *
 *   the style    a table of what each piece tends to play on each step;
 *   the phrase   four bars share one reading of the optional hits, so a
 *                groove establishes itself and repeats the way a drummer's
 *                does, instead of being re-rolled every bar;
 *   the bar      `variation` lets individual bars stray from their phrase.
 *
 * Fills land on the last bar of every `fillEvery` bars. Everything is a
 * function of the bar number, so a seek hears the same drums as a play-through.
 */
export function drumPattern(ctx: PatternContext): PercussionEvent[] {
  const p = ctx.params
  const style = DRUM_STYLES[Math.min(DRUM_STYLES.length - 1, Math.max(0, Math.floor(p.style ?? 0)))]
  const busy = clamp01(p.busy ?? 0.5)
  const variation = clamp01(p.variation ?? 0.3)
  const ghost = clamp01(p.ghost ?? 0.3)
  const openHats = clamp01(p.openHats ?? 0.3)
  const fill = clamp01(p.fill ?? 0)
  const every = FILL_EVERY[Math.min(FILL_EVERY.length - 1, Math.max(0, Math.floor(p.fillEvery ?? 2)))]

  const phrase = ctx.phraseRng('drums', Math.floor(ctx.bar / PHRASE_BARS))
  const phraseRoll = Array.from({ length: 16 * 5 }, () => phrase())
  const roll = (piece: number, step: number): number =>
    lerp(phraseRoll[piece * 16 + step], ctx.rng(), variation)

  // Busy thins or thickens the ornament and leaves the skeleton alone.
  const scaled = (prob: number): number => (prob >= 1 ? 1 : clamp01(prob * lerp(0.25, 1.7, busy)))
  const velocity = (step: number, lo: number, hi: number): number =>
    clamp01(lerp(lo, hi, beatStrength(step)) + (ctx.rng() - 0.5) * 0.12)

  const out: PercussionEvent[] = []
  const pieces: { kind: DrumHit; table: readonly number[]; lo: number; hi: number; weight: number }[] = [
    { kind: 'kick', table: style.kick, lo: 0.7, hi: 1, weight: 1 },
    { kind: 'snare', table: style.snare, lo: 0.6, hi: 0.95, weight: 1 },
    { kind: 'rim', table: style.rim, lo: 0.5, hi: 0.85, weight: 1 },
    { kind: 'hat', table: style.hat, lo: 0.3, hi: 0.62, weight: 1 },
    // Open hats are scaled by their own knob: none at 0, doubled at 1.
    { kind: 'openHat', table: style.openHat, lo: 0.4, hi: 0.6, weight: openHats * 2 },
  ]
  pieces.forEach((piece, index) => {
    for (let step = 0; step < 16; step++) {
      const prob = piece.table[step] * piece.weight
      if (prob <= 0) continue
      if (roll(index, step) < scaled(prob)) {
        out.push({ step, kind: piece.kind, velocity: velocity(step, piece.lo, piece.hi) })
      }
    }
  })

  // Asked for open hats outright: at least one a bar, on the last off-beat.
  if (openHats > 0.75 && !out.some((e) => e.kind === 'openHat')) {
    out.push({ step: 14, kind: 'openHat', velocity: 0.5 })
  }

  for (const step of GHOST_STEPS) {
    if (ctx.rng() < ghost * 0.45) {
      out.push({ step, kind: 'snare', velocity: lerp(0.12, 0.3, ctx.rng()) })
    }
  }

  const isFill = fill > 0 && ctx.bar % every === every - 1
  const played = isFill ? withFill(out, fill, ctx) : out

  // An open hat and a closed hat on the same step would choke each other.
  const open = new Set(played.filter((e) => e.kind === 'openHat').map((e) => e.step))
  return played.filter((e) => e.kind !== 'hat' || !open.has(e.step))
}

/**
 * Rewrite the end of the bar as a fill: the last beat, or the last two at full
 * strength, cleared of hats and filled with a rising run of snare and rim.
 */
function withFill(events: PercussionEvent[], amount: number, ctx: PatternContext): PercussionEvent[] {
  const from = amount > 0.6 ? 8 : 12
  const kept = events.filter((e) => e.step < from || e.kind === 'kick')
  for (let step = from; step < 16; step++) {
    const t = (step - from) / (16 - from)
    if (step % 2 === 1 && ctx.rng() > amount) continue
    kept.push({
      step,
      kind: ctx.rng() < 0.25 ? 'rim' : 'snare',
      velocity: clamp01(lerp(0.35, 0.95, t) * lerp(0.7, 1, amount)),
    })
  }
  if (amount > 0.3) kept.push({ step: 14, kind: 'kick', velocity: 0.8 })
  return kept
}
