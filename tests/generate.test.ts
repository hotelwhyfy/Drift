import { describe, it, expect } from 'vitest'
import { generateDrift } from '../src/generate/generateDrift.ts'
import { readProject, writeProject } from '../src/project/project.ts'
import { instrumentById, INSTRUMENTS } from '../src/instruments/registry.ts'
import { MACRO_KEYS } from '../src/macros/macros.ts'
import { EXPRESSION_KEYS } from '../src/fuzzy/expression.ts'

const NAMES = Array.from({ length: 200 }, (_, i) => `test-seed-${i}`)

describe('generateDrift', () => {
  it('is a pure function of the seed name', () => {
    expect(generateDrift('amber-moss-42')).toEqual(generateDrift('amber-moss-42'))
    expect(generateDrift('amber-moss-42')).not.toEqual(generateDrift('amber-moss-43'))
  })

  it('keeps every dial, level and character in range', () => {
    for (const name of NAMES) {
      const { macros, slots, song } = generateDrift(name)
      for (const key of MACRO_KEYS) {
        expect(macros[key]).toBeGreaterThanOrEqual(0)
        expect(macros[key]).toBeLessThanOrEqual(1)
      }
      for (const s of slots) {
        expect(s.level).toBeGreaterThanOrEqual(0)
        expect(s.level).toBeLessThanOrEqual(1)
        for (const key of EXPRESSION_KEYS) {
          expect(s.expression[key]).toBeGreaterThanOrEqual(0)
          expect(s.expression[key]).toBeLessThanOrEqual(1)
        }
      }
      for (const track of Object.values(song.macros)) {
        for (const p of track?.envelope.points ?? []) {
          expect(p.value).toBeGreaterThanOrEqual(0)
          expect(p.value).toBeLessThanOrEqual(1)
          expect(p.bar).toBeLessThanOrEqual(song.lengthBars)
        }
      }
    }
  })

  it('always has a pad, a bed and something playing notes, with known instruments and unique ids', () => {
    for (const name of NAMES) {
      const { slots } = generateDrift(name)
      const ids = slots.map((s) => s.defId)
      expect(ids).toContain('pad')
      expect(ids).toContain('bed')
      expect(ids.some((id) => ['rhodes', 'strings', 'shimmer', 'glass'].includes(id))).toBe(true)
      expect(new Set(ids).size).toBe(ids.length)
      expect(new Set(slots.map((s) => s.id)).size).toBe(slots.length)
      for (const id of ids) expect(instrumentById(id)).toBeDefined()
    }
  })

  it('can bring every instrument there is', () => {
    // An instrument the generator never picks is one most people never hear.
    const seen = new Set<string>()
    for (let i = 0; i < 200; i++) for (const s of generateDrift(`any ${i}`).slots) seen.add(s.defId)
    for (const def of INSTRUMENTS) expect(seen).toContain(def.id)
  })

  it('only brings a kit when the dials have real pulse', () => {
    for (const name of NAMES) {
      const { macros, slots } = generateDrift(name)
      if (slots.some((s) => s.defId === 'kit')) expect(macros.pulse).toBeGreaterThanOrEqual(0.4)
    }
  })

  it('gives the song an arc on two or three dials, never warmth', () => {
    for (const name of NAMES) {
      const { song } = generateDrift(name)
      const driven = Object.keys(song.macros)
      expect(driven.length).toBeGreaterThanOrEqual(2)
      expect(driven.length).toBeLessThanOrEqual(3)
      expect(driven).not.toContain('warmth')
    }
  })

  it('survives a save and open unchanged and without warnings', () => {
    for (const name of NAMES.slice(0, 20)) {
      const drift = generateDrift(name)
      const text = writeProject({ name, seedName: name, ...drift }, '2026-01-01T00:00:00.000Z')
      const { project, warnings } = readProject(text)
      expect(warnings).toEqual([])
      expect(writeProject({ name, seedName: name, macros: project.macros, slots: project.slots, song: project.song }, '2026-01-01T00:00:00.000Z')).toBe(text)
    }
  })
})
