import type { Expression } from '@/fuzzy/expression.ts'
import { NEUTRAL } from '@/fuzzy/expression.ts'
import type { WordMatch } from '@/fuzzy/types.ts'
import type { Vec } from '@/fuzzy/lexiconData.ts'
import { LEXICON } from '@/fuzzy/lexiconData.ts'
import { trigrams } from '@/fuzzy/trigrams.ts'
import { similarity } from '@/fuzzy/similarity.ts'
import { deriveSeed, createRng } from '@/core/rng.ts'

const TRIGRAMS = new Map(Object.keys(LEXICON).map((w) => [w, trigrams(w)] as const))

const toExpression = (v: Vec): Expression => ({
  brightness: v[0], weight: v[1], motion: v[2], tension: v[3], density: v[4],
})

/**
 * Position a single word.
 *
 * Exact hits are exact. Near misses ("shimmery", "murkiness") land next to
 * their neighbours through trigram overlap. Anything genuinely unknown is
 * placed by a hash of the word — arbitrary, but stable and repeatable, which
 * matters more here than being right: typing the same nonsense twice must give
 * the same sound, or the control is not a control.
 */
export function positionWord(word: string): WordMatch {
  const w = word.toLowerCase().replace(/[^a-z]/g, '')
  if (w.length === 0) {
    return { word, confidence: 0, nearest: null, vector: { ...NEUTRAL } }
  }
  const exact = LEXICON[w]
  if (exact) return { word: w, confidence: 1, nearest: w, vector: toExpression(exact) }

  const tri = trigrams(w)
  // Ties go to the earlier word in the table.
  const { word: bestWord, score: bestScore } = [...TRIGRAMS].reduce<{ word: string | null, score: number }>(
    (best, [candidate, candidateTri]) => {
      const score = similarity(tri, candidateTri)
      return score > best.score ? { word: candidate, score } : best
    },
    { word: null, score: 0 },
  )

  const rng = createRng(deriveSeed('word', w))
  const hashed: Expression = {
    brightness: rng(), weight: rng(), motion: rng(), tension: rng() * 0.8, density: rng(),
  }
  if (!bestWord || bestScore < 0.34) {
    return { word: w, confidence: bestScore, nearest: bestWord, vector: hashed }
  }
  // Blend towards the neighbour in proportion to how sure the match is, so a
  // near-synonym is nudged rather than snapped and two similar coinages do not
  // collapse onto exactly the same sound.
  const near = toExpression(LEXICON[bestWord])
  const t = Math.min(1, bestScore * 1.15)
  const blended: Expression = {
    brightness: hashed.brightness + (near.brightness - hashed.brightness) * t,
    weight: hashed.weight + (near.weight - hashed.weight) * t,
    motion: hashed.motion + (near.motion - hashed.motion) * t,
    tension: hashed.tension + (near.tension - hashed.tension) * t,
    density: hashed.density + (near.density - hashed.density) * t,
  }
  return { word: w, confidence: bestScore, nearest: bestWord, vector: blended }
}
