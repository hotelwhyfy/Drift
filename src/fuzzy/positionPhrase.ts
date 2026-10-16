import type { Expression } from '@/fuzzy/expression.ts'
import { NEUTRAL } from '@/fuzzy/expression.ts'
import type { PhraseResult } from '@/fuzzy/types.ts'
import { IGNORED_WORDS } from '@/fuzzy/lexiconData.ts'
import { positionWord } from '@/fuzzy/positionWord.ts'

/**
 * A phrase is the confidence-weighted mean of its words.
 *
 * Weighting by confidence means a phrase like "murky synthesiser" is steered by
 * "murky" — the word the table actually knows — rather than being dragged
 * halfway towards a hash of a word that carries no mood at all.
 */
export function positionPhrase(phrase: string): PhraseResult {
  const words = phrase
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length > 1 && !IGNORED_WORDS.has(w))
  if (words.length === 0) {
    return { expression: { ...NEUTRAL }, matches: [] }
  }
  const matches = words.map(positionWord)
  const acc: Expression = { brightness: 0, weight: 0, motion: 0, tension: 0, density: 0 }
  let total = 0
  for (const m of matches) {
    const w = 0.25 + m.confidence
    total += w
    acc.brightness += m.vector.brightness * w
    acc.weight += m.vector.weight * w
    acc.motion += m.vector.motion * w
    acc.tension += m.vector.tension * w
    acc.density += m.vector.density * w
  }
  return {
    expression: {
      brightness: acc.brightness / total,
      weight: acc.weight / total,
      motion: acc.motion / total,
      tension: acc.tension / total,
      density: acc.density / total,
    },
    matches,
  }
}
