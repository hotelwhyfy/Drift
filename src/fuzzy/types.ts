import type { Expression } from '@/fuzzy/expression.ts'
import type { MembershipFn } from '@/fuzzy/membership.ts'
import type { ExpressionKey } from '@/fuzzy/expression.ts'

/** How a normalised 0..1 inference result maps onto a real parameter. */
export type Scale = 'linear' | 'exp'

export interface OutputSpec {
  readonly min: number
  readonly max: number
  /** Frequencies and times want 'exp'; mixes and depths want 'linear'. */
  readonly scale?: Scale
  /** Term sets over the normalised domain. Defaults to low/mid/high. */
  readonly terms?: Record<string, MembershipFn>
}

export interface Rule {
  /** Antecedent: expression dimension → term name. Combined with AND (min). */
  readonly when: Partial<Record<ExpressionKey, string>>
  /** Consequent: output name → term name. */
  readonly then: Readonly<Record<string, string>>
  /** Rule importance, default 1. Lets a rule nudge rather than dominate. */
  readonly weight?: number
}

export interface RuleBase {
  readonly inputs?: Partial<Record<ExpressionKey, Record<string, MembershipFn>>>
  readonly outputs: Readonly<Record<string, OutputSpec>>
  readonly rules: readonly Rule[]
}

export interface WordMatch {
  readonly word: string
  /** 0..1. Low confidence means the position came mostly from the hash. */
  readonly confidence: number
  readonly nearest: string | null
  readonly vector: Expression
}

export interface PhraseResult {
  readonly expression: Expression
  readonly matches: readonly WordMatch[]
}
