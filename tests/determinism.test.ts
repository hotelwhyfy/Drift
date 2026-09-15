import { describe, it, expect } from 'vitest'
import { Engine } from '../src/engine/engine.ts'
import { Rack } from '../src/engine/rack.ts'
import { DEFAULT_RACK } from '../src/engine/engine.ts'
import type { HarmonicContext } from '../src/harmony/resolver.ts'
import { MODES } from '../src/core/theory.ts'
import { SCENES, DEFAULT_MACROS } from '../src/macros/macros.ts'
import { deriveSeed } from '../src/core/rng.ts'

const SR = 24000

function render(seed: number, frames: number, macros = DEFAULT_MACROS): [Float32Array, Float32Array] {
  const e = new Engine(SR, macros, seed)
  e.snapMacros(macros)
  const l = new Float32Array(frames)
  const r = new Float32Array(frames)
  e.render(l, r, frames)
  return [l, r]
}

describe('determinism', () => {
  it('renders bit-identically for the same seed and macros', () => {
    const [a] = render(4242, SR * 3)
    const [b] = render(4242, SR * 3)
    expect(Array.from(a)).toEqual(Array.from(b))
  })

  it('renders differently for a different seed', () => {
    const [a] = render(1, SR * 2)
    const [b] = render(2, SR * 2)
    expect(Array.from(a)).not.toEqual(Array.from(b))
  })

  it('is indifferent to the buffer sizes it is asked for', () => {
    // The capture path renders in two-second slices and playback in 0.4s
    // chunks. If those disagreed, an export would not be the music you heard.
    const frames = SR * 2
    const [whole] = render(99, frames)

    const e = new Engine(SR, DEFAULT_MACROS, 99)
    e.snapMacros(DEFAULT_MACROS)
    const l = new Float32Array(frames)
    const r = new Float32Array(frames)
    let done = 0
    const sizes = [1, 127, 4096, 333, 9000]
    let i = 0
    while (done < frames) {
      const n = Math.min(sizes[i++ % sizes.length], frames - done)
      e.render(l.subarray(done, done + n), r.subarray(done, done + n), n)
      done += n
    }
    expect(Array.from(l)).toEqual(Array.from(whole))
  })

  it('generates each bar from its index, not from a running counter', () => {
    // Seekability: bar 400 must be the same bar whether you played there or
    // jumped straight to it. This is what makes an endless stream capturable.
    const ctx: HarmonicContext = {
      chord: { degree: 0, notes: [60, 63, 67, 70], root: 48 },
      mode: MODES[1],
      rootMidi: 48,
    }
    const build = (walk: boolean) => {
      const rack = new Rack(SR, 7)
      for (const id of DEFAULT_RACK) rack.add(id)
      if (walk) for (let bar = 0; bar < 200; bar++) rack.bar(bar, ctx, 72, 0.1, 0.3)
      return rack.bar(200, ctx, 72, 0.1, 0.3)
    }
    expect(build(true)).toEqual(build(false))
  })
})

describe('output safety', () => {
  const corners: [string, Record<string, number>][] = []
  const axes = [0, 0.5, 1]
  // Sweep a coarse grid of the macro cube rather than only the named scenes:
  // the promise the interface makes is that *every* position is usable, so the
  // test has to visit positions nobody chose by hand.
  for (const warmth of axes) {
    for (const colour of axes) {
      for (const space of axes) {
        for (const pulse of axes) {
          corners.push([
            `w${warmth} c${colour} s${space} p${pulse}`,
            { warmth, colour, space, pulse, density: 0.5, drift: 0.5 },
          ])
        }
      }
    }
  }

  it.each(corners)('stays finite and inside the ceiling at %s', (_name, m) => {
    const macros = {
      warmth: m.warmth, colour: m.colour, space: m.space,
      pulse: m.pulse, density: m.density, drift: m.drift,
    }
    const [l, r] = render(deriveSeed(_name), SR * 2, macros)
    let peak = 0
    let energy = 0
    for (let i = 0; i < l.length; i++) {
      expect(Number.isFinite(l[i])).toBe(true)
      expect(Number.isFinite(r[i])).toBe(true)
      peak = Math.max(peak, Math.abs(l[i]), Math.abs(r[i]))
      energy += l[i] * l[i] + r[i] * r[i]
    }
    // The limiter's ceiling is -1 dBFS and it is a guarantee, not a target.
    expect(peak).toBeLessThanOrEqual(0.8913)
    // And every corner has to actually make a sound.
    const rms = Math.sqrt(energy / (l.length * 2))
    expect(rms).toBeGreaterThan(0.01)
  })

  it('keeps every named scene within a narrow loudness band', () => {
    // Sweeping a dial should change the music, not the volume.
    const levels = SCENES.map((scene) => {
      const [l, r] = render(deriveSeed(scene.name), SR * 4, scene.macros)
      let e = 0
      for (let i = 0; i < l.length; i++) e += l[i] * l[i] + r[i] * r[i]
      return 20 * Math.log10(Math.sqrt(e / (l.length * 2)))
    })
    const spread = Math.max(...levels) - Math.min(...levels)
    // Four seconds at a low test rate is a short window, so the figure is
    // noisier than the ~1.1 dB the full-length audition reports. The bound is
    // set to catch a macro that genuinely runs away, not to police variance.
    expect(spread).toBeLessThan(3.5)
  })
})

