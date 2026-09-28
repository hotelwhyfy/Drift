import type { Expression } from '../fuzzy/expression.ts'
import { EXPRESSION_KEYS, NEUTRAL } from '../fuzzy/expression.ts'
import { positionWord } from '../fuzzy/lexicon.ts'
import {
  MOOD_WORDS, MOOD_PHRASES, MAX_PHRASE_WORDS,
  INTENSIFIERS, DIMINISHERS, NEGATIONS, CONTRAST,
} from './moodLexicon.ts'
import type { MoodVec } from './moodLexicon.ts'
import { deriveSeed } from '../core/rng.ts'
import { clamp01, lerp } from '../core/curves.ts'

export interface Reading {
  /** What the person actually typed, kept verbatim for display. */
  readonly text: string
  /** Where they are now, in the shared expression space. */
  readonly expression: Expression
  /** 0 unpleasant … 1 pleasant. */
  readonly valence: number
  /** 0 inert … 1 activated. */
  readonly arousal: number
  /** 0..1 — how strongly the answer committed to anything. */
  readonly conviction: number
  /** The words that carried the reading, for showing back. */
  readonly heard: readonly string[]
  /** Everything downstream derives from this. */
  readonly seed: number
}

const NOISE = new Set([
  'a', 'an', 'the', 'of', 'and', 'or', 'in', 'on', 'at', 'to', 'is', 'am',
  'it', 'with', 'like', 'some', 'that', 'this', 'as', 'for', 'so', 'i',
  'feel', 'feeling', 'today', 'me', 'my', 'im', 'was', 'been', 'have', 'has',
  'be', 'just', 'right', 'now', 'want', 'would', 'something', 'bit',
])

const NEUTRAL_VEC: MoodVec = [0.5, 0.5, 0.5, 0.4, 0.5, 0.5, 0.4]

interface Token {
  word: string
  vec: MoodVec
  /** How much this token is trusted: 1 for an exact hit, less for a guess. */
  confidence: number
  weight: number
}

/** Pull a vector toward or away from neutral. */
function scaleFromNeutral(vec: MoodVec, factor: number): MoodVec {
  const out = vec.map((v, i) => clamp01(NEUTRAL_VEC[i] + (v - NEUTRAL_VEC[i]) * factor))
  return [out[0], out[1], out[2], out[3], out[4], out[5], out[6]]
}

/** Reflect a vector through neutral: "not tired" is not "tired" halved. */
function invert(vec: MoodVec): MoodVec {
  const out = vec.map((v, i) => clamp01(NEUTRAL_VEC[i] - (v - NEUTRAL_VEC[i]) * 0.85))
  return [out[0], out[1], out[2], out[3], out[4], out[5], out[6]]
}

/**
 * Look a word up in both tables.
 *
 * The mood table is consulted first because the question is usually about a
 * feeling, but the sonic lexicon catches the answers to "what are you in the
 * mood to hear" — and its trigram matching catches the near-misses in both.
 */
function lookUp(word: string): { vec: MoodVec; confidence: number } | null {
  const exact = MOOD_WORDS[word]
  if (exact) return { vec: exact, confidence: 1 }

  const sonic = positionWord(word)
  if (sonic.confidence >= 0.999) {
    // A sonic word carries no affect of its own, so valence and arousal are
    // inferred from what it implies: dark and tense reads as unpleasant,
    // moving reads as activated.
    const e = sonic.vector
    return {
      vec: [
        e.brightness, e.weight, e.motion, e.tension, e.density,
        clamp01(0.5 + (e.brightness - 0.5) * 0.6 - (e.tension - 0.5) * 0.9),
        clamp01(e.motion * 0.75 + e.density * 0.25),
      ],
      confidence: 0.85,
    }
  }

  // Near-misses in the mood table: "anxiousness", "tiredd", "exausted".
  let best: string | null = null
  let bestScore = 0
  for (const candidate of Object.keys(MOOD_WORDS)) {
    const score = similarity(word, candidate)
    if (score > bestScore) {
      bestScore = score
      best = candidate
    }
  }
  if (best && bestScore >= 0.6) {
    return { vec: MOOD_WORDS[best], confidence: bestScore * 0.9 }
  }
  if (sonic.confidence > 0.34 && sonic.nearest) {
    const e = sonic.vector
    return {
      vec: [
        e.brightness, e.weight, e.motion, e.tension, e.density,
        clamp01(0.5 + (e.brightness - 0.5) * 0.6 - (e.tension - 0.5) * 0.9),
        clamp01(e.motion * 0.75 + e.density * 0.25),
      ],
      confidence: sonic.confidence * 0.7,
    }
  }
  return null
}

/** Dice coefficient over character bigrams. Cheap and good at typos. */
function similarity(a: string, b: string): number {
  if (a === b) return 1
  if (a.length < 3 || b.length < 3) return a === b ? 1 : 0
  const grams = (s: string): string[] =>
    Array.from({ length: s.length - 1 }, (_, i) => s.slice(i, i + 2))
  const ga = grams(a)
  const gb = grams(b)
  const pool = [...gb]
  let hits = 0
  for (const g of ga) {
    const at = pool.indexOf(g)
    if (at >= 0) {
      hits++
      pool.splice(at, 1)
    }
  }
  return (2 * hits) / (ga.length + gb.length)
}

/**
 * Read an answer.
 *
 * Handles the four things that actually change the meaning of a short reply:
 * intensity ("very tired"), diminishment ("a bit tired"), negation ("not tired")
 * and contrast ("tired but hopeful"). Without the last one especially, the most
 * common shape of honest answer — a complaint followed by a qualification —
 * averages out to nothing.
 */
