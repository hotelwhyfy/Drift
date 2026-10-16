import { describe, it, expect } from 'vitest'
import { instrumentById } from '@/instruments/registry.ts'
import type { PatternContext } from '@/instruments/types.ts'
import { Resolver } from '@/harmony/resolver.ts'
import type { HarmonicContext } from '@/harmony/types.ts'
import { MODES } from '@/core/theory.ts'
import { rngAt } from '@/core/rng.ts'
import { NEUTRAL } from '@/fuzzy/expression.ts'

const harmonic: HarmonicContext = {
  chord: { degree: 0, notes: [60, 63, 67, 70], root: 48 },
  mode: MODES[1],
  rootMidi: 48,
}

function ctx(bar: number, params: Record<string, number>): PatternContext {
  return {
    bar,
    expression: NEUTRAL,
    params: {
      rate: 1, direction: 0, octaves: 2, gate: 0.85, rest: 0, register: 0,
      chance: 1, every: 0, length: 1, swell: 0, wander: 0, ...params,
    },
    rng: rngAt(5, 'arp', bar),
    tempo: 96,
    phraseRng: (...parts) => rngAt(5, 'arp', 'phrase', ...parts),
  }
}

function arp() {
  const def = instrumentById('arp')
  if (!def?.notes || !def.register) throw new Error('arp is missing')
  return { notes: def.notes, register: def.register }
}

/** What the arp actually plays, bar by bar, through a resolver of its own. */
function play(bars: number, params: Record<string, number>): { contour: number; midi: number }[] {
  const { notes, register } = arp()
  const resolver = new Resolver(9)
  const out: { contour: number; midi: number }[] = []
  for (let bar = 0; bar < bars; bar++) {
    resolver.beginBar(bar)
    const c = ctx(bar, params)
    const reg = register(c.params, Resolver.registerFor('chordal', harmonic.rootMidi))
    for (const intent of notes(c)) {
      const midi = resolver.resolve(intent, harmonic, reg, 'arp-1')
      if (midi !== null) out.push({ contour: intent.contour, midi })
    }
  }
  return out
}

describe('the arp', () => {
  it('only ever plays chord tones', () => {
    const tones = new Set(harmonic.chord.notes.map((n) => n % 12))
    for (const direction of [0, 1, 2, 3]) {
      for (const { midi } of play(8, { direction, rate: 2 })) expect(tones.has(midi % 12)).toBe(true)
    }
  })

  it('climbs while its contour climbs', () => {
    const played = play(8, { direction: 0 })
    expect(played.length).toBeGreaterThan(30)
    for (let i = 1; i < played.length; i++) {
      if (played[i].contour > played[i - 1].contour) {
        expect(played[i].midi).toBeGreaterThanOrEqual(played[i - 1].midi)
      }
    }
    // And it covers the range rather than sitting on one note.
    const midis = played.map((p) => p.midi)
    expect(Math.max(...midis) - Math.min(...midis)).toBeGreaterThanOrEqual(19)
  })

  it('carries a run across the bar line', () => {
    // A two-bar run of eighths: bar 1 picks up where bar 0 left off rather
    // than restarting at the bottom.
    const { notes } = arp()
    const first = notes(ctx(1, { every: 1 }))[0]
    expect(first.contour).toBeGreaterThan(-1)
  })

  it('leaves space when a run is not due', () => {
    const { notes } = arp()
    for (let bar = 0; bar < 32; bar++) expect(notes(ctx(bar, { chance: 0 }))).toEqual([])
    // At a middling chance some windows play and some do not.
    let silent = 0
    for (let bar = 0; bar < 64; bar++) if (notes(ctx(bar, { chance: 0.5 })).length === 0) silent++
    expect(silent).toBeGreaterThan(8)
    expect(silent).toBeLessThan(56)
  })

  it('keeps each run inside its window, in one piece', () => {
    const { notes } = arp()
    for (const every of [1, 2, 3]) {
      const bars = [1, 2, 4, 8][every]
      for (let window = 0; window < 6; window++) {
        const steps: number[] = []
        for (let b = 0; b < bars; b++) {
          const bar = window * bars + b
          for (const n of notes(ctx(bar, { every, length: 0.4, wander: 0.5 }))) steps.push(b * 16 + n.step)
        }
        expect(steps.length).toBeGreaterThan(0)
        for (let i = 1; i < steps.length; i++) expect(steps[i] - steps[i - 1]).toBe(2)
        expect(steps.length).toBeLessThanOrEqual(Math.round((0.4 * bars * 16) / 2) + 1)
      }
    }
  })

  it('swells into a run and away from it', () => {
    const { notes } = arp()
    const run = notes(ctx(0, { swell: 1 }))
    const middle = run[Math.floor(run.length / 2)].weight
    expect(run[0].weight).toBeLessThan(middle)
    expect(run[run.length - 1].weight).toBeLessThan(middle)
  })

  it('is the same bar whether or not the bars before it were asked for', () => {
    const { notes } = arp()
    for (const direction of [0, 1, 2, 3]) {
      for (const bar of [0, 7, 64, 401]) {
        const p = { direction, rest: 0.3, chance: 0.5, every: 2, length: 0.5, wander: 0.5, swell: 0.6 }
        expect(notes(ctx(bar, p))).toEqual(notes(ctx(bar, p)))
      }
    }
  })
})
