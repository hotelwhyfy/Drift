/**
 * Feeling words.
 *
 * A separate table from `src/fuzzy/lexicon.ts`, which holds *sonic* descriptors
 * — glassy, murky, weightless. That one answers "what should this sound like";
 * this one answers "how are you". They are consulted together, because the
 * opening question rotates between asking both.
 *
 * Each entry carries the five expression dimensions plus valence and arousal.
 * Valence and arousal are the two axes almost all affect research agrees on,
 * and they are what the journey needs: how far the music should travel, and in
 * which direction, is a question about those two rather than about timbre.
 *
 *   [brightness, weight, motion, tension, density, valence, arousal]
 *
 * valence 0 = unpleasant, 1 = pleasant.  arousal 0 = inert, 1 = activated.
 */
export type MoodVec = readonly [number, number, number, number, number, number, number]

export const MOOD_WORDS: Record<string, MoodVec> = {
  // ── depleted ────────────────────────────────────────────────────────────
  tired: [0.32, 0.7, 0.16, 0.3, 0.3, 0.36, 0.12],
  exhausted: [0.22, 0.85, 0.08, 0.35, 0.22, 0.24, 0.05],
  drained: [0.24, 0.8, 0.1, 0.34, 0.24, 0.26, 0.07],
  weary: [0.3, 0.75, 0.14, 0.34, 0.28, 0.3, 0.1],
  spent: [0.26, 0.8, 0.1, 0.3, 0.24, 0.3, 0.06],
  knackered: [0.24, 0.82, 0.1, 0.32, 0.24, 0.28, 0.06],
  sleepy: [0.4, 0.6, 0.08, 0.16, 0.26, 0.55, 0.05],
  foggy: [0.34, 0.56, 0.14, 0.34, 0.34, 0.4, 0.14],
  sluggish: [0.28, 0.78, 0.12, 0.3, 0.3, 0.34, 0.1],
  worn: [0.3, 0.74, 0.15, 0.32, 0.28, 0.32, 0.1],
  burnt: [0.24, 0.78, 0.2, 0.56, 0.3, 0.2, 0.18],

  // ── low ─────────────────────────────────────────────────────────────────
  sad: [0.22, 0.6, 0.18, 0.48, 0.34, 0.2, 0.22],
  low: [0.24, 0.62, 0.16, 0.44, 0.3, 0.24, 0.18],
  down: [0.24, 0.64, 0.18, 0.44, 0.32, 0.24, 0.2],
  blue: [0.3, 0.55, 0.2, 0.42, 0.34, 0.3, 0.22],
  grieving: [0.16, 0.78, 0.16, 0.6, 0.3, 0.12, 0.24],
  heartbroken: [0.18, 0.75, 0.24, 0.68, 0.34, 0.1, 0.34],
  lonely: [0.28, 0.55, 0.16, 0.5, 0.16, 0.2, 0.2],
  homesick: [0.34, 0.55, 0.2, 0.5, 0.3, 0.26, 0.24],
  empty: [0.4, 0.42, 0.08, 0.38, 0.06, 0.3, 0.1],
  hollow: [0.38, 0.45, 0.1, 0.44, 0.1, 0.26, 0.12],
  numb: [0.35, 0.6, 0.06, 0.4, 0.14, 0.3, 0.08],
  flat: [0.38, 0.55, 0.1, 0.34, 0.24, 0.36, 0.12],
  stuck: [0.3, 0.72, 0.1, 0.52, 0.28, 0.26, 0.24],

  // ── activated, unpleasant ───────────────────────────────────────────────
  anxious: [0.5, 0.45, 0.8, 0.9, 0.6, 0.18, 0.85],
  nervous: [0.55, 0.4, 0.72, 0.82, 0.55, 0.26, 0.76],
  worried: [0.42, 0.5, 0.6, 0.82, 0.5, 0.22, 0.65],
  tense: [0.42, 0.55, 0.62, 0.88, 0.55, 0.2, 0.75],
  wired: [0.66, 0.38, 0.9, 0.78, 0.68, 0.34, 0.95],
  jittery: [0.62, 0.35, 0.92, 0.8, 0.62, 0.28, 0.92],
  panicky: [0.55, 0.42, 0.95, 0.96, 0.7, 0.1, 0.97],
  overwhelmed: [0.4, 0.62, 0.82, 0.9, 0.9, 0.14, 0.82],
  frazzled: [0.5, 0.5, 0.85, 0.82, 0.78, 0.2, 0.84],
  scattered: [0.55, 0.4, 0.86, 0.68, 0.72, 0.3, 0.78],
  restless: [0.55, 0.44, 0.84, 0.6, 0.6, 0.38, 0.78],
  frustrated: [0.42, 0.62, 0.74, 0.82, 0.62, 0.2, 0.74],
  angry: [0.38, 0.76, 0.86, 0.92, 0.72, 0.12, 0.92],
  irritable: [0.45, 0.6, 0.72, 0.78, 0.6, 0.22, 0.7],
  bitter: [0.26, 0.68, 0.46, 0.76, 0.5, 0.16, 0.5],
  rushed: [0.58, 0.45, 0.9, 0.72, 0.72, 0.3, 0.88],
  busy: [0.55, 0.48, 0.82, 0.58, 0.8, 0.42, 0.8],
  stretched: [0.44, 0.6, 0.72, 0.74, 0.7, 0.24, 0.72],

  // ── settled ─────────────────────────────────────────────────────────────
  calm: [0.55, 0.42, 0.14, 0.08, 0.34, 0.82, 0.16],
  peaceful: [0.6, 0.38, 0.16, 0.06, 0.32, 0.88, 0.14],
  settled: [0.54, 0.46, 0.16, 0.1, 0.36, 0.82, 0.18],
  steady: [0.52, 0.52, 0.22, 0.12, 0.42, 0.78, 0.26],
  grounded: [0.46, 0.6, 0.18, 0.12, 0.42, 0.8, 0.22],
  serene: [0.62, 0.34, 0.14, 0.04, 0.3, 0.9, 0.12],
  relaxed: [0.58, 0.4, 0.18, 0.08, 0.34, 0.86, 0.18],
  quiet: [0.5, 0.4, 0.12, 0.14, 0.16, 0.7, 0.12],
  still: [0.46, 0.46, 0.04, 0.16, 0.2, 0.68, 0.06],
  rested: [0.6, 0.42, 0.2, 0.08, 0.38, 0.86, 0.24],

  // ── pleasant ────────────────────────────────────────────────────────────
  happy: [0.8, 0.36, 0.5, 0.12, 0.6, 0.92, 0.6],
  content: [0.62, 0.42, 0.28, 0.1, 0.45, 0.86, 0.3],
  glad: [0.74, 0.38, 0.42, 0.12, 0.52, 0.86, 0.48],
  cheerful: [0.82, 0.34, 0.56, 0.12, 0.6, 0.9, 0.62],
  light: [0.74, 0.2, 0.42, 0.14, 0.38, 0.82, 0.44],
  buoyant: [0.8, 0.24, 0.58, 0.12, 0.52, 0.88, 0.62],
  grateful: [0.68, 0.42, 0.28, 0.1, 0.48, 0.9, 0.32],
  hopeful: [0.75, 0.36, 0.4, 0.24, 0.45, 0.8, 0.48],
  warm: [0.6, 0.5, 0.26, 0.14, 0.5, 0.84, 0.28],
  soft: [0.58, 0.34, 0.22, 0.12, 0.36, 0.8, 0.2],
  tender: [0.6, 0.36, 0.28, 0.2, 0.4, 0.76, 0.28],
  fine: [0.55, 0.46, 0.3, 0.22, 0.42, 0.62, 0.34],
  ok: [0.54, 0.46, 0.3, 0.24, 0.42, 0.58, 0.34],
  okay: [0.54, 0.46, 0.3, 0.24, 0.42, 0.58, 0.34],
  alright: [0.56, 0.45, 0.3, 0.22, 0.44, 0.62, 0.34],
  good: [0.7, 0.4, 0.4, 0.16, 0.5, 0.82, 0.46],
  great: [0.82, 0.36, 0.55, 0.12, 0.58, 0.92, 0.62],
  meh: [0.44, 0.52, 0.22, 0.3, 0.34, 0.42, 0.22],

  // ── activated, pleasant ─────────────────────────────────────────────────
  excited: [0.85, 0.34, 0.8, 0.3, 0.72, 0.86, 0.9],
  energised: [0.82, 0.38, 0.82, 0.24, 0.7, 0.85, 0.9],
  energized: [0.82, 0.38, 0.82, 0.24, 0.7, 0.85, 0.9],
  playful: [0.8, 0.32, 0.74, 0.2, 0.64, 0.86, 0.76],
  curious: [0.72, 0.36, 0.6, 0.3, 0.55, 0.76, 0.6],
  inspired: [0.82, 0.36, 0.64, 0.24, 0.62, 0.86, 0.7],
  motivated: [0.7, 0.45, 0.66, 0.28, 0.6, 0.8, 0.72],
  focused: [0.62, 0.5, 0.45, 0.3, 0.45, 0.72, 0.55],
  alert: [0.75, 0.4, 0.6, 0.35, 0.52, 0.7, 0.72],
  sharp: [0.8, 0.36, 0.6, 0.4, 0.5, 0.68, 0.7],
  clear: [0.75, 0.38, 0.38, 0.16, 0.42, 0.8, 0.42],

  // ── reflective ──────────────────────────────────────────────────────────
  nostalgic: [0.46, 0.5, 0.24, 0.42, 0.45, 0.5, 0.26],
  wistful: [0.44, 0.44, 0.28, 0.44, 0.4, 0.44, 0.28],
  reflective: [0.5, 0.48, 0.22, 0.3, 0.38, 0.6, 0.24],
  pensive: [0.44, 0.52, 0.2, 0.38, 0.36, 0.5, 0.24],
  thoughtful: [0.52, 0.48, 0.26, 0.28, 0.4, 0.66, 0.3],
  sentimental: [0.52, 0.48, 0.26, 0.38, 0.46, 0.58, 0.3],
  melancholy: [0.3, 0.52, 0.24, 0.5, 0.42, 0.34, 0.24],
  bittersweet: [0.48, 0.46, 0.3, 0.44, 0.46, 0.5, 0.32],
  longing: [0.46, 0.46, 0.34, 0.6, 0.42, 0.36, 0.38],
  heavy: [0.24, 0.86, 0.2, 0.5, 0.5, 0.26, 0.24],
  fragile: [0.66, 0.24, 0.38, 0.52, 0.28, 0.36, 0.38],
  raw: [0.4, 0.58, 0.5, 0.66, 0.45, 0.28, 0.55],
  vulnerable: [0.56, 0.32, 0.36, 0.56, 0.3, 0.36, 0.38],
  lost: [0.32, 0.55, 0.3, 0.55, 0.28, 0.26, 0.32],
  blank: [0.42, 0.5, 0.08, 0.32, 0.12, 0.4, 0.1],
  fuzzy: [0.4, 0.5, 0.2, 0.3, 0.36, 0.48, 0.2],
  strange: [0.5, 0.48, 0.45, 0.55, 0.42, 0.42, 0.45],
  hungover: [0.26, 0.76, 0.14, 0.44, 0.3, 0.24, 0.12],
  ill: [0.3, 0.72, 0.14, 0.44, 0.26, 0.22, 0.14],
  sore: [0.34, 0.7, 0.18, 0.44, 0.3, 0.3, 0.2],
  long: [0.36, 0.64, 0.24, 0.38, 0.4, 0.38, 0.24],
  blur: [0.44, 0.52, 0.5, 0.42, 0.55, 0.42, 0.5],
  usual: [0.5, 0.5, 0.32, 0.3, 0.44, 0.55, 0.34],
  nothing: [0.44, 0.44, 0.08, 0.26, 0.08, 0.5, 0.08],
  everything: [0.5, 0.62, 0.7, 0.6, 0.9, 0.38, 0.7],

  // ── weather and places, which the rotating questions invite ─────────────
  cold: [0.66, 0.5, 0.2, 0.42, 0.28, 0.42, 0.24],
  freezing: [0.72, 0.56, 0.16, 0.5, 0.24, 0.34, 0.22],
  overcast: [0.3, 0.58, 0.16, 0.36, 0.42, 0.42, 0.18],
  cloudy: [0.36, 0.54, 0.2, 0.32, 0.42, 0.46, 0.2],
  grey: [0.28, 0.56, 0.16, 0.36, 0.38, 0.38, 0.16],
  gray: [0.28, 0.56, 0.16, 0.36, 0.38, 0.38, 0.16],
  sunny: [0.88, 0.32, 0.5, 0.1, 0.55, 0.92, 0.6],
  bright: [0.86, 0.34, 0.5, 0.16, 0.52, 0.86, 0.58],
  dark: [0.1, 0.66, 0.24, 0.5, 0.42, 0.34, 0.24],
  stormy: [0.3, 0.76, 0.9, 0.82, 0.85, 0.2, 0.9],
  thunder: [0.28, 0.82, 0.85, 0.8, 0.82, 0.24, 0.88],
  windy: [0.55, 0.45, 0.78, 0.5, 0.6, 0.45, 0.72],
  sea: [0.36, 0.7, 0.44, 0.24, 0.55, 0.72, 0.36],
  ocean: [0.34, 0.72, 0.46, 0.26, 0.55, 0.72, 0.38],
  sky: [0.78, 0.26, 0.3, 0.18, 0.3, 0.78, 0.32],
  home: [0.54, 0.5, 0.2, 0.14, 0.44, 0.82, 0.2],
  nowhere: [0.36, 0.52, 0.1, 0.36, 0.1, 0.4, 0.1],
  company: [0.66, 0.44, 0.44, 0.2, 0.62, 0.78, 0.46],
  space: [0.62, 0.3, 0.2, 0.2, 0.18, 0.7, 0.2],
  room: [0.5, 0.5, 0.2, 0.2, 0.4, 0.68, 0.22],
  much: [0.48, 0.58, 0.6, 0.55, 0.72, 0.36, 0.6],
  lot: [0.46, 0.62, 0.62, 0.58, 0.78, 0.34, 0.64],
  unfinished: [0.4, 0.6, 0.5, 0.6, 0.48, 0.34, 0.5],
  news: [0.66, 0.44, 0.5, 0.35, 0.5, 0.62, 0.52],
  think: [0.55, 0.45, 0.25, 0.28, 0.32, 0.62, 0.28],
  woken: [0.8, 0.34, 0.72, 0.3, 0.6, 0.72, 0.8],
  awake: [0.74, 0.38, 0.6, 0.3, 0.52, 0.68, 0.7],
}

