import { describe, it, expect } from 'vitest'
import { instrumentById } from '../src/instruments/registry.ts'
import type { InstrumentDef, PatternContext } from '../src/instruments/types.ts'
import { rngAt } from '../src/core/rng.ts'
import { NEUTRAL } from '../src/fuzzy/expression.ts'
import { denormaliseParam } from '../src/fuzzy/denormaliseParam.ts'
import { FuzzyEngine } from '../src/fuzzy/inference.ts'

const TEMPO = 80
const BARS = 3000
const BAR_SEC = (60 / TEMPO) * 4

function rhodes(): InstrumentDef {
  const def = instrumentById('rhodes')
  if (!def) throw new Error('no rhodes')
  return def
}

/** Every onset, in sixteenths from the start, over a long stretch. */
function onsets(params: Record<string, number>): number[] {
  const def = rhodes()
  const out: number[] = []
  for (let bar = 0; bar < BARS; bar++) {
    const ctx: PatternContext = {
      bar, expression: NEUTRAL, params, rng: rngAt(7, 'rhodes', bar), tempo: TEMPO,
      phraseRng: (...parts) => rngAt(7, 'rhodes', 'phrase', ...parts),
    }
    for (const intent of def.notes?.(ctx) ?? []) out.push(bar * 16 + intent.step)
  }
  return out
}

const perMinute = (n: number): number => n / ((BARS * BAR_SEC) / 60)

function knobs(notes: number, rests: number): Record<string, number> {
  const outputs = rhodes().rules.outputs
  return { rate: denormaliseParam(outputs.rate, notes), rest: denormaliseParam(outputs.rest, rests) }
}

describe('rhodes: someone walking past a piano', () => {
  it('presses about as often a minute as the knobs ask', () => {
    for (const notes of [0, 0.5, 1]) {
      const p = knobs(notes, 0.3)
      // Expected count, within four standard deviations of counting noise:
      // at the bottom of the dial only ninety or so presses fall in the run.
      const expected = (p.rate * (1 - p.rest) * BARS * BAR_SEC) / 60
      const n = onsets(p).length
      expect(Math.abs(n - expected)).toBeLessThan(4 * Math.sqrt(expected))
    }
  })

  it('is very sparse at the bottom of the Notes knob', () => {
    expect(perMinute(onsets(knobs(0, 0)).length)).toBeLessThan(1.5)
  })

  it('prefers no beat, the downbeat included', () => {
    const all = onsets(knobs(0.75, 0))
    const onOne = all.filter((o) => o % 16 === 0).length
    expect(onOne / all.length).toBeLessThan(0.12)
  })

  it('leaves irregular gaps rather than keeping time', () => {
    const all = onsets(knobs(0.6, 0.3))
    const gaps = all.slice(1).map((o, i) => o - all[i])
    const mean = gaps.reduce((a, g) => a + g, 0) / gaps.length
    const sd = Math.sqrt(gaps.reduce((a, g) => a + (g - mean) ** 2, 0) / gaps.length)
    expect(sd / mean).toBeGreaterThan(0.8)
  })

  it('stays sparse when left to the dials, even at full density', () => {
    const fuzzy = new FuzzyEngine(rhodes().rules)
    const busiest = fuzzy.evaluate({ ...NEUTRAL, density: 1, motion: 1 })
    // At most one press every ten seconds or so.
    expect(perMinute(onsets(busiest).length)).toBeLessThan(6)
  })
})
