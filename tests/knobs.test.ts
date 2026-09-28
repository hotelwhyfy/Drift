import { describe, it, expect } from 'vitest'
import { Rack } from '../src/engine/rack.ts'
import type { SlotDesc } from '../src/engine/rack.ts'
import { makeLane } from '../src/automation/lane.ts'
import type { Lane } from '../src/automation/lane.ts'
import { flatCurve } from '../src/automation/curve.ts'
import { NEUTRAL } from '../src/fuzzy/expression.ts'
import { INSTRUMENTS } from '../src/instruments/registry.ts'
import { controlsOf } from '../src/instruments/controlsOf.ts'
import { paramSpecOf } from '../src/instruments/paramSpecOf.ts'

const SR = 24000

function rackWith(overrides: Partial<SlotDesc>): Rack {
  const rack = new Rack(SR, 1)
  rack.sync([{
    id: 'pad-1', defId: 'pad', name: 'Pad', level: 0.8, muted: false, soloed: false,
    expression: { ...NEUTRAL }, follow: 1, lanes: [], knobs: {}, ...overrides,
  }])
  rack.control(NEUTRAL, { bars: 0, kick: 0, level: 0 })
  return rack
}

const paramsOf = (rack: Rack): Readonly<Record<string, number>> => rack.readout()[0].params

describe('knobs', () => {
  it('leaves a parameter to the rules until it is set', () => {
    const auto = paramsOf(rackWith({}))
    // Neutral expression: every rule half-fires, so nothing sits at an end.
    expect(auto.cutoff).toBeGreaterThan(0.05)
    expect(auto.cutoff).toBeLessThan(0.95)
  })

  it('sets a parameter directly, across its full range', () => {
    expect(paramsOf(rackWith({ knobs: { cutoff: 1 } })).cutoff).toBeCloseTo(1, 3)
    expect(paramsOf(rackWith({ knobs: { cutoff: 0 } })).cutoff).toBeCloseTo(0, 3)
    expect(paramsOf(rackWith({ knobs: { cutoff: 0.3 } })).cutoff).toBeCloseTo(0.3, 3)
  })

  it('lets a lane automate on top of a knob', () => {
    const lane: Lane = { ...makeLane('l', { kind: 'param', param: 'cutoff' }), source: { kind: 'curve', curve: flatCurve(0.2) } }
    const rack = rackWith({ knobs: { cutoff: 0.9 }, lanes: [lane] })
    expect(paramsOf(rack).cutoff).toBeCloseTo(0.2, 2)
    const half = rackWith({ knobs: { cutoff: 0.9 }, lanes: [{ ...lane, depth: 0.5 }] })
    expect(paramsOf(half).cutoff).toBeCloseTo(0.55, 2)
  })

  it('declares a range for every knob on every instrument', () => {
    // A control naming a parameter nothing defines would be a knob that
    // silently does nothing — the same failure the fuzzy engine refuses for
    // rules.
    for (const def of INSTRUMENTS) {
      for (const control of controlsOf(def)) {
        expect(paramSpecOf(def, control.param), `${def.id}.${control.param}`).toBeDefined()
      }
    }
  })
})
