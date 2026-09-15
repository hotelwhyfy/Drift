import type { Expression } from './expression.ts'
import { NEUTRAL } from './expression.ts'
import { deriveSeed, createRng } from '../core/rng.ts'

/**
 * Words as positions in the expression space.
 *
 * Deliberately a curated table rather than a learned embedding: it runs
 * offline, it is deterministic (so a captured piece can be reproduced from its
 * seed and its words), and — most importantly — it is *editable*. When "brittle"
 * sounds wrong you fix one line. Every entry is
 * [brightness, weight, motion, tension, density].
 */
type Vec = readonly [number, number, number, number, number]

const LEXICON: Record<string, Vec> = {
  // ── brightness ──────────────────────────────────────────────────────────
  dark: [0.08, 0.66, 0.3, 0.55, 0.45],
  murky: [0.12, 0.7, 0.35, 0.55, 0.6],
  dim: [0.2, 0.5, 0.25, 0.45, 0.35],
  shadowy: [0.15, 0.55, 0.4, 0.62, 0.45],
  dusky: [0.26, 0.5, 0.3, 0.42, 0.45],
  smoky: [0.24, 0.56, 0.35, 0.48, 0.55],
  warm: [0.46, 0.55, 0.3, 0.25, 0.5],
  amber: [0.55, 0.5, 0.28, 0.24, 0.48],
  honey: [0.58, 0.46, 0.26, 0.2, 0.5],
  golden: [0.7, 0.44, 0.3, 0.2, 0.5],
  bright: [0.84, 0.35, 0.45, 0.3, 0.5],
  glassy: [0.88, 0.22, 0.4, 0.38, 0.35],
  crystal: [0.92, 0.2, 0.42, 0.35, 0.32],
  crystalline: [0.93, 0.2, 0.4, 0.36, 0.3],
  luminous: [0.9, 0.3, 0.38, 0.22, 0.45],
  radiant: [0.94, 0.34, 0.45, 0.24, 0.55],
  silver: [0.8, 0.3, 0.4, 0.34, 0.4],
  pale: [0.72, 0.28, 0.28, 0.35, 0.3],
  neon: [0.86, 0.4, 0.66, 0.5, 0.6],
  sepia: [0.42, 0.52, 0.24, 0.32, 0.44],

  // ── weight ──────────────────────────────────────────────────────────────
  weightless: [0.72, 0.06, 0.35, 0.2, 0.28],
  airy: [0.72, 0.12, 0.36, 0.2, 0.3],
  feathery: [0.7, 0.1, 0.4, 0.22, 0.28],
  light: [0.68, 0.18, 0.4, 0.25, 0.35],
  floating: [0.66, 0.14, 0.3, 0.18, 0.32],
  hovering: [0.62, 0.16, 0.28, 0.24, 0.3],
  grounded: [0.4, 0.68, 0.24, 0.3, 0.5],
  solid: [0.38, 0.75, 0.22, 0.32, 0.55],
  heavy: [0.22, 0.9, 0.25, 0.5, 0.6],
  leaden: [0.14, 0.94, 0.18, 0.55, 0.55],
  massive: [0.3, 0.95, 0.3, 0.45, 0.7],
  deep: [0.22, 0.82, 0.22, 0.35, 0.5],
  sunken: [0.14, 0.86, 0.18, 0.45, 0.45],
  subterranean: [0.1, 0.9, 0.2, 0.5, 0.5],

  // ── motion ──────────────────────────────────────────────────────────────
  still: [0.4, 0.5, 0.03, 0.2, 0.28],
  frozen: [0.6, 0.55, 0.02, 0.4, 0.22],
  motionless: [0.42, 0.52, 0.02, 0.22, 0.25],
  static: [0.45, 0.5, 0.05, 0.35, 0.4],
  suspended: [0.55, 0.35, 0.08, 0.3, 0.3],
  drifting: [0.5, 0.35, 0.3, 0.2, 0.35],
  breathing: [0.5, 0.42, 0.4, 0.22, 0.42],
  swaying: [0.52, 0.45, 0.5, 0.25, 0.45],
  rolling: [0.48, 0.55, 0.6, 0.3, 0.55],
  restless: [0.55, 0.45, 0.82, 0.6, 0.6],
  churning: [0.35, 0.7, 0.88, 0.7, 0.72],
  frantic: [0.7, 0.45, 0.96, 0.85, 0.8],
  turbulent: [0.42, 0.65, 0.9, 0.75, 0.75],
  shimmering: [0.86, 0.22, 0.62, 0.3, 0.5],
  flickering: [0.78, 0.25, 0.72, 0.45, 0.45],
  pulsing: [0.55, 0.6, 0.66, 0.42, 0.6],

  // ── tension ─────────────────────────────────────────────────────────────
  serene: [0.6, 0.32, 0.15, 0.05, 0.3],
  peaceful: [0.58, 0.35, 0.18, 0.06, 0.32],
  calm: [0.52, 0.4, 0.15, 0.08, 0.35],
  gentle: [0.58, 0.32, 0.25, 0.12, 0.35],
  tender: [0.6, 0.34, 0.28, 0.16, 0.38],
  soft: [0.55, 0.3, 0.24, 0.14, 0.36],
  wistful: [0.44, 0.42, 0.3, 0.42, 0.4],
  melancholy: [0.3, 0.5, 0.26, 0.52, 0.42],
  bittersweet: [0.48, 0.45, 0.32, 0.46, 0.45],
  yearning: [0.5, 0.45, 0.42, 0.62, 0.48],
  aching: [0.38, 0.55, 0.38, 0.7, 0.45],
  longing: [0.46, 0.44, 0.36, 0.6, 0.42],
  tense: [0.42, 0.55, 0.6, 0.86, 0.55],
  anxious: [0.5, 0.45, 0.75, 0.88, 0.6],
  brooding: [0.16, 0.72, 0.3, 0.75, 0.5],
  ominous: [0.1, 0.8, 0.35, 0.88, 0.55],
  uneasy: [0.35, 0.55, 0.55, 0.78, 0.5],
  haunted: [0.24, 0.55, 0.42, 0.74, 0.45],

  // ── density ─────────────────────────────────────────────────────────────
  empty: [0.45, 0.3, 0.1, 0.3, 0.02],
  bare: [0.5, 0.35, 0.15, 0.28, 0.08],
  sparse: [0.5, 0.35, 0.2, 0.25, 0.14],
  minimal: [0.55, 0.32, 0.18, 0.22, 0.1],
  spacious: [0.6, 0.3, 0.22, 0.16, 0.22],
  open: [0.68, 0.32, 0.3, 0.18, 0.3],
  full: [0.55, 0.6, 0.45, 0.35, 0.75],
  lush: [0.62, 0.5, 0.42, 0.24, 0.85],
  dense: [0.42, 0.66, 0.5, 0.45, 0.9],
  thick: [0.32, 0.75, 0.42, 0.45, 0.88],
  crowded: [0.5, 0.6, 0.7, 0.6, 0.95],
  swarming: [0.6, 0.5, 0.88, 0.65, 0.97],
  layered: [0.55, 0.55, 0.4, 0.3, 0.8],

  // ── evocative ───────────────────────────────────────────────────────────
  rain: [0.5, 0.35, 0.55, 0.2, 0.6],
  drizzle: [0.52, 0.3, 0.45, 0.2, 0.5],
  storm: [0.3, 0.75, 0.92, 0.8, 0.85],
  fog: [0.38, 0.4, 0.2, 0.28, 0.4],
  mist: [0.55, 0.28, 0.24, 0.2, 0.35],
  haze: [0.5, 0.35, 0.22, 0.24, 0.42],
  dusk: [0.3, 0.48, 0.24, 0.32, 0.42],
  dawn: [0.72, 0.34, 0.3, 0.2, 0.4],
  midnight: [0.12, 0.6, 0.2, 0.45, 0.35],
  noon: [0.9, 0.4, 0.4, 0.2, 0.5],
  moonlight: [0.66, 0.24, 0.2, 0.28, 0.3],
  starlight: [0.82, 0.16, 0.26, 0.22, 0.25],
  ocean: [0.34, 0.72, 0.48, 0.28, 0.55],
  tide: [0.36, 0.68, 0.42, 0.26, 0.5],
  glacier: [0.75, 0.8, 0.1, 0.4, 0.35],
  frost: [0.8, 0.4, 0.16, 0.38, 0.28],
  snow: [0.78, 0.34, 0.22, 0.2, 0.35],
  ash: [0.28, 0.5, 0.24, 0.42, 0.4],
  ember: [0.55, 0.55, 0.35, 0.32, 0.4],
  embers: [0.55, 0.55, 0.35, 0.32, 0.4],
  cinder: [0.3, 0.58, 0.3, 0.45, 0.4],
  moss: [0.36, 0.5, 0.18, 0.16, 0.5],
  forest: [0.34, 0.55, 0.3, 0.24, 0.62],
  velvet: [0.34, 0.55, 0.2, 0.18, 0.55],
  linen: [0.66, 0.3, 0.22, 0.16, 0.35],
  paper: [0.6, 0.24, 0.3, 0.28, 0.3],
  dust: [0.38, 0.42, 0.26, 0.3, 0.42],
  tape: [0.36, 0.5, 0.34, 0.28, 0.48],
  vinyl: [0.4, 0.5, 0.3, 0.26, 0.5],
  cassette: [0.34, 0.48, 0.34, 0.3, 0.48],
  cathedral: [0.62, 0.62, 0.16, 0.34, 0.5],
  chapel: [0.6, 0.5, 0.16, 0.28, 0.4],
  submarine: [0.16, 0.85, 0.2, 0.5, 0.42],
  cavern: [0.2, 0.75, 0.18, 0.42, 0.4],
  attic: [0.42, 0.42, 0.2, 0.35, 0.35],
  library: [0.5, 0.42, 0.14, 0.2, 0.35],
  garden: [0.66, 0.4, 0.36, 0.16, 0.62],
  meadow: [0.72, 0.34, 0.32, 0.14, 0.55],
  desert: [0.74, 0.5, 0.18, 0.34, 0.22],
  tundra: [0.7, 0.6, 0.12, 0.38, 0.2],
  city: [0.55, 0.55, 0.7, 0.55, 0.75],
  rooftop: [0.68, 0.4, 0.4, 0.32, 0.42],
  train: [0.4, 0.62, 0.66, 0.42, 0.6],
  sleep: [0.4, 0.35, 0.08, 0.08, 0.25],
  dream: [0.6, 0.25, 0.3, 0.22, 0.4],
  memory: [0.44, 0.42, 0.24, 0.42, 0.4],
  nostalgia: [0.46, 0.46, 0.26, 0.45, 0.45],
  autumn: [0.44, 0.5, 0.3, 0.4, 0.5],
  winter: [0.6, 0.6, 0.18, 0.42, 0.32],
  spring: [0.76, 0.34, 0.44, 0.2, 0.55],
  summer: [0.82, 0.42, 0.38, 0.2, 0.55],
  rust: [0.3, 0.6, 0.24, 0.45, 0.45],
  copper: [0.55, 0.58, 0.3, 0.32, 0.45],
  brittle: [0.75, 0.25, 0.55, 0.6, 0.35],
  fragile: [0.68, 0.2, 0.4, 0.5, 0.28],
  hollow: [0.4, 0.4, 0.2, 0.45, 0.22],
  wide: [0.6, 0.45, 0.24, 0.2, 0.4],
  narrow: [0.45, 0.4, 0.3, 0.45, 0.3],
  slow: [0.44, 0.55, 0.1, 0.22, 0.35],
  fast: [0.62, 0.42, 0.88, 0.55, 0.7],
  patient: [0.5, 0.48, 0.12, 0.14, 0.32],
  urgent: [0.58, 0.5, 0.9, 0.8, 0.7],
}

