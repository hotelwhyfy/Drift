import { describe, it, expect } from 'vitest'
import { instrumentById } from '@/instruments/registry.ts'
import type { PatternContext } from '@/instruments/types.ts'
import { rngAt } from '@/core/rng.ts'
import { NEUTRAL } from '@/fuzzy/expression.ts'

const EVERY = [4, 8, 16]

function ctx(bar: number, params: Record<string, number>): PatternContext {
  return {
    bar,
    expression: NEUTRAL,
    params: { every: 0, kind: 0, length: 2, chance: 1, rollBias: 0.5, ...params },
    rng: rngAt(3, 'cymbals', bar),
    tempo: 80,
    phraseRng: (...parts) => rngAt(3, 'cymbals', 'phrase', ...parts),
  }
}

function hits() {
  const def = instrumentById('cymbals')
  if (!def?.hits) throw new Error('cymbals are missing')
  return def.hits
}

describe('the cymbals', () => {
  it('land every gesture on a phrase downbeat', () => {
    const pattern = hits()
    for (const every of [0, 1, 2]) {
      for (const length of [1, 2, 3, 4]) {
        let gestures = 0
        for (let bar = 0; bar < 64; bar++) {
          for (const hit of pattern(ctx(bar, { every, length }))) {
            gestures++
            expect(hit.step).toBe(0)
            const lands = bar + (hit.lengthSteps ?? 0) / 16
            expect(lands % EVERY[every]).toBe(0)
          }
        }
        expect(gestures).toBe(64 / EVERY[every])
      }
    }
  })

  it('play swells, rolls or both, as asked', () => {
    const pattern = hits()
    const kinds = (kind: number) => {
      const seen = new Set<string>()
      for (let bar = 0; bar < 128; bar++) for (const h of pattern(ctx(bar, { kind }))) seen.add(h.kind)
      return [...seen].sort()
    }
    expect(kinds(0)).toEqual(['roll', 'swell'])
    expect(kinds(1)).toEqual(['swell'])
    expect(kinds(2)).toEqual(['roll'])
  })

  it('stay silent when nothing is to happen', () => {
    const pattern = hits()
    for (let bar = 0; bar < 64; bar++) expect(pattern(ctx(bar, { chance: 0 }))).toEqual([])
  })

  it('decide a phrase the same way whichever bar asks', () => {
    // The landing's roll of the dice is keyed to the phrase, not the bar that
    // starts the gesture: a lane moving the length cannot change whether the
    // phrase gets a cymbal, only when it starts.
    const pattern = hits()
    for (const phrase of [1, 5, 40]) {
      const lands = phrase * 4
      const short = pattern(ctx(lands - 1, { length: 1, chance: 0.5 }))
      const long = pattern(ctx(lands - 3, { length: 3, chance: 0.5 }))
      expect(short.length).toBe(long.length)
      expect(pattern(ctx(lands - 3, { length: 3, chance: 0.5 }))).toEqual(long)
    }
  })
})
