import { describe, it, expect } from 'vitest'
import { drumPattern } from '../src/compose/drumPattern.ts'
import { DRUM_STYLES, FILL_EVERY } from '../src/compose/drumStyles.ts'
import type { PatternContext } from '../src/instruments/types.ts'
import { rngAt } from '../src/core/rng.ts'
import { NEUTRAL } from '../src/fuzzy/expression.ts'
import { Engine } from '../src/engine/engine.ts'
import { DEFAULT_MACROS } from '../src/macros/macros.ts'

function ctx(bar: number, params: Record<string, number>): PatternContext {
  return {
    bar,
    expression: NEUTRAL,
    params: { style: 0, busy: 0.5, variation: 0.3, ghost: 0, openHats: 0.3, fill: 0, fillEvery: 1, ...params },
    rng: rngAt(11, 'kit', bar),
    tempo: 72,
    phraseRng: (...parts) => rngAt(11, 'kit', 'phrase', ...parts),
  }
}

describe('the drum pattern', () => {
  it('is the same bar every time it is asked for', () => {
    for (const bar of [0, 5, 63, 401]) {
      expect(drumPattern(ctx(bar, { ghost: 0.5 }))).toEqual(drumPattern(ctx(bar, { ghost: 0.5 })))
    }
  })

  it('plays every style’s skeleton', () => {
    DRUM_STYLES.forEach((style, i) => {
      const hits = drumPattern(ctx(2, { style: i, busy: 0 }))
      style.kick.forEach((p, step) => {
        if (p >= 1) expect(hits.some((h) => h.kind === 'kick' && h.step === step), `${style.name} kick ${step}`).toBe(true)
      })
      style.snare.forEach((p, step) => {
        if (p >= 1) expect(hits.some((h) => h.kind === 'snare' && h.step === step), `${style.name} snare ${step}`).toBe(true)
      })
    })
  })

  it('fills only on the last bar of each group', () => {
    const everyIndex = FILL_EVERY.indexOf(4)
    for (let bar = 0; bar < 24; bar++) {
      const late = drumPattern(ctx(bar, { fill: 1, fillEvery: everyIndex, variation: 0 }))
        .filter((h) => (h.kind === 'snare' || h.kind === 'rim') && h.step > 12)
      if (bar % 4 === 3) expect(late.length, `bar ${bar}`).toBeGreaterThanOrEqual(2)
      else expect(late.length, `bar ${bar}`).toBe(0)
    }
  })

  it('leaves open hats out entirely at zero, and always finds room for one at full', () => {
    for (let bar = 0; bar < 32; bar++) {
      expect(drumPattern(ctx(bar, { openHats: 0 })).some((h) => h.kind === 'openHat')).toBe(false)
      expect(drumPattern(ctx(bar, { openHats: 1 })).some((h) => h.kind === 'openHat')).toBe(true)
    }
  })

  it('keeps ghost notes quiet', () => {
    for (let bar = 0; bar < 32; bar++) {
      for (const h of drumPattern(ctx(bar, { ghost: 1, style: 1 }))) {
        // Half-time has no snare but beat three, so every other snare is a ghost.
        if (h.kind === 'snare' && h.step !== 8) expect(h.velocity).toBeLessThan(0.35)
      }
    }
  })

  it('shares a groove across a phrase when variation is off', () => {
    const skeleton = (bar: number) => drumPattern(ctx(bar, { variation: 0, busy: 0.8 }))
      .filter((h) => h.kind === 'kick').map((h) => h.step)
    expect(skeleton(1)).toEqual(skeleton(2))
    expect(skeleton(4)).toEqual(skeleton(6))
  })
})

describe('the kit', () => {
  it('stays inside the ceiling with everything turned up', () => {
    const SR = 24000
    const e = new Engine(SR, { ...DEFAULT_MACROS, pulse: 1, density: 1 }, 5)
    e.snapMacros({ ...DEFAULT_MACROS, pulse: 1, density: 1 })
    const knobs: Record<string, number> = {}
    for (const k of ['kickLevel', 'snareLevel', 'rimLevel', 'hatLevel', 'openHatLevel', 'kickPunch', 'busy', 'openHats', 'ghost', 'fill']) knobs[k] = 1
    e.rack.sync([...e.rack.describe(), {
      id: 'kit-x', defId: 'kit', name: 'Kit', level: 1, muted: false, soloed: false,
      expression: { ...NEUTRAL }, follow: 1, lanes: [], knobs,
    }])
    e.seek(0)
    const l = new Float32Array(SR * 6)
    const r = new Float32Array(SR * 6)
    e.render(l, r, l.length)
    let peak = 0
    for (let i = 0; i < l.length; i++) {
      expect(Number.isFinite(l[i]) && Number.isFinite(r[i])).toBe(true)
      peak = Math.max(peak, Math.abs(l[i]), Math.abs(r[i]))
    }
    expect(peak).toBeLessThanOrEqual(0.8913)
    expect(peak).toBeGreaterThan(0.1)
  })
})