/** Scale the distance a word travels from neutral. */
export const INTENSIFIERS: Record<string, number> = {
  very: 1.45, really: 1.4, so: 1.35, extremely: 1.7, incredibly: 1.6,
  utterly: 1.7, completely: 1.6, totally: 1.5, deeply: 1.5, quite: 1.15,
  pretty: 1.15, too: 1.4, unbelievably: 1.6, absolutely: 1.55, properly: 1.35,
}

export const DIMINISHERS: Record<string, number> = {
  slightly: 0.55, bit: 0.6, little: 0.6, somewhat: 0.7, mildly: 0.6,
  kinda: 0.7, kind: 0.75, sort: 0.75, barely: 0.4, vaguely: 0.5,
  faintly: 0.5, mostly: 0.85, fairly: 0.8,
}

export const NEGATIONS = new Set([
  'not', 'no', "n't", 'never', 'without', 'hardly', 'neither', 'nor', 'isnt',
  "isn't", 'dont', "don't", 'cant', "can't", 'wasnt', "wasn't",
])
// "nothing" is deliberately absent: asked how they are, far more people mean
// it as the answer ("nothing much") than as a negation.

/**
 * Words that flip the weight of a sentence onto what follows them.
 *
 * "Tired but hopeful" is a statement about hopefulness with tiredness as
 * context; taking the plain average would land halfway and describe neither.
 */