describe('reseeding', () => {
  it('changes the music without restarting the piece', () => {
    // "New world" must not mean "start over". Rebuilding the engine — which is
    // what this used to do — resets the bar count, empties the reverb and cuts
    // every sounding note, which is indistinguishable from pressing stop and
    // play.
    const engine = new Engine(SR, DEFAULT_MACROS, 1)
    engine.snapMacros(DEFAULT_MACROS)
    const warm = new Float32Array(SR * 6)
    engine.render(warm, new Float32Array(SR * 6), SR * 6)
    const barBefore = engine.snapshot().bar
    expect(barBefore).toBeGreaterThan(0)

    engine.reseed(987654)
    expect(engine.snapshot().bar).toBe(barBefore)

    // And the music that follows really is different.
    const after = new Float32Array(SR * 6)
    engine.render(after, new Float32Array(SR * 6), SR * 6)

    const control = new Engine(SR, DEFAULT_MACROS, 1)
    control.snapMacros(DEFAULT_MACROS)
    control.render(new Float32Array(SR * 6), new Float32Array(SR * 6), SR * 6)
    const unchanged = new Float32Array(SR * 6)
    control.render(unchanged, new Float32Array(SR * 6), SR * 6)

    expect(Array.from(after)).not.toEqual(Array.from(unchanged))
  })

  it('does not click when reseeded', () => {
    // The reverb tail and the sounding notes have to carry across the seam.
    const engine = new Engine(SR, DEFAULT_MACROS, 5)
    engine.snapMacros(DEFAULT_MACROS)
    engine.render(new Float32Array(SR * 4), new Float32Array(SR * 4), SR * 4)

    const seam = new Float32Array(SR)
    const seamR = new Float32Array(SR)
    engine.render(seam.subarray(0, 2000), seamR.subarray(0, 2000), 2000)
    engine.reseed(4242)
    engine.render(seam.subarray(2000), seamR.subarray(2000), seam.length - 2000)

    // No sample-to-sample jump larger than anything the signal makes anyway.
    let worstElsewhere = 0
    for (let i = 1; i < seam.length; i++) {
      if (i > 1900 && i < 2100) continue
      worstElsewhere = Math.max(worstElsewhere, Math.abs(seam[i] - seam[i - 1]))
    }
    let atSeam = 0
    for (let i = 1990; i < 2010; i++) {
      atSeam = Math.max(atSeam, Math.abs(seam[i] - seam[i - 1]))
    }
    expect(atSeam).toBeLessThanOrEqual(worstElsewhere)
  })
})

describe('typed seeds', () => {
  it('gives the same music for the same words, on any machine', () => {
    // The promise a typeable seed makes: "midnight garden" is a findable,
    // shareable piece, not just a nicer-looking random number.
    const render = (name: string): Float32Array => {
      const engine = new Engine(SR, DEFAULT_MACROS, deriveSeed(name))
      engine.snapMacros(DEFAULT_MACROS)
      const l = new Float32Array(SR * 3)
      engine.render(l, new Float32Array(SR * 3), SR * 3)
      return l
    }
    expect(Array.from(render('midnight garden'))).toEqual(Array.from(render('midnight garden')))
    expect(Array.from(render('midnight garden'))).not.toEqual(Array.from(render('midnight  garden')))
    expect(Array.from(render('for anna'))).not.toEqual(Array.from(render('For Anna')))
  })
})
