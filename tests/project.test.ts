import { describe, it, expect } from 'vitest'
import { readProject, writeProject, projectFilename } from '../src/project/project.ts'
import type { SlotDesc } from '../src/engine/rack.ts'
import { DEFAULT_MACROS } from '../src/macros/macros.ts'
import { NEUTRAL } from '../src/fuzzy/expression.ts'
import { curveFromStroke } from '../src/automation/curve.ts'

function slot(overrides: Partial<SlotDesc> = {}): SlotDesc {
  return {
    id: 'rhodes-1',
    defId: 'rhodes',
    name: 'Rhodes',
    level: 0.72,
    muted: false,
    soloed: false,
    expression: { ...NEUTRAL, brightness: 0.8 },
    follow: 0.45,
    lanes: [],
    ...overrides,
  }
}

const drawn = curveFromStroke(
  Array.from({ length: 40 }, (_, i) => ({ x: i / 39, y: 0.5 + 0.4 * Math.sin(i / 5) })),
)

describe('project files', () => {
  it('round-trips a project including drawn automation', () => {
    const slots = [slot({
      lanes: [{
        id: 'lane-1',
        target: { kind: 'expression', key: 'motion' },
        source: { kind: 'curve', curve: drawn },
        depth: 0.8,
        bars: 8,
        mode: 'set',
        enabled: true,
      }],
    })]
    const text = writeProject(
      { name: 'Night Shift', macros: DEFAULT_MACROS, seedName: 'moss-tide-12', slots },
      '2026-09-15T00:00:00.000Z',
    )
    const { project, warnings } = readProject(text)
    expect(warnings).toEqual([])
    expect(project.name).toBe('Night Shift')
    expect(project.seedName).toBe('moss-tide-12')
    expect(project.macros).toEqual(DEFAULT_MACROS)
    expect(project.slots[0].level).toBeCloseTo(0.72, 3)
    expect(project.slots[0].follow).toBeCloseTo(0.45, 3)
    expect(project.slots[0].expression.brightness).toBeCloseTo(0.8, 3)

    const lane = project.slots[0].lanes[0]
    expect(lane.bars).toBe(8)
    expect(lane.target).toEqual({ kind: 'expression', key: 'motion' })
    if (lane.source.kind !== 'curve') throw new Error('expected a drawn curve')
    // Points survive to the precision they were stored at.
    for (let i = 0; i < drawn.points.length; i++) {
      expect(lane.source.curve.points[i]).toBeCloseTo(drawn.points[i], 2)
    }
  })

  it('recomputes gesture character rather than trusting the file', () => {
    const slots = [slot({
      lanes: [{
        id: 'l', target: { kind: 'level' }, source: { kind: 'curve', curve: drawn },
        depth: 1, bars: 4, mode: 'set', enabled: true,
      }],
    })]
    const text = writeProject({ name: 'x', macros: DEFAULT_MACROS, seedName: 's', slots }, 'now')
    const lane = readProject(text).project.slots[0].lanes[0]
    if (lane.source.kind !== 'curve') throw new Error('expected a drawn curve')
    expect(lane.source.curve.character.extent).toBeCloseTo(drawn.character.extent, 1)
  })

  it('skips instruments this build does not have, rather than failing', () => {
    // A project should still open on an older build, minus what it cannot play.
    const text = JSON.stringify({
      version: 1, name: 'future', seedName: 's', macros: DEFAULT_MACROS,
      slots: [{ defId: 'theremin' }, { defId: 'rhodes', id: 'r' }],
    })
    const { project, warnings } = readProject(text)
    expect(project.slots).toHaveLength(1)
    expect(project.slots[0].defId).toBe('rhodes')
    expect(warnings.some((w) => w.includes('Skipped'))).toBe(true)
  })

  it('repairs damaged fields instead of throwing', () => {
    const text = JSON.stringify({
      version: 1, name: 'bent', seedName: 's',
      macros: { warmth: 'very', colour: 4, drift: null },
      slots: [{
        defId: 'pad', id: 'p', level: 99, follow: -3, muted: 'yes',
        expression: { brightness: NaN }, lanes: [{ source: { kind: 'nonsense' } }],
      }],
    })
    const { project } = readProject(text)
    expect(project.macros.warmth).toBe(DEFAULT_MACROS.warmth)
    expect(project.macros.colour).toBe(1)
    expect(project.slots[0].level).toBe(1)
    expect(project.slots[0].follow).toBe(0)
    expect(project.slots[0].muted).toBe(false)
    expect(project.slots[0].expression.brightness).toBe(NEUTRAL.brightness)
    expect(project.slots[0].lanes[0].source.kind).toBe('curve')
  })

  it('rejects files that are not projects', () => {
    expect(() => readProject('not json')).toThrow(/valid JSON/)
    expect(() => readProject('{"hello":1}')).toThrow(/drift project/)
    expect(() => readProject('[]')).toThrow(/drift project/)
  })

  it('makes safe filenames', () => {
    expect(projectFilename('Night Shift #2')).toBe('night-shift-2.drift.json')
    expect(projectFilename('   ')).toBe('untitled.drift.json')
  })
})
