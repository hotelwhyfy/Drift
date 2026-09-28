import type { Macros } from '../macros/macros.ts'
import { DEFAULT_MACROS, MACRO_KEYS } from '../macros/macros.ts'
import type { SlotDesc } from '../engine/rack.ts'
import type { Lane, LaneSource, LaneTarget, LaneMode } from '../automation/lane.ts'
import { curveFromPoints, flatCurve } from '../automation/curve.ts'
import type { Expression } from '../fuzzy/expression.ts'
import { EXPRESSION_KEYS, NEUTRAL } from '../fuzzy/expression.ts'
import { instrumentById } from '../instruments/registry.ts'
import { paramSpecOf } from '../instruments/paramSpecOf.ts'
import type { InstrumentDef } from '../instruments/types.ts'
import {
  DEFAULT_SONG, MAX_SONG_BARS, BREAKPOINT_SHAPES, PROGRESSION_STYLES, EXTENSIONS,
  CHORD_BAR_CHOICES,
} from '../song/song.ts'
import type { Song, Envelope, Breakpoint, MacroTrack, HarmonySection, SongEnd } from '../song/song.ts'
import type { MacroKey } from '../macros/macros.ts'
import { MODES } from '../core/theory.ts'

/** Loop lengths are clamped here; far longer than any sensible loop, short of absurd. */
const MAX_LANE_BARS = 1024

export const PROJECT_VERSION = 2
export const PROJECT_EXTENSION = '.drift.json'

export interface Project {
  version: number
  name: string
  saved: string
  macros: Macros
  seedName: string
  slots: SlotDesc[]
  song: Song
}

/**
 * Project files.
 *
 * Everything needed to reproduce a piece exactly: the macro positions, the
 * seed, every instrument with its expression and follow amount, and every
 * automation lane including the points of anything drawn by hand. Because the
 * engine is deterministic, that really is the whole piece — the file stores no
 * audio because it does not need to.
 *
 * Reading is defensive throughout. A project file is something a person can
 * edit, email, or keep for a year across versions of the app, so every field is
 * checked and anything unusable falls back to a sane default rather than
 * throwing. Losing one automation lane is a far better outcome than a file that
 * will not open.
 */

const num = (v: unknown, fallback: number, lo = 0, hi = 1): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback

const bool = (v: unknown, fallback = false): boolean =>
  typeof v === 'boolean' ? v : fallback

const str = (v: unknown, fallback: string): string =>
  typeof v === 'string' && v.length > 0 ? v : fallback

function readMacros(raw: unknown): Macros {
  const out: Macros = { ...DEFAULT_MACROS }
  if (typeof raw !== 'object' || raw === null) return out
  const record: Record<string, unknown> = { ...raw }
  for (const key of MACRO_KEYS) out[key] = num(record[key], DEFAULT_MACROS[key])
  return out
}

function readExpression(raw: unknown): Expression {
  const out: Expression = { ...NEUTRAL }
  if (typeof raw !== 'object' || raw === null) return out
  const record: Record<string, unknown> = { ...raw }
  for (const key of EXPRESSION_KEYS) out[key] = num(record[key], NEUTRAL[key])
  return out
}

function readTarget(raw: unknown): LaneTarget {
  if (typeof raw === 'object' && raw !== null) {
    const record: Record<string, unknown> = { ...raw }
    if (record.kind === 'level') return { kind: 'level' }
    if (record.kind === 'param' && typeof record.param === 'string') {
      return { kind: 'param', param: record.param }
    }
    if (record.kind === 'expression') {
      const key = EXPRESSION_KEYS.find((k) => k === record.key)
      if (key) return { kind: 'expression', key }
    }
  }
  return { kind: 'expression', key: 'motion' }
}

function readSource(raw: unknown): LaneSource {
  if (typeof raw === 'object' && raw !== null) {
    const record: Record<string, unknown> = { ...raw }
    if (record.kind === 'curve' && Array.isArray(record.points)) {
      const points = record.points.map((p) => (typeof p === 'number' ? p : 0.5))
      return { kind: 'curve', curve: curveFromPoints(points) }
    }
    if (record.kind === 'walk') {
      return {
        kind: 'walk',
        smoothness: num(record.smoothness, 0.7),
        seed: num(record.seed, 1, 0, Number.MAX_SAFE_INTEGER),
      }
    }
    if (record.kind === 'lfo') {
      const shapes = ['sine', 'triangle', 'ramp', 'square'] as const
      const shape = shapes.find((s) => s === record.shape) ?? 'sine'
      return { kind: 'lfo', shape, bars: num(record.bars, 4, 0.25, MAX_LANE_BARS), phase: num(record.phase, 0) }
    }
    if (record.kind === 'follow') {
      return { kind: 'follow', of: record.of === 'level' ? 'level' : 'kick' }
    }
    if (record.kind === 'song') {
      return { kind: 'song', envelope: readEnvelope(record.points) }
    }
  }
  return { kind: 'curve', curve: flatCurve(0.5) }
}

