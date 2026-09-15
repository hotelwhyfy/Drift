import type { MembershipFn } from './membership.ts'
import { threeTerms } from './membership.ts'
import type { Expression, ExpressionKey } from './expression.ts'
import { EXPRESSION_KEYS } from './expression.ts'

/**
 * Mamdani fuzzy inference.
 *
 * Chosen over a lookup table or a pile of lerps because the rule base is the
 * part a person can actually read and argue with:
 *
 *   IF motion IS high AND weight IS low THEN detune IS high, lfoRate IS high
 *
 * That sentence is the design document and the implementation at once. Adding
 * an instrument means writing a dozen such sentences, not hand-tuning a
 * hundred interpolations — and because the sets overlap, rules that partially
 * fire blend their conclusions instead of fighting over them.
 */

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

/** Resolution of the centroid sum. 33 is visually and audibly smooth. */
const STEPS = 33

/**
 * Fuzzifies the expression, fires every rule, aggregates by max, and
 * defuzzifies each output by centroid.
 *
 * Results are cached against the input vector: an instrument's parameters only
 * need recomputing when its expression actually moves, which — even with
 * automation running — is far less often than the audio block rate.
 */
export class FuzzyEngine {
  private readonly inputTerms: Record<string, Record<string, MembershipFn>> = {}
  private readonly outputNames: string[]
  private lastKey = ''
  private cache: Record<string, number> = {}

  constructor(private readonly base: RuleBase) {
    const fallback = threeTerms()
    for (const k of EXPRESSION_KEYS) {
      this.inputTerms[k] = base.inputs?.[k] ?? fallback
    }
    this.outputNames = Object.keys(base.outputs)
    // Fail loudly at construction rather than silently ignoring a typo that
    // would otherwise show up as an instrument that mysteriously never
    // responds to one of its dimensions.
    for (const rule of base.rules) {
      for (const [k, term] of Object.entries(rule.when)) {
        if (term !== undefined && !this.inputTerms[k]?.[term]) {
          throw new Error(`fuzzy: rule references unknown input term ${k} IS ${term}`)
        }
      }
      for (const [out, term] of Object.entries(rule.then)) {
        const spec = base.outputs[out]
        if (!spec) throw new Error(`fuzzy: rule references unknown output ${out}`)
        const terms = spec.terms ?? threeTerms()
        if (!terms[term]) throw new Error(`fuzzy: unknown term ${out} IS ${term}`)
      }
    }
  }

  get outputs(): readonly string[] {
    return this.outputNames
  }

  evaluate(expression: Expression): Record<string, number> {
    const key = EXPRESSION_KEYS.map((k) => expression[k].toFixed(3)).join(',')
    if (key === this.lastKey) return this.cache

    // Aggregated consequent membership per output, sampled over the domain.
    const agg: Record<string, Float64Array> = {}
    for (const name of this.outputNames) agg[name] = new Float64Array(STEPS)

    for (const rule of this.base.rules) {
      // Antecedent strength: the minimum membership across the conditions,
      // which is the fuzzy AND.
      let strength = 1
      let any = false
      for (const [k, term] of Object.entries(rule.when)) {
        if (term === undefined) continue
        any = true
        const mf = this.inputTerms[k][term]
        const m = mf(expression[k as ExpressionKey])
        if (m < strength) strength = m
        if (strength === 0) break
      }
      if (!any) strength = 1
      strength *= rule.weight ?? 1
      if (strength <= 0) continue

      for (const [out, term] of Object.entries(rule.then)) {
        const spec = this.base.outputs[out]
        const mf = (spec.terms ?? threeTerms())[term]
        const target = agg[out]
        for (let i = 0; i < STEPS; i++) {
          // Implication by clipping, aggregation by max.
          const v = Math.min(strength, mf(i / (STEPS - 1)))
          if (v > target[i]) target[i] = v
        }
      }
    }

    const result: Record<string, number> = {}
    for (const name of this.outputNames) {
      const spec = this.base.outputs[name]
      const curve = agg[name]
      let num = 0
      let den = 0
      for (let i = 0; i < STEPS; i++) {
        const x = i / (STEPS - 1)
        num += x * curve[i]
        den += curve[i]
      }
      // No rule fired at all: sit in the middle rather than collapse to zero,
      // which would make an unmatched instrument fall silent.
      const norm = den > 1e-9 ? num / den : 0.5
      result[name] = spec.scale === 'exp'
        ? spec.min * Math.pow(spec.max / spec.min, norm)
        : spec.min + (spec.max - spec.min) * norm
    }

    this.lastKey = key
    this.cache = result
    return result
  }

  /**
   * Which rules are firing, and how strongly. The interface uses this to show
   * the sentences currently shaping the sound, which is the payoff of using
   * readable rules in the first place.
   */
  explain(expression: Expression, limit = 4): { rule: Rule; strength: number }[] {
    const scored = this.base.rules.map((rule) => {
      let strength = 1
      let any = false
      for (const [k, term] of Object.entries(rule.when)) {
        if (term === undefined) continue
        any = true
        const m = this.inputTerms[k][term](expression[k as ExpressionKey])
        if (m < strength) strength = m
      }
      if (!any) strength = 1
      return { rule, strength: strength * (rule.weight ?? 1) }
    })
    return scored
      .filter((s) => s.strength > 0.05)
      .sort((a, b) => b.strength - a.strength)
      .slice(0, limit)
  }
}
