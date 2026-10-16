import type { ExpressionKey } from '@/fuzzy/expression.ts'
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
  const weights = matches.map((m) => 0.25 + m.confidence)
  const total = weights.reduce((sum, w) => sum + w, 0)
  const mean = (key: ExpressionKey): number =>
    matches.reduce((sum, m, i) => sum + m.vector[key] * weights[i], 0) / total
  return {
    expression: {
      brightness: mean('brightness'),
      weight: mean('weight'),
      motion: mean('motion'),
      tension: mean('tension'),
      density: mean('density'),
    },
    matches,
  }
}
