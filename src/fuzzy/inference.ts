import type { MembershipFn } from '@/fuzzy/membership.ts'
import { threeTerms } from '@/fuzzy/membership.ts'
import type { Expression, ExpressionKey } from '@/fuzzy/expression.ts'
import { EXPRESSION_KEYS } from '@/fuzzy/expression.ts'
import type { Rule, RuleBase } from '@/fuzzy/types.ts'

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

/** Resolution of the centroid sum. 33 is visually and audibly smooth. */
const STEPS = 33

/** A rule's conditions as typed pairs, so callers never index by a loose string. */
const conditionsOf = (rule: Rule): [ExpressionKey, string][] =>
  EXPRESSION_KEYS.flatMap((k): [ExpressionKey, string][] => {
    const term = rule.when[k]
    return term === undefined ? [] : [[k, term]]
  })

/**
 * Fuzzifies the expression, fires every rule, aggregates by max, and
 * defuzzifies each output by centroid.
 *
 * Results are cached against the input vector: an instrument's parameters only
 * need recomputing when its expression actually moves, which — even with
 * automation running — is far less often than the audio block rate.
 */
export class FuzzyEngine {
  private readonly fallbackTerms = threeTerms()
  private readonly outputNames: string[]
  private lastKey = ''
  private cache: Record<string, number> = {}

  constructor(private readonly base: RuleBase) {
    this.outputNames = Object.keys(base.outputs)
    // Fail loudly at construction rather than silently ignoring a typo that
    // would otherwise show up as an instrument that mysteriously never
    // responds to one of its dimensions.
    base.rules.forEach((rule) => {
      conditionsOf(rule).forEach(([k, term]) => {
        if (!this.termsFor(k)[term]) {
          throw new Error(`fuzzy: rule references unknown input term ${k} IS ${term}`)
        }
      })
      Object.entries(rule.then).forEach(([out, term]) => {
        const spec = base.outputs[out]
        if (!spec) throw new Error(`fuzzy: rule references unknown output ${out}`)
        const terms = spec.terms ?? threeTerms()
        if (!terms[term]) throw new Error(`fuzzy: unknown term ${out} IS ${term}`)
      })
    })
  }

  get outputs(): readonly string[] {
    return this.outputNames
  }

  private termsFor(k: ExpressionKey): Record<string, MembershipFn> {
    return this.base.inputs?.[k] ?? this.fallbackTerms
  }

  /** The fuzzy AND of a rule's conditions, scaled by its weight. */
  private strengthOf(rule: Rule, expression: Expression): number {
    const antecedent = conditionsOf(rule).reduce(
      (strength, [k, term]) => Math.min(strength, this.termsFor(k)[term](expression[k])),
      1,
    )
    return antecedent * (rule.weight ?? 1)
  }

  evaluate(expression: Expression): Record<string, number> {
    const key = EXPRESSION_KEYS.map((k) => expression[k].toFixed(3)).join(',')
    if (key === this.lastKey) return this.cache

    // Aggregated consequent membership per output, sampled over the domain.
    const agg: Record<string, Float64Array> = Object.fromEntries(
      this.outputNames.map((name) => [name, new Float64Array(STEPS)]),
    )

    this.base.rules.forEach((rule) => {
      const strength = this.strengthOf(rule, expression)
      if (strength <= 0) return

      Object.entries(rule.then).forEach(([out, term]) => {
        const mf = (this.base.outputs[out].terms ?? threeTerms())[term]
        const target = agg[out]
        for (let i = 0; i < STEPS; i++) {
          // Implication by clipping, aggregation by max.
          const v = Math.min(strength, mf(i / (STEPS - 1)))
          if (v > target[i]) target[i] = v
        }
      })
    })

    const result: Record<string, number> = Object.fromEntries(
      this.outputNames.map((name) => {
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
        const value = spec.scale === 'exp'
          ? spec.min * Math.pow(spec.max / spec.min, norm)
          : spec.min + (spec.max - spec.min) * norm
        return [name, value]
      }),
    )

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
    return this.base.rules
      .map((rule) => ({ rule, strength: this.strengthOf(rule, expression) }))
      .filter((s) => s.strength > 0.05)
      .sort((a, b) => b.strength - a.strength)
      .slice(0, limit)
  }
}
