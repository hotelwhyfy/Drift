import { describe, it, expect } from 'vitest'
import { spread } from '@/instruments/spread.ts'
import { instrumentById } from '@/instruments/registry.ts'
import type { PatternContext } from '@/instruments/types.ts'
import { createRng, rngAt } from '@/core/rng.ts'
import { NEUTRAL } from '@/fuzzy/expression.ts'

const N = 20000

/** Whether each of N slots fires at this chance, for a seeded phase and jitter. */
function fires(chance: number, seed: number): boolean[] {
  const rng = createRng(seed)
  const phase = rng()
  return Array.from({ length: N }, (_, i) => spread(phase, i, rng()) < chance)
}

describe('spread', () => {
  it('fires at exactly the chance asked for, over the long run', () => {
    for (const chance of [0.1, 0.35, 0.5, 0.8]) {
      const rate = fires(chance, 3).filter(Boolean).length / N
      expect(Math.abs(rate - chance)).toBeLessThan(0.01)
    }
  })

  it('follows a hit with another less often than independent coins would', () => {
    const seq = fires(0.5, 11)
    let after = 0
    let again = 0
    for (let i = 1; i < N; i++) {
      if (!seq[i - 1]) continue
      after++
      if (seq[i]) again++
    }
    // Independent flips give 0.5 here.
    expect(again / after).toBeLessThan(0.35)
  })

  it('is a pure function of its coordinate, and always in [0, 1)', () => {
    expect(spread(0.3, 4000, 0.7)).toBe(spread(0.3, 4000, 0.7))
    for (let i = 0; i < 1000; i++) {
      const v = spread(0.999, i, i % 2 === 0 ? 0 : 0.999999)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('the instruments that use it', () => {
  function barsWithNotes(id: string, params: Record<string, number>, bars: number): boolean[] {
    const def = instrumentById(id)
    if (!def?.notes) throw new Error(`no notes on ${id}`)
    return Array.from({ length: bars }, (_, bar) => {
      const ctx: PatternContext = {
        bar, expression: NEUTRAL, params, rng: rngAt(7, id, bar), tempo: 72,
        phraseRng: (...parts) => rngAt(7, id, 'phrase', ...parts),
      }
      return def.notes!(ctx).length > 0
    })
  }

  it('brass swells at about its rate without following one swell with another', () => {
    const seq = barsWithNotes('brass', { swells: 0.5, voices: 3 }, 4000)
    expect(Math.abs(seq.filter(Boolean).length / seq.length - 0.5)).toBeLessThan(0.03)
    let after = 0
    let again = 0
    for (let i = 1; i < seq.length; i++) {
      if (!seq[i - 1]) continue
      after++
      if (seq[i]) again++
    }
    expect(again / after).toBeLessThan(0.35)
  })
})