function readLane(raw: unknown, index: number, slotId: string): Lane {
  const record: Record<string, unknown> =
    typeof raw === 'object' && raw !== null ? { ...raw } : {}
  const modes: LaneMode[] = ['set', 'add', 'scale']
  return {
    id: str(record.id, `${slotId}-lane-${index}`),
    target: readTarget(record.target),
    source: readSource(record.source),
    depth: num(record.depth, 1),
    bars: num(record.bars, 4, 0.25, MAX_LANE_BARS),
    mode: modes.find((m) => m === record.mode) ?? 'set',
    enabled: bool(record.enabled, true),
  }
}

/**
 * Knob settings. Only names the instrument actually has survive: a knob for a
 * parameter that was renamed or removed would otherwise sit in the file
 * forever, doing nothing and impossible to see.
 */
function readKnobs(raw: unknown, def: InstrumentDef): Record<string, number> {
  const out: Record<string, number> = {}
  if (typeof raw !== 'object' || raw === null) return out
  for (const [name, value] of Object.entries(raw)) {
    if (!paramSpecOf(def, name)) continue
    if (typeof value !== 'number' || !Number.isFinite(value)) continue
    out[name] = Math.min(1, Math.max(0, value))
  }
  return out
}

/**
 * Breakpoints, stored as `[bar, value, shape]`. Anything unreadable is dropped,
 * the rest is clamped and sorted, and two points on the same bar keep the later
 * one — the order a person editing the file by hand would expect to win.
 */
function readEnvelope(raw: unknown): Envelope {
  if (!Array.isArray(raw)) return { points: [] }
  const points: Breakpoint[] = []
  for (const entry of raw) {
    const fields: unknown[] = Array.isArray(entry)
      ? entry
      : typeof entry === 'object' && entry !== null
        ? [Reflect.get(entry, 'bar'), Reflect.get(entry, 'value'), Reflect.get(entry, 'shape')]
        : []
    const [bar, value, shape] = fields
    if (typeof bar !== 'number' || !Number.isFinite(bar)) continue
    if (typeof value !== 'number' || !Number.isFinite(value)) continue
    points.push({
      bar: Math.min(MAX_SONG_BARS, Math.max(0, bar)),
      value: Math.min(1, Math.max(0, value)),
      shape: BREAKPOINT_SHAPES.find((s) => s === shape) ?? 'linear',
    })
  }
  points.sort((a, b) => a.bar - b.bar)
  const unique: Breakpoint[] = []
  for (const p of points) {
    if (unique.length > 0 && unique[unique.length - 1].bar === p.bar) unique[unique.length - 1] = p
    else unique.push(p)
  }
  return { points: unique }
}

function readSection(raw: unknown): HarmonySection | null {
  if (typeof raw !== 'object' || raw === null) return null
  const record: Record<string, unknown> = { ...raw }
  const key = typeof record.key === 'number' && Number.isFinite(record.key)
    ? ((Math.round(record.key) % 12) + 12) % 12
    : null
  const degrees = Array.isArray(record.degrees)
    ? record.degrees
      .filter((d): d is number => typeof d === 'number' && Number.isFinite(d))
      .map((d) => Math.min(6, Math.max(0, Math.round(d))))
      .slice(0, 16)
    : []
  return {
    startBar: Math.round(num(record.startBar, 0, 0, MAX_SONG_BARS)),
    key,
    // A mode this build does not know becomes "the dials decide" rather than
    // a guess at the nearest one.
    mode: MODES.find((m) => m.name === record.mode)?.name ?? null,
    style: PROGRESSION_STYLES.find((s) => s === record.style) ?? 'drift',
    degrees: degrees.length > 0 ? degrees : [0, 5, 3, 4],
    chordBars: CHORD_BAR_CHOICES.find((c) => c === record.chordBars) ?? null,
    extensions: EXTENSIONS.find((e) => e === record.extensions) ?? 'auto',
  }
}

/** A missing or unreadable song is an empty one, which plays as the endless stream. */
function readSong(raw: unknown): Song {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_SONG
  const record: Record<string, unknown> = { ...raw }
  const ends: SongEnd[] = ['loop', 'hold', 'stop']
  const macros: Partial<Record<MacroKey, MacroTrack>> = {}
  if (typeof record.macros === 'object' && record.macros !== null) {
    const tracks: Record<string, unknown> = { ...record.macros }
    for (const key of MACRO_KEYS) {
      const track = tracks[key]
      if (typeof track !== 'object' || track === null) continue
      const envelope = readEnvelope(Reflect.get(track, 'points'))
      if (envelope.points.length === 0) continue
      macros[key] = { enabled: bool(Reflect.get(track, 'enabled'), true), envelope }
    }
  }
  const sections = Array.isArray(record.harmony)
    ? record.harmony.map(readSection).filter((s): s is HarmonySection => s !== null)
    : []
  sections.sort((a, b) => a.startBar - b.startBar)
  const harmony = sections.filter((s, i) => i === sections.length - 1 || sections[i + 1].startBar !== s.startBar)
  return {
    lengthBars: Math.round(num(record.lengthBars, DEFAULT_SONG.lengthBars, 1, MAX_SONG_BARS)),
    end: ends.find((e) => e === record.end) ?? DEFAULT_SONG.end,
    macros,
    harmony,
  }
}

