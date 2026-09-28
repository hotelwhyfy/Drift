import { describe, it, expect } from 'vitest'
import { Resolver, beatStrength } from '../src/harmony/resolver.ts'
import type { HarmonicContext, NoteIntent, Role } from '../src/harmony/resolver.ts'
import { MODES, buildChord, voiceNear, chordStack } from '../src/core/theory.ts'
import { Harmony } from '../src/compose/harmony.ts'
import { Engine } from '../src/engine/engine.ts'
import { buildPatch } from '../src/macros/patch.ts'
import { DEFAULT_MACROS } from '../src/macros/macros.ts'
import { DEFAULT_SONG, autoSection } from '../src/song/song.ts'
import type { Song, HarmonySection } from '../src/song/song.ts'
import { composeAt } from '../src/song/composeAt.ts'
import { sectionAt } from '../src/song/sectionAt.ts'


const dorian = MODES[2]

function context(rootMidi = 48, degree = 0): HarmonicContext {
  const notes = buildChord(dorian, rootMidi + 24, degree, 0.6)
  return {
    chord: { degree, notes: voiceNear(notes, [], rootMidi + 22), root: rootMidi + dorian.steps[degree % 7] },
    mode: dorian,
    rootMidi,
  }
}

/** Semitone classes that belong to the mode, relative to the root. */
const scalePcs = (ctx: HarmonicContext): Set<number> =>
  new Set(ctx.mode.steps.map((s) => (ctx.rootMidi + s) % 12))

const chordPcs = (ctx: HarmonicContext): Set<number> =>
  new Set(ctx.chord.notes.map((n) => ((n % 12) + 12) % 12))

describe('the resolver', () => {
  it('puts only chord tones on strong beats', () => {
    // The claim the whole design rests on. Beat one is load-bearing; if a
    // non-chord tone can land there, "impossible to play a wrong note" is false.
    const ctx = context()
    const resolver = new Resolver(1)
    const tones = chordPcs(ctx)
    for (let trial = 0; trial < 400; trial++) {
      resolver.beginBar(0)
      const intent: NoteIntent = {
        role: 'melodic',
        contour: (trial % 21) / 10 - 1,
        weight: 0.7,
        step: 0,
        lengthSteps: 4,
      }
      const midi = resolver.resolve(intent, ctx, Resolver.registerFor('melodic', 48), 'x')
      if (midi === null) continue
      expect(tones.has(((midi % 12) + 12) % 12)).toBe(true)
    }
  })

  it('never lets the bass leave the root on a downbeat', () => {
    const ctx = context(48, 3)
    const resolver = new Resolver(9)
    const rootPc = ((ctx.chord.root % 12) + 12) % 12
    for (let trial = 0; trial < 200; trial++) {
      resolver.beginBar(0)
      const midi = resolver.resolve(
        { role: 'bass', contour: (trial % 11) / 5 - 1, weight: 0.9, step: 0, lengthSteps: 8 },
        ctx, Resolver.registerFor('bass', 48), 'bass',
      )
      if (midi === null) continue
      expect(((midi % 12) + 12) % 12).toBe(rootPc)
    }
  })

  it('keeps chromatic notes off anything but the weakest positions', () => {
    const ctx = context()
    const resolver = new Resolver(5)
    const allowed = new Set([...scalePcs(ctx), ...chordPcs(ctx)])
    for (const step of [0, 4, 8, 12]) {
      for (let trial = 0; trial < 120; trial++) {
        resolver.beginBar(0)
        const midi = resolver.resolve(
          { role: 'melodic', contour: (trial % 13) / 6 - 1, weight: 0.6, step, lengthSteps: 2 },
          ctx, Resolver.registerFor('melodic', 48), 'x',
        )
        if (midi === null) continue
        expect(allowed.has(((midi % 12) + 12) % 12)).toBe(true)
      }
    }
  })

  it('refuses semitone and unison collisions between overlapping parts', () => {
    // The wrong notes that matter most are not wrong alone — they are two
    // parts colliding. Only something seeing all of them can prevent that.
    // Notes that do not overlap in time cannot collide, so a line is free to
    // move by a semitone; the check is against simultaneity, not adjacency.
    const ctx = context()
    const resolver = new Resolver(3)
    interface Sound { pitch: number; owner: string; start: number; end: number }
    for (let bar = 0; bar < 200; bar++) {
      resolver.beginBar(0)
      const sounds: Sound[] = []
      const roles: Role[] = ['bass', 'chordal', 'melodic', 'colour']
      roles.forEach((role, i) => {
        for (let k = 0; k < 3; k++) {
          const step = (bar + k * 3) % 16
          const lengthSteps = 4
          const midi = resolver.resolve(
            { role, contour: ((bar + k) % 9) / 4 - 1, weight: 0.6, step, lengthSteps },
            ctx, Resolver.registerFor(role, 48), `slot-${i}`,
          )
          if (midi !== null) {
            sounds.push({ pitch: midi, owner: `slot-${i}`, start: step, end: step + lengthSteps })
          }
        }
      })
      for (let a = 0; a < sounds.length; a++) {
        for (let b = a + 1; b < sounds.length; b++) {
          const x = sounds[a]
          const y = sounds[b]
          const overlaps = x.start < y.end && y.start < x.end
          if (!overlaps) continue
          if (x.owner === y.owner) continue
          const gap = Math.abs(x.pitch - y.pitch)
          expect(gap).not.toBe(0)
          expect(gap).not.toBe(1)
          expect(gap).not.toBe(13)
        }
      }
    }
  })

  it('resolves a bar the same way however much came before it', () => {
    // The resolver used to draw from a running random stream, which meant
    // bar 50's chromatic decisions depended on how many notes had been
    // resolved before it — so seeking there gave different music from playing
    // there. The seekability test at the rack level did not catch it, because
    // both of its paths happened to resolve the same notes. This one compares
    // a resolver that has done a lot of work with one that has done none.
    const ctx = context()
    const play = (resolver: Resolver, bars: number[]): (number | null)[] => {
      const out: (number | null)[] = []
      for (const bar of bars) {
        resolver.beginBar(bar)
        for (let step = 0; step < 16; step++) {
          out.push(resolver.resolve(
            { role: 'melodic', contour: ((bar + step) % 17) / 8 - 1, weight: 0.5, step, lengthSteps: 1 },
            ctx, Resolver.registerFor('melodic', 48), 'x',
          ))
        }
      }
      return out
    }
    const warmed = new Resolver(21)
    play(warmed, Array.from({ length: 50 }, (_, i) => i))
    const afterPlaying = play(warmed, [50])
    const afterSeeking = play(new Resolver(21), [50])
    expect(afterSeeking).toEqual(afterPlaying)
  })

  it('ranks metrical positions so beat one outweighs the offbeats', () => {
    expect(beatStrength(0)).toBeGreaterThan(beatStrength(8))
    expect(beatStrength(8)).toBeGreaterThan(beatStrength(4))
    expect(beatStrength(4)).toBeGreaterThan(beatStrength(2))
    expect(beatStrength(2)).toBeGreaterThan(beatStrength(1))
  })

  it('honours the register it is given', () => {
    const ctx = context()
    const resolver = new Resolver(11)
    const register = Resolver.registerFor('melodic', 48)
    for (let i = 0; i < 300; i++) {
      resolver.beginBar(0)
      const midi = resolver.resolve(
        { role: 'melodic', contour: (i % 21) / 10 - 1, weight: 0.5, step: 6, lengthSteps: 2 },
        ctx, register, 'x',
      )
      if (midi === null) continue
      expect(midi).toBeGreaterThanOrEqual(register.centre - register.span - 6)
      expect(midi).toBeLessThanOrEqual(register.centre + register.span + 6)
    }
  })
})