const WORDS = Object.keys(LEXICON)

/** Character trigrams, for matching words the table has never seen. */
function trigrams(word: string): Set<string> {
  const padded = `  ${word}  `
  const out = new Set<string>()
  for (let i = 0; i < padded.length - 2; i++) out.add(padded.slice(i, i + 3))
  return out
}

const TRIGRAMS = new Map(WORDS.map((w) => [w, trigrams(w)] as const))

function similarity(a: Set<string>, b: Set<string>): number {
  let shared = 0
  for (const t of a) if (b.has(t)) shared++
  return shared / Math.max(1, Math.min(a.size, b.size))
}

export interface WordMatch {
  readonly word: string
  /** 0..1. Low confidence means the position came mostly from the hash. */
  readonly confidence: number
  readonly nearest: string | null
  readonly vector: Expression
}

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
  let bestWord: string | null = null
  let bestScore = 0
  for (const [candidate, candidateTri] of TRIGRAMS) {
    const s = similarity(tri, candidateTri)
    if (s > bestScore) { bestScore = s; bestWord = candidate }
  }

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

export interface PhraseResult {
  readonly expression: Expression
  readonly matches: readonly WordMatch[]
}

/** Stop words carry no sonic meaning and would drag every phrase to the middle. */
const IGNORED = new Set([
  'a', 'an', 'the', 'of', 'and', 'or', 'in', 'on', 'at', 'to', 'is', 'it',
  'with', 'like', 'very', 'some', 'that', 'this', 'as', 'but', 'for', 'so',
])

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
    .filter((w) => w.length > 1 && !IGNORED.has(w))
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

/** Words the interface can suggest. */
export const SUGGESTIONS: readonly string[] = [
  'murky', 'glassy', 'weightless', 'brooding', 'lush', 'frozen', 'honey',
  'restless', 'cathedral', 'submarine', 'moonlight', 'rust', 'drifting',
]

export const LEXICON_SIZE = WORDS.length
