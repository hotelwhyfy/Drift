/**
 * The expression space.
 *
 * Five dimensions every input method reduces to, and every instrument infers
 * from. Keeping the space small and shared is what lets a word, a dragged
 * point and a drawn stroke all mean the same thing to an instrument that has
 * never heard of any of them — an instrument declares how it responds to
 * *brightness*, not to "the X axis of the pad".
 */
export const EXPRESSION_KEYS = [
  'brightness',
  'weight',
  'motion',
  'tension',
  'density',
] as const

export type ExpressionKey = (typeof EXPRESSION_KEYS)[number]

export type Expression = Record<ExpressionKey, number>

export interface ExpressionInfo {
  readonly key: ExpressionKey
  readonly label: string
  readonly low: string
  readonly high: string
}

export const EXPRESSION_INFO: readonly ExpressionInfo[] = [
  { key: 'brightness', label: 'Brightness', low: 'dark', high: 'bright' },
  { key: 'weight', label: 'Weight', low: 'light', high: 'heavy' },
  { key: 'motion', label: 'Motion', low: 'still', high: 'restless' },
  { key: 'tension', label: 'Tension', low: 'calm', high: 'tense' },
  { key: 'density', label: 'Density', low: 'sparse', high: 'busy' },
]

export const NEUTRAL: Expression = {
  brightness: 0.5, weight: 0.5, motion: 0.5, tension: 0.4, density: 0.5,
}

export function blendExpression(a: Expression, b: Expression, t: number): Expression {
  const out: Expression = { ...a }
  for (const k of EXPRESSION_KEYS) out[k] = a[k] + (b[k] - a[k]) * t
  return out
}

export function clampExpression(e: Expression): Expression {
  const out: Expression = { ...e }
  for (const k of EXPRESSION_KEYS) out[k] = e[k] < 0 ? 0 : e[k] > 1 ? 1 : e[k]
  return out
}