export const CONTRAST = new Set(['but', 'though', 'although', 'however', 'yet', 'still'])

/**
 * Multi-word answers, matched before single words.
 *
 * People answer these questions in phrases far more than in adjectives, and
 * several of the commonest ones mean the opposite of their parts: "too much" is
 * not an intensified "much", and "not bad" is not the negation of "bad".
 */
export const MOOD_PHRASES: Record<string, MoodVec> = {
  'too much': [0.42, 0.66, 0.8, 0.82, 0.9, 0.18, 0.82],
  'not much': [0.48, 0.46, 0.16, 0.24, 0.16, 0.56, 0.16],
  'nothing much': [0.48, 0.46, 0.14, 0.22, 0.14, 0.58, 0.14],
  'a lot': [0.44, 0.66, 0.7, 0.65, 0.85, 0.28, 0.72],
  'not bad': [0.62, 0.44, 0.34, 0.18, 0.45, 0.72, 0.36],
  'not great': [0.34, 0.6, 0.3, 0.52, 0.38, 0.28, 0.3],
  'burnt out': [0.22, 0.82, 0.16, 0.56, 0.26, 0.18, 0.14],
  'burned out': [0.22, 0.82, 0.16, 0.56, 0.26, 0.18, 0.14],
  'worn out': [0.26, 0.8, 0.12, 0.34, 0.26, 0.28, 0.08],
  'wiped out': [0.24, 0.82, 0.1, 0.32, 0.24, 0.26, 0.06],
  'on edge': [0.5, 0.45, 0.82, 0.9, 0.6, 0.2, 0.86],
  'fed up': [0.36, 0.66, 0.5, 0.7, 0.55, 0.2, 0.52],
  'stressed out': [0.42, 0.58, 0.8, 0.88, 0.7, 0.16, 0.84],
  'over it': [0.38, 0.6, 0.4, 0.58, 0.45, 0.28, 0.42],
  'all over the place': [0.55, 0.45, 0.92, 0.7, 0.85, 0.3, 0.85],
  'up and down': [0.5, 0.5, 0.72, 0.55, 0.6, 0.42, 0.62],
  'so so': [0.48, 0.5, 0.28, 0.32, 0.4, 0.48, 0.3],
  'could be worse': [0.55, 0.5, 0.3, 0.28, 0.44, 0.6, 0.32],
  'better than expected': [0.72, 0.4, 0.42, 0.18, 0.5, 0.82, 0.46],
  'the usual': [0.5, 0.5, 0.32, 0.3, 0.44, 0.55, 0.34],
  'by the sea': [0.36, 0.7, 0.44, 0.22, 0.55, 0.76, 0.34],
  'a warm room': [0.56, 0.52, 0.18, 0.1, 0.46, 0.86, 0.2],
  'space to think': [0.6, 0.34, 0.2, 0.18, 0.2, 0.74, 0.22],
  'something steady': [0.5, 0.54, 0.3, 0.14, 0.46, 0.76, 0.34],
  'a slow pulse': [0.42, 0.6, 0.3, 0.16, 0.45, 0.72, 0.34],
  'wide and open': [0.66, 0.3, 0.24, 0.14, 0.28, 0.84, 0.26],
  'still air': [0.52, 0.4, 0.06, 0.14, 0.2, 0.74, 0.08],
  'the empty kind': [0.46, 0.38, 0.08, 0.26, 0.06, 0.55, 0.08],
  'deep quiet': [0.4, 0.55, 0.06, 0.12, 0.14, 0.76, 0.08],
  'warm quiet': [0.56, 0.5, 0.12, 0.1, 0.3, 0.86, 0.14],
  'busy quiet': [0.56, 0.42, 0.5, 0.26, 0.6, 0.66, 0.46],
  'not over yet': [0.38, 0.62, 0.44, 0.52, 0.5, 0.34, 0.46],
}

/** Longest phrase, in words. Bounds the lookahead when matching. */
export const MAX_PHRASE_WORDS = 4
