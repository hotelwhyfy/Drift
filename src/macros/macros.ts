/**
 * The six dials.
 *
 * Chosen so that each one moves something the ear names independently. Two
 * controls that both mostly change brightness would feel redundant however
 * different their implementations are, so the axes are picked perceptually
 * first and mapped to parameters second.
 */
export interface Macros {
  /** Clean and glassy → dusty tape and worn vinyl. */
  warmth: number
  /** Dark and modal → luminous and open. Moves harmony and timbre together. */
  colour: number
  /** Close and dry → vast and distant. */
  space: number
  /** Beatless drone → a moving, defined pulse. Tempo, swing, and the kit if one is loaded. */
  pulse: number
  /** Sparse and single-voiced → lush and layered. */
  density: number
  /** Hypnotically static → restlessly evolving. */
  drift: number
}

export const MACRO_KEYS = ['warmth', 'colour', 'space', 'pulse', 'density', 'drift'] as const
export type MacroKey = (typeof MACRO_KEYS)[number]

export interface MacroInfo {
  readonly key: MacroKey
  readonly label: string
  /** What the two ends of the travel sound like. Shown in the UI. */
  readonly low: string
  readonly high: string
}

export const MACRO_INFO: readonly MacroInfo[] = [
  { key: 'warmth', label: 'Warmth', low: 'clean', high: 'dust' },
  { key: 'colour', label: 'Colour', low: 'dark', high: 'lumen' },
  { key: 'space', label: 'Space', low: 'close', high: 'vast' },
  { key: 'pulse', label: 'Pulse', low: 'still', high: 'moving' },
  { key: 'density', label: 'Density', low: 'sparse', high: 'lush' },
  { key: 'drift', label: 'Drift', low: 'held', high: 'restless' },
]

export const DEFAULT_MACROS: Macros = {
  warmth: 0.62,
  colour: 0.38,
  space: 0.55,
  pulse: 0.42,
  density: 0.45,
  drift: 0.35,
}

/**
 * Starting points, not presets in the usual sense — each is just a position in
 * the same continuous space, so a scene is somewhere to begin dialling from
 * rather than a destination.
 */
export interface Scene {
  readonly name: string
  readonly macros: Macros
}

export const SCENES: readonly Scene[] = [
  { name: 'Study', macros: { warmth: 0.66, colour: 0.42, space: 0.44, pulse: 0.55, density: 0.5, drift: 0.3 } },
  { name: 'Rain', macros: { warmth: 0.72, colour: 0.22, space: 0.62, pulse: 0.22, density: 0.38, drift: 0.24 } },
  { name: 'Drift', macros: { warmth: 0.5, colour: 0.6, space: 0.86, pulse: 0.0, density: 0.34, drift: 0.5 } },
  { name: 'Dusk', macros: { warmth: 0.82, colour: 0.16, space: 0.55, pulse: 0.4, density: 0.58, drift: 0.2 } },
  { name: 'Bloom', macros: { warmth: 0.34, colour: 0.88, space: 0.7, pulse: 0.18, density: 0.62, drift: 0.62 } },
  { name: 'Tape', macros: { warmth: 0.95, colour: 0.3, space: 0.34, pulse: 0.62, density: 0.55, drift: 0.42 } },
  { name: 'Void', macros: { warmth: 0.44, colour: 0.06, space: 1.0, pulse: 0.0, density: 0.18, drift: 0.14 } },
  { name: 'Garden', macros: { warmth: 0.55, colour: 0.72, space: 0.6, pulse: 0.34, density: 0.76, drift: 0.7 } },
]