export function interpret(text: string): Reading {
  const raw = text.trim()
  const words = raw.toLowerCase().split(/[^a-z']+/).filter((w) => w.length > 0)

  const tokens: Token[] = []
  const heard: string[] = []
  let pendingScale = 1
  let pendingNegation = false
  let afterContrast = false

  for (let index = 0; index < words.length; index++) {
    // Phrases first, longest first. Several of the commonest answers mean the
    // opposite of their parts — "too much" is not an intensified "much" — so
    // matching word by word would read them backwards.
    let matchedPhrase = false
    for (let span = Math.min(MAX_PHRASE_WORDS, words.length - index); span >= 2; span--) {
      const phrase = words.slice(index, index + span).join(' ')
      const vec = MOOD_PHRASES[phrase]
      if (!vec) continue
      let shaped = scaleFromNeutral(vec, pendingScale)
      if (pendingNegation) shaped = invert(shaped)
      tokens.push({
        word: phrase,
        vec: shaped,
        confidence: 1,
        weight: (afterContrast ? 2.2 : 1) * 1.3,
      })
      heard.push(phrase)
      pendingScale = 1
      pendingNegation = false
      index += span - 1
      matchedPhrase = true
      break
    }
    if (matchedPhrase) continue

    const word = words[index]
    if (CONTRAST.has(word)) {
      afterContrast = true
      continue
    }
    if (NEGATIONS.has(word)) {
      pendingNegation = true
      continue
    }
    const up = INTENSIFIERS[word]
    if (up !== undefined) {
      pendingScale *= up
      continue
    }
    const down = DIMINISHERS[word]
    if (down !== undefined) {
      pendingScale *= down
      continue
    }
    if (NOISE.has(word)) continue

    const found = lookUp(word)
    if (!found) {
      pendingScale = 1
      pendingNegation = false
      continue
    }

    let vec = scaleFromNeutral(found.vec, pendingScale)
    if (pendingNegation) vec = invert(vec)
    tokens.push({
      word,
      vec,
      confidence: found.confidence,
      // What follows a "but" is the point of the sentence.
      weight: (afterContrast ? 2.2 : 1) * (0.3 + found.confidence),
    })
    heard.push(word)
    pendingScale = 1
    pendingNegation = false
  }

  if (tokens.length === 0) {
    // Nothing recognised. Rather than refusing, treat the text itself as the
    // instruction: the seed still makes it a specific, repeatable piece, and
    // the music simply starts from neutral.
    return {
      text: raw,
      expression: { ...NEUTRAL },
      valence: 0.5,
      arousal: 0.4,
      conviction: 0,
      heard: [],
      seed: deriveSeed('mood', raw.toLowerCase()),
    }
  }

  const acc = [0, 0, 0, 0, 0, 0, 0]
  let total = 0
  for (const token of tokens) {
    total += token.weight
    for (let i = 0; i < 7; i++) acc[i] += token.vec[i] * token.weight
  }
  const mean = acc.map((v) => clamp01(v / total))

  const expression: Expression = { ...NEUTRAL }
  EXPRESSION_KEYS.forEach((key, i) => {
    expression[key] = mean[i]
  })

  // Conviction: how far from neutral the answer landed, and how sure the
  // lookups were. A shrug should not produce a dramatic piece.
  const distance = Math.min(1, mean.reduce(
    (sum, v, i) => sum + Math.abs(v - NEUTRAL_VEC[i]), 0,
  ) / 1.9)
  const surety = tokens.reduce((s, t) => s + t.confidence, 0) / tokens.length
  const conviction = clamp01(distance * 0.65 + surety * 0.35)

  return {
    text: raw,
    expression,
    valence: mean[5],
    arousal: mean[6],
    conviction,
    heard,
    // The exact words are the seed, so the same answer is the same piece and a
    // different answer is a different one, however small the difference.
    seed: deriveSeed('mood', raw.toLowerCase().replace(/\s+/g, ' ')),
  }
}

/**
 * Where the music should end up.
 *
 * Not simply "calm": somewhere calmer and warmer than here, by an amount that
 * depends on how far from settled the answer was. Someone who said they were
 * content does not need to be taken anywhere; someone who said they were
 * panicking has a long way to travel, and pretending otherwise by dropping them
 * straight into stillness would ignore what they said.
 */
export function restingPlace(reading: Reading): Expression {
  const e = reading.expression
  // Agitation is the distance worth travelling.
  const agitation = clamp01(e.tension * 0.45 + e.motion * 0.3 + (1 - reading.valence) * 0.25)
  const journey = lerp(0.25, 0.8, agitation)
  return {
    // Brightness and weight move toward the middle: the destination is warmer
    // and more even than either extreme, whichever end you started from.
    brightness: lerp(e.brightness, lerp(e.brightness, 0.56, 0.7), journey),
    weight: lerp(e.weight, lerp(e.weight, 0.46, 0.65), journey),
    // Motion and tension only ever fall. Lerping them toward a fixed restful
    // level would *add* movement to an answer that was already inert — someone
    // who said they felt numb would be given more activity than they asked for.
    // Gentle life in a static piece is the per-instrument random walks' job,
    // not the journey's.
    motion: Math.min(e.motion, lerp(e.motion, 0.2, journey)),
    tension: Math.min(e.tension, lerp(e.tension, 0.08, journey)),
    density: lerp(e.density, lerp(e.density, 0.34, 0.75), journey),
  }
}
