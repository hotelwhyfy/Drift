import { describe, it, expect } from 'vitest'
import { readProject, writeProject, projectFilename } from '../src/project/project.ts'
import type { SlotDesc } from '../src/engine/rack.ts'
import { DEFAULT_MACROS } from '../src/macros/macros.ts'
import { NEUTRAL } from '../src/fuzzy/expression.ts'
import { curveFromStroke } from '../src/automation/curve.ts'
import { DEFAULT_SONG } from '../src/song/song.ts'
import type { Song } from '../src/song/song.ts'

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
    knobs: {},
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
      { name: 'Night Shift', macros: DEFAULT_MACROS, seedName: 'moss-tide-12', slots, song: DEFAULT_SONG },
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
    const text = writeProject({ name: 'x', macros: DEFAULT_MACROS, seedName: 's', slots, song: DEFAULT_SONG }, 'now')
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

  it('round-trips knobs, and drops ones the instrument does not have', () => {
    const slots = [slot({ knobs: { tone: 0.25, bite: 1 } })]
    const text = writeProject({ name: 'k', macros: DEFAULT_MACROS, seedName: 's', slots, song: DEFAULT_SONG }, 'now')
    expect(readProject(text).project.slots[0].knobs).toEqual({ tone: 0.25, bite: 1 })

    const edited = JSON.parse(text)
    edited.slots[0].knobs = { tone: 7, bite: 'loud', wobble: 0.5, decay: 0.4 }
    const { project } = readProject(JSON.stringify(edited))
    expect(project.slots[0].knobs).toEqual({ tone: 1, decay: 0.4 })
  })

  it('opens a version 1 file, which has no knobs, as the rules deciding', () => {
    const text = JSON.stringify({
      version: 1, name: 'old', seedName: 's', macros: DEFAULT_MACROS,
      slots: [{ defId: 'pad', id: 'p', lanes: [{ bars: 200, source: { kind: 'lfo', bars: 500 } }] }],
    })
    const { project, warnings } = readProject(text)
    expect(warnings).toEqual([])
    expect(project.slots[0].knobs).toEqual({})
    // Loops longer than the old sixteen-bar menu survive.
    expect(project.slots[0].lanes[0].bars).toBe(200)
  })

  it('round-trips a song: its tracks, its harmony and a timeline lane', () => {
    const song: Song = {
      lengthBars: 480,
      end: 'loop',
      macros: {
        space: { enabled: true, envelope: { points: [{ bar: 0, value: 0.2, shape: 'smooth' }, { bar: 300.5, value: 0.9, shape: 'step' }] } },
        pulse: { enabled: false, envelope: { points: [{ bar: 12, value: 0.4, shape: 'linear' }] } },
      },
      harmony: [
        { startBar: 0, key: null, mode: null, style: 'drift', degrees: [0, 5, 3, 4], chordBars: null, extensions: 'auto' },
        { startBar: 64, key: 9, mode: 'dorian', style: 'custom', degrees: [0, 3, 4], chordBars: 2, extensions: 'sus2' },
      ],
    }
    const slots = [slot({
      lanes: [{
        id: 'tl', target: { kind: 'param', param: 'tone' },
        source: { kind: 'song', envelope: { points: [{ bar: 4, value: 0.25, shape: 'linear' }] } },
        depth: 1, bars: 4, mode: 'set', enabled: true,
      }],
    })]
    const text = writeProject({ name: 's', macros: DEFAULT_MACROS, seedName: 's', slots, song }, 'now')
    // Plain arrays on disk, nothing typed.
    expect(JSON.parse(text).song.macros.space.points[1]).toEqual([300.5, 0.9, 'step'])
    const { project, warnings } = readProject(text)
    expect(warnings).toEqual([])
    expect(project.song).toEqual(song)
    expect(project.slots[0].lanes[0].source).toEqual(slots[0].lanes[0].source)
  })

  it('opens a file without a song as the endless stream, and repairs a damaged one', () => {
    const bare = JSON.stringify({ version: 1, name: 'x', macros: DEFAULT_MACROS, slots: [{ defId: 'pad' }] })
    expect(readProject(bare).project.song).toEqual(DEFAULT_SONG)

    const bent = JSON.stringify({
      version: 2, name: 'x', macros: DEFAULT_MACROS, slots: [{ defId: 'pad' }],
      song: {
        lengthBars: -40,
        end: 'forever',
        macros: {
          warmth: { points: [[8, 2, 'wobbly'], ['x', 0.5], [2, 0.3], [8, 0.6, 'smooth'], null] },
          nonsense: { points: [[0, 0.5]] },
        },
        harmony: [{ startBar: 16, key: 14, mode: 'klingon', style: 'jazz', degrees: [9, 'a', 2], chordBars: 3 }, 'x'],
      },
    })
    const song = readProject(bent).project.song
    expect(song.lengthBars).toBe(1)
    expect(song.end).toBe('hold')
    expect(Object.keys(song.macros)).toEqual(['warmth'])
    // Sorted, clamped, and the later of two points on one bar kept.
    expect(song.macros.warmth?.envelope.points).toEqual([
      { bar: 2, value: 0.3, shape: 'linear' },
      { bar: 8, value: 0.6, shape: 'smooth' },
    ])
    expect(song.harmony).toEqual([
      { startBar: 16, key: 2, mode: null, style: 'drift', degrees: [6, 2], chordBars: null, extensions: 'auto' },
    ])
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
