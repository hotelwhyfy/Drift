import { describe, it, expect } from 'vitest'
import { FuzzyEngine } from '../src/fuzzy/inference.ts'
import { NEUTRAL } from '../src/fuzzy/expression.ts'
import type { Expression } from '../src/fuzzy/expression.ts'
import { positionWord, positionPhrase } from '../src/fuzzy/lexicon.ts'
import { curveFromStroke, sampleCurve } from '../src/automation/curve.ts'
import { INSTRUMENTS } from '../src/instruments/registry.ts'

const at = (p: Partial<Expression>): Expression => ({ ...NEUTRAL, ...p })

const base = {
  outputs: { cutoff: { min: 200, max: 8000, scale: 'exp' as const } },
  rules: [
    { when: { brightness: 'low' }, then: { cutoff: 'low' } },
    { when: { brightness: 'mid' }, then: { cutoff: 'mid' } },
    { when: { brightness: 'high' }, then: { cutoff: 'high' } },
  ],
}

describe('fuzzy inference', () => {
  it('moves an output monotonically with its input', () => {
    // Non-decreasing rather than strictly increasing: the end terms are
    // trapezoids, so "fully dark" deliberately spans a range instead of a
    // point. A dial's extremes should stay committed rather than continuing
    // to creep, and that plateau is the mechanism.
    const engine = new FuzzyEngine(base)
    let previous = -Infinity
    const seen: number[] = []
    for (let i = 0; i <= 40; i++) {
      const v = engine.evaluate(at({ brightness: i / 40 })).cutoff
      expect(v).toBeGreaterThanOrEqual(previous - 1e-9)
      seen.push(v)
      previous = v
    }
    // And it must actually travel, not merely fail to go backwards.
    expect(seen[seen.length - 1] / seen[0]).toBeGreaterThan(4)
  })

  it('interpolates between rules rather than switching between them', () => {
    // The point of fuzzy sets over thresholds: 0.49 and 0.51 must not produce
    // categorically different sounds.
    const engine = new FuzzyEngine(base)
    const a = engine.evaluate(at({ brightness: 0.49 })).cutoff
    const b = engine.evaluate(at({ brightness: 0.51 })).cutoff
    expect(Math.abs(b - a) / a).toBeLessThan(0.08)
  })

  it('stays inside the declared range everywhere', () => {
    const engine = new FuzzyEngine(base)
    for (let i = 0; i <= 40; i++) {
      const v = engine.evaluate(at({ brightness: i / 40 })).cutoff
      expect(v).toBeGreaterThanOrEqual(200)
      expect(v).toBeLessThanOrEqual(8000)
    }
  })

  it('rejects a rule naming a term that does not exist', () => {
    // A typo here would otherwise surface as an instrument that mysteriously
    // ignores one of its dimensions.
    expect(() => new FuzzyEngine({
      outputs: { cutoff: { min: 1, max: 2 } },
      rules: [{ when: { brightness: 'blazing' }, then: { cutoff: 'high' } }],
    })).toThrow(/unknown input term/)
    expect(() => new FuzzyEngine({
      outputs: { cutoff: { min: 1, max: 2 } },
      rules: [{ when: { brightness: 'high' }, then: { warp: 'high' } }],
    })).toThrow(/unknown output/)
  })

  it('gives every registered instrument a usable rule base', () => {
    for (const def of INSTRUMENTS) {
      const engine = new FuzzyEngine(def.rules)
      for (const corner of [0, 0.5, 1]) {
        const params = engine.evaluate(at({
          brightness: corner, weight: corner, motion: corner,
          tension: corner, density: corner,
        }))
        for (const [name, spec] of Object.entries(def.rules.outputs)) {
          expect(Number.isFinite(params[name])).toBe(true)
          expect(params[name]).toBeGreaterThanOrEqual(spec.min - 1e-9)
          expect(params[name]).toBeLessThanOrEqual(spec.max + 1e-9)
        }
      }
    }
  })

  it('explains which rules are firing', () => {
    const engine = new FuzzyEngine(base)
    const firing = engine.explain(at({ brightness: 0.95 }))
    expect(firing.length).toBeGreaterThan(0)
    expect(firing[0].rule.when.brightness).toBe('high')
  })
})

describe('words', () => {
  it('places known words exactly', () => {
    expect(positionWord('murky').confidence).toBe(1)
    expect(positionWord('murky').vector.brightness).toBeLessThan(0.25)
    expect(positionWord('glassy').vector.brightness).toBeGreaterThan(0.8)
    expect(positionWord('heavy').vector.weight).toBeGreaterThan(0.8)
  })

  it('pulls near-misses towards their neighbour', () => {
    const m = positionWord('shimmery')
    expect(m.nearest).toBe('shimmering')
    expect(m.confidence).toBeGreaterThan(0.5)
    expect(m.vector.brightness).toBeGreaterThan(0.65)
  })

  it('is stable for words it has never seen', () => {
    // Typing the same nonsense twice must give the same sound, or it is not a
    // control at all.
    expect(positionWord('zorblax').vector).toEqual(positionWord('zorblax').vector)
  })

  it('ignores stop words when reading a phrase', () => {
    expect(positionPhrase('a very heavy storm').matches.map((m) => m.word))
      .toEqual(['heavy', 'storm'])
  })

  it('weights a phrase towards the words it actually knows', () => {
    const known = positionPhrase('murky').expression.brightness
    const diluted = positionPhrase('murky qwertyuiop').expression.brightness
    expect(Math.abs(diluted - known)).toBeLessThan(0.3)
  })
})

describe('gestures', () => {
  it('resamples a stroke onto the loop grid', () => {
    const curve = curveFromStroke([{ x: 0, y: 0 }, { x: 1, y: 1 }])
    expect(sampleCurve(curve.points, 0)).toBeCloseTo(0, 1)
    expect(sampleCurve(curve.points, 0.5)).toBeCloseTo(0.5, 1)
    expect(curve.character.slope).toBeGreaterThan(0.9)
  })

  it('reads a shaky stroke as more jittery than a smooth one', () => {
    const smooth = []
    const shaky = []
    for (let i = 0; i <= 60; i++) {
      const x = i / 60
      smooth.push({ x, y: 0.5 + 0.4 * Math.sin(x * Math.PI) })
      shaky.push({ x, y: 0.5 + 0.4 * Math.sin(x * Math.PI) + (i % 2 ? 0.12 : -0.12) })
    }
    expect(curveFromStroke(shaky).character.jitter)
      .toBeGreaterThan(curveFromStroke(smooth).character.jitter + 0.2)
  })

  it('loops', () => {
    const curve = curveFromStroke([{ x: 0, y: 0.2 }, { x: 1, y: 0.9 }])
    expect(sampleCurve(curve.points, 1.25)).toBeCloseTo(sampleCurve(curve.points, 0.25), 5)
  })
})
