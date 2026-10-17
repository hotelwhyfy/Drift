import { describe, it, expect } from 'vitest'
import { instrumentById } from '@/instruments/registry.ts'
import type { InstrumentDef, PatternContext } from '@/instruments/types.ts'
import { Brass } from '@/voices/brass.ts'
import { createRng, rngAt } from '@/core/rng.ts'
import { NEUTRAL } from '@/fuzzy/expression.ts'
import { denormaliseParam } from '@/fuzzy/denormaliseParam.ts'

const SR = 24000
const TEMPO = 72

function def(id: string): InstrumentDef {
  const d = instrumentById(id)
  if (!d) throw new Error(`no ${id}`)
  return d
}

/** The rule base's own midpoint for every output, as if the dials sat at 0.5. */
function middle(d: InstrumentDef): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [key, spec] of Object.entries(d.rules.outputs)) out[key] = denormaliseParam(spec, 0.5)
  return out
}

function ctxFor(id: string, bar: number, params: Record<string, number>): PatternContext {
  return {
    bar, expression: NEUTRAL, params, rng: rngAt(9, id, bar), tempo: TEMPO,
    phraseRng: (...parts) => rngAt(9, id, 'phrase', ...parts),
  }
}

function rms(buf: Float32Array, from: number, to: number): number {
  let s = 0
  for (let i = from; i < to; i++) s += buf[i] * buf[i]
  return Math.sqrt(s / (to - from))
}

describe('brass', () => {
  it('swells: a note is far quieter as it enters than once it has opened', () => {
    const v = new Brass(SR, createRng(1))
    v.set({
      attack: 3, release: 2, brightness: 2000, edge: 0.3, scoop: 0.3,
      chiff: 0.1, vibrato: 6, ensemble: 0.4, width: 0.5, level: 0.5,
    })
    v.noteOn(57, 0.7, 8, 440)
    const n = SR * 6
    const l = new Float32Array(n)
    const out: [number, number] = [0, 0]
    for (let i = 0; i < n; i++) {
      out[0] = 0
      out[1] = 0
      v.process(out)
      l[i] = out[0]
    }
    expect(rms(l, 0, SR * 0.4)).toBeLessThan(rms(l, SR * 4, SR * 5) * 0.4)
  })

  it('swells on some bars and rests on others', () => {
    const d = def('brass')
    const p = middle(d)
    let played = 0
    for (let bar = 0; bar < 200; bar++) if ((d.notes?.(ctxFor('brass', bar, p)) ?? []).length > 0) played++
    expect(played).toBeGreaterThan(40)
    expect(played).toBeLessThan(180)
  })

  it('asks only for chordal notes, held across the bar line', () => {
    const d = def('brass')
    const p = middle(d)
    for (let bar = 0; bar < 100; bar++) {
      for (const n of d.notes?.(ctxFor('brass', bar, p)) ?? []) {
        expect(n.role).toBe('chordal')
        expect(n.step + n.lengthSteps).toBeGreaterThan(16)
      }
    }
  })
})

describe('wind', () => {
  it('is one player: no note starts while the last is still being held', () => {
    const d = def('wind')
    const p = { ...middle(d), rate: 30, rest: 0 }
    for (let bar = 0; bar < 200; bar++) {
      const notes = d.notes?.(ctxFor('wind', bar, p)) ?? []
      for (let i = 1; i < notes.length; i++) {
        expect(notes[i].step).toBeGreaterThanOrEqual(notes[i - 1].step + notes[i - 1].lengthSteps)
      }
    }
  })

  it('plays a bar the same whether it was reached or seeked to', () => {
    const d = def('wind')
    const p = { ...middle(d), rate: 20, rest: 0.1 }
    const direct = d.notes?.(ctxFor('wind', 321, p))
    for (let bar = 0; bar < 321; bar++) d.notes?.(ctxFor('wind', bar, p))
    expect(d.notes?.(ctxFor('wind', 321, p))).toEqual(direct)
  })

  it('shares one contour arch across the bars of a phrase', () => {
    const d = def('wind')
    const p = { ...middle(d), rate: 36, rest: 0 }
    // Contours within a phrase wander around the arch, never leaping the register.
    let checked = 0
    for (let phrase = 0; phrase < 50; phrase++) {
      const contours: number[] = []
      for (let bar = phrase * 4; bar < phrase * 4 + 4; bar++) {
        for (const n of d.notes?.(ctxFor('wind', bar, p)) ?? []) contours.push(n.contour)
      }
      if (contours.length < 2) continue
      checked++
      expect(Math.max(...contours) - Math.min(...contours)).toBeLessThan(1.6)
    }
    expect(checked).toBeGreaterThan(10)
  })
})
