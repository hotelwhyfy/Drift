import { describe, it, expect } from 'vitest'
import { Engine } from '../src/engine/engine.ts'
import { INSTRUMENTS } from '../src/instruments/registry.ts'
import { DEFAULT_MACROS } from '../src/macros/macros.ts'
import { NEUTRAL } from '../src/fuzzy/expression.ts'

const SR = 24000

describe('every instrument', () => {
  // The sub was silent for a long time — its voice took its arguments in a
  // different order from every caller, and tuned itself below hearing. Nothing
  // noticed, because the mix still made sound. This asks each one alone.
  it.each(INSTRUMENTS.map((d) => [d.id]))('%s is audible on its own, and finite', (id) => {
    const e = new Engine(SR, { ...DEFAULT_MACROS, pulse: 0.8 }, 3)
    e.snapMacros({ ...DEFAULT_MACROS, pulse: 0.8 })
    e.rack.sync([{
      id: `${id}-0`, defId: id, name: id, level: 0.8, muted: false, soloed: false,
      expression: { ...NEUTRAL }, follow: 1, lanes: [], knobs: {},
    }])
    e.seek(0)
    const n = SR * 8
    const l = new Float32Array(n)
    const r = new Float32Array(n)
    e.render(l, r, n)
    let energy = 0
    for (let i = 0; i < n; i++) {
      expect(Number.isFinite(l[i]) && Number.isFinite(r[i])).toBe(true)
      energy += l[i] * l[i] + r[i] * r[i]
    }
    const rmsDb = 20 * Math.log10(Math.sqrt(energy / (n * 2)))
    expect(rmsDb).toBeGreaterThan(-45)
  })
})