describe('harmony sections', () => {
  const base = buildPatch(DEFAULT_MACROS).compose

  it('plays a hand-picked progression on the bars it was asked for', () => {
    const section: HarmonySection = { ...autoSection(0), style: 'custom', degrees: [0, 5, 3, 4], chordBars: 2 }
    const h = new Harmony(1)
    const at = (bar: number): number => h.at(bar, () => composeAt(base, section)).degree
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8].map(at)).toEqual([0, 0, 5, 5, 3, 3, 4, 4, 0])
  })

  it('changes chord at a section start and is the same however it is reached', () => {
    const song: Song = {
      ...DEFAULT_SONG,
      harmony: [
        { ...autoSection(0), chordBars: 8 },
        { ...autoSection(13), key: 2, mode: 'lydian', style: 'circle', chordBars: 2 },
      ],
    }
    const settingsAt = (bar: number) => composeAt(base, sectionAt(song, bar))
    const walked = new Harmony(6)
    const played = Array.from({ length: 30 }, (_, bar) => walked.at(bar, settingsAt))
    // Bar 13 is not on the old eight-bar grid, but a section start is a chord change.
    expect(played[13].degree).toBe(0)
    expect(played[15].degree).toBe(3)
    for (const bar of [12, 13, 14, 21, 29]) {
      expect(new Harmony(6).at(bar, settingsAt)).toEqual(played[bar])
    }
  })

  it('leaves the third out of suspended chords', () => {
    for (const richness of [0, 0.5, 1]) {
      expect(chordStack('sus4', richness)).not.toContain(2)
      expect(chordStack('sus2', richness)).not.toContain(2)
    }
    expect(chordStack('ninth', 0)).toEqual([0, 2, 4, 6, 8])
  })

  it('puts the song in the key and mode a section asks for', () => {
    // A dorian: A B C D E F# G.
    const song: Song = { ...DEFAULT_SONG, harmony: [{ ...autoSection(0), key: 9, mode: 'dorian' }] }
    const engine = new Engine(24000, DEFAULT_MACROS, 4)
    engine.setSong(song)
    engine.snapMacros(DEFAULT_MACROS)
    engine.seek(0)
    const allowed = new Set([9, 11, 0, 2, 4, 6, 7])
    let checked = 0
    for (let bar = 0; bar < 6; bar++) {
      for (const ev of engine.barEvents) {
        // Chordal and bass parts only: the melodic line may take a chromatic
        // approach on its weakest steps, by design.
        if (ev.midi === undefined || !/^(pad|sub)/.test(ev.slotId)) continue
        expect(allowed.has(ev.midi % 12)).toBe(true)
        checked++
      }
      engine.render(new Float32Array(24000 * 4), new Float32Array(24000 * 4), 24000 * 4)
    }
    expect(checked).toBeGreaterThan(5)
    expect(engine.snapshot().modeName).toBe('dorian')
    expect(engine.snapshot().rootMidi % 12).toBe(9)
  })
})
