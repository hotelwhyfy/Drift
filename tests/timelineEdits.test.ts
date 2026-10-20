import { describe, it, expect } from 'vitest'
import { withMacroTrack } from '@/song/withMacroTrack.ts'
import { withLength } from '@/song/withLength.ts'
import { withTuning } from '@/song/withTuning.ts'
import { withSlotLane } from '@/automation/withSlotLane.ts'
import { addSongLane } from '@/automation/addSongLane.ts'
import { isSongLane } from '@/automation/isSongLane.ts'
import { makeLane } from '@/automation/lane.ts'
import type { Lane } from '@/automation/lane.ts'
import { automationLaneOptions } from '@/ui/timeline/automationLaneOptions.ts'
import { defaultSlots } from '@/ui/rack/defaultSlots.ts'
import { instrumentById } from '@/instruments/registry.ts'
import { controlsOf } from '@/instruments/controlsOf.ts'
import { DEFAULT_SONG, MAX_SONG_BARS, MIN_TUNING, MAX_TUNING } from '@/song/song.ts'
import type { MacroTrack } from '@/song/types.ts'

const track = (value: number): MacroTrack =>
  ({ enabled: true, envelope: { points: [{ bar: 0, value, shape: 'linear' }] } })

describe('withMacroTrack', () => {
  it('adds, replaces and removes one track without touching the others or the original', () => {
    const base = { ...DEFAULT_SONG, macros: { warmth: track(0.1) } }
    const added = withMacroTrack(base, 'space', track(0.9))
    expect(added.macros).toEqual({ warmth: track(0.1), space: track(0.9) })
    expect(base.macros).toEqual({ warmth: track(0.1) })

    const replaced = withMacroTrack(added, 'warmth', track(0.5))
    expect(replaced.macros.warmth).toEqual(track(0.5))
    expect(replaced.macros.space).toBe(added.macros.space)

    const removed = withMacroTrack(replaced, 'warmth', undefined)
    expect(Object.keys(removed.macros)).toEqual(['space'])
    expect(removed.lengthBars).toBe(DEFAULT_SONG.lengthBars)
  })
})

describe('withLength', () => {
  it('rounds and keeps the length within 1 and the maximum', () => {
    expect(withLength(DEFAULT_SONG, 100.4)?.lengthBars).toBe(100)
    expect(withLength(DEFAULT_SONG, 100.5)?.lengthBars).toBe(101)
    expect(withLength(DEFAULT_SONG, 0)?.lengthBars).toBe(1)
    expect(withLength(DEFAULT_SONG, -20)?.lengthBars).toBe(1)
    expect(withLength(DEFAULT_SONG, MAX_SONG_BARS + 500)?.lengthBars).toBe(MAX_SONG_BARS)
  })

  it('leaves the rest of the song alone, and refuses something that is not a number', () => {
    const song = { ...DEFAULT_SONG, end: 'stop' as const, tuning: 432 }
    expect(withLength(song, 8)).toEqual({ ...song, lengthBars: 8 })
    expect(withLength(song, Number.NaN)).toBeNull()
    expect(withLength(song, Infinity)).toBeNull()
  })
})

describe('withTuning', () => {
  it('rounds to a tenth and keeps A4 within range', () => {
    expect(withTuning(DEFAULT_SONG, '441.26')?.tuning).toBe(441.3)
    expect(withTuning(DEFAULT_SONG, '432')?.tuning).toBe(432)
    expect(withTuning(DEFAULT_SONG, '1')?.tuning).toBe(MIN_TUNING)
    expect(withTuning(DEFAULT_SONG, '5000')?.tuning).toBe(MAX_TUNING)
  })

  it('hands the reference back to the dials when emptied, and ignores nonsense', () => {
    const tuned = { ...DEFAULT_SONG, tuning: 432 }
    expect(withTuning(tuned, '')?.tuning).toBeNull()
    expect(withTuning(tuned, '   ')?.tuning).toBeNull()
    expect(withTuning(tuned, 'loud')).toBeNull()
    expect(tuned.tuning).toBe(432)
  })
})

describe('song lanes', () => {
  const songLane = (id: string): Lane => ({ ...makeLane(id, { kind: 'level' }), source: { kind: 'song', envelope: { points: [] } } })

  it('tells timeline lanes from looped and generated ones', () => {
    expect(isSongLane(songLane('a'))).toBe(true)
    expect(isSongLane(makeLane('b', { kind: 'level' }))).toBe(false)
  })

  it('replaces or removes one lane of one slot only', () => {
    const slots = defaultSlots()
    slots[0] = { ...slots[0], lanes: [songLane('a'), songLane('b')] }
    slots[1] = { ...slots[1], lanes: [songLane('a')] }

    const swapped = withSlotLane(slots, slots[0].id, 'a', { ...songLane('a'), enabled: false })
    expect(swapped[0].lanes[0].enabled).toBe(false)
    expect(swapped[0].lanes[1]).toBe(slots[0].lanes[1])
    expect(swapped[1]).toBe(slots[1])

    const removed = withSlotLane(slots, slots[0].id, 'a', null)
    expect(removed[0].lanes.map((l) => l.id)).toEqual(['b'])
    expect(removed[1].lanes.map((l) => l.id)).toEqual(['a'])
    expect(slots[0].lanes).toHaveLength(2)
  })

  it('adds an empty lane for a slot level or parameter, with an id from the stamp', () => {
    const slots = defaultSlots()
    const level = addSongLane(slots, `${slots[0].id}|level`, 'x1')!
    expect(level[0].lanes).toEqual([{
      id: 'pad-0-song-x1', target: { kind: 'level' }, source: { kind: 'song', envelope: { points: [] } },
      depth: 1, bars: 4, mode: 'set', enabled: true,
    }])
    expect(level[1]).toBe(slots[1])

    const param = controlsOf(instrumentById('strings')!)[0].param
    const withParam = addSongLane(level, `${slots[1].id}|${param}`, 'x2')!
    expect(withParam[1].lanes[0].target).toEqual({ kind: 'param', param })
    expect(withParam[0].lanes).toHaveLength(1)
  })

  it('adds nothing for a value that names no slot or no target', () => {
    const slots = defaultSlots()
    expect(addSongLane(slots, 'ghost|level', 's')).toBeNull()
    expect(addSongLane(slots, `${slots[0].id}`, 's')).toBeNull()
    expect(addSongLane(slots, `${slots[0].id}|`, 's')).toBeNull()
  })
})

describe('automationLaneOptions', () => {
  it('groups each instrument with its level and controls, and skips one it does not know', () => {
    const slots = [...defaultSlots(), { ...defaultSlots()[0], id: 'ghost-9', defId: 'nothing', name: 'Ghost' }]
    const groups = automationLaneOptions(slots)
    expect(groups.map((g) => g.group)).toEqual(defaultSlots().map((s) => s.name))

    const pad = groups[0]
    expect(pad.options[0]).toEqual({ value: 'pad-0|level', label: 'level' })
    const controls = controlsOf(instrumentById('pad')!)
    expect(pad.options.slice(1)).toEqual(controls.map((c) => ({ value: `pad-0|${c.param}`, label: c.label.toLowerCase() })))
  })
})