function readSlot(raw: unknown, index: number): SlotDesc | null {
  if (typeof raw !== 'object' || raw === null) return null
  const record: Record<string, unknown> = { ...raw }
  const defId = str(record.defId, '')
  const def = instrumentById(defId)
  // An instrument this build does not have is skipped rather than faked, so a
  // file from a newer version still opens with everything it recognises.
  if (!def) return null
  const id = str(record.id, `${defId}-${index}`)
  const lanes = Array.isArray(record.lanes)
    ? record.lanes.map((l, i) => readLane(l, i, id))
    : []
  return {
    id,
    defId,
    name: str(record.name, def.name),
    level: num(record.level, 0.8),
    muted: bool(record.muted),
    soloed: bool(record.soloed),
    expression: readExpression(record.expression),
    follow: num(record.follow, 1),
    lanes,
    // Version 1 files predate knobs; an empty set means "the rules decide",
    // which is exactly how those files sounded.
    knobs: readKnobs(record.knobs, def),
  }
}

export interface ReadResult {
  project: Project
  /** Anything dropped or repaired on the way in, to tell the user about. */
  warnings: string[]
}

export function readProject(text: string): ReadResult {
  const warnings: string[] = []
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('That file is not valid JSON.')
  }
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('That file does not look like a drift project.')
  }
  const record: Record<string, unknown> = { ...raw }
  if (typeof record.macros !== 'object' || !Array.isArray(record.slots)) {
    throw new Error('That file does not look like a drift project.')
  }
  const version = num(record.version, 0, 0, 1000)
  if (version > PROJECT_VERSION) {
    warnings.push(`Saved by a newer version (${version}); unknown settings ignored.`)
  }

  const slots: SlotDesc[] = []
  record.slots.forEach((s, i) => {
    const slot = readSlot(s, i)
    if (slot) slots.push(slot)
    else warnings.push('Skipped an instrument this version does not have.')
  })
  if (slots.length === 0) warnings.push('No instruments in that file were recognised.')

  return {
    project: {
      version: PROJECT_VERSION,
      name: str(record.name, 'untitled'),
      saved: str(record.saved, ''),
      macros: readMacros(record.macros),
      seedName: str(record.seedName, 'restored'),
      slots,
      song: readSong(record.song),
    },
    warnings,
  }
}

const round3 = (v: number): number => Math.round(v * 1000) / 1000

/** Plain arrays, never the typed or nested objects the engine holds. */
function writeEnvelope(env: Envelope): unknown[] {
  return env.points.map((p) => [round3(p.bar), round3(p.value), p.shape])
}

/** Points are rounded: three decimals is well under what a hand can draw. */
function writeSource(source: LaneSource): unknown {
  if (source.kind === 'curve') {
    return {
      kind: 'curve',
      points: Array.from(source.curve.points, round3),
    }
  }
  if (source.kind === 'song') return { kind: 'song', points: writeEnvelope(source.envelope) }
  return source
}

function writeSong(song: Song): unknown {
  const macros: Record<string, unknown> = {}
  for (const key of MACRO_KEYS) {
    const track = song.macros[key]
    if (track) macros[key] = { enabled: track.enabled, points: writeEnvelope(track.envelope) }
  }
  return {
    lengthBars: song.lengthBars,
    end: song.end,
    macros,
    harmony: song.harmony.map((s) => ({ ...s, degrees: [...s.degrees] })),
  }
}

export function writeProject(project: Omit<Project, 'version' | 'saved'>, savedAt: string): string {
  const payload = {
    version: PROJECT_VERSION,
    name: project.name,
    saved: savedAt,
    macros: project.macros,
    seedName: project.seedName,
    song: writeSong(project.song),
    slots: project.slots.map((s) => ({
      id: s.id,
      defId: s.defId,
      name: s.name,
      level: Math.round(s.level * 1000) / 1000,
      muted: s.muted,
      soloed: s.soloed,
      expression: s.expression,
      follow: Math.round(s.follow * 1000) / 1000,
      knobs: Object.fromEntries(
        Object.entries(s.knobs).map(([k, v]) => [k, Math.round(v * 1000) / 1000]),
      ),
      lanes: s.lanes.map((l) => ({
        id: l.id,
        target: l.target,
        source: writeSource(l.source),
        depth: Math.round(l.depth * 1000) / 1000,
        bars: l.bars,
        mode: l.mode,
        enabled: l.enabled,
      })),
    })),
  }
  return JSON.stringify(payload, null, 2)
}

/** A filename that is safe everywhere and still recognisable. */
export function projectFilename(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `${slug || 'untitled'}${PROJECT_EXTENSION}`
}
