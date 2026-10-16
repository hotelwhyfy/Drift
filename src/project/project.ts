import type { SlotDesc } from '@/engine/types.ts'
import { readNumber } from '@/project/read/readNumber.ts'
import { readString } from '@/project/read/readString.ts'
import { readMacros } from '@/project/read/readMacros.ts'
import { readSong } from '@/project/read/readSong.ts'
import { readSlot } from '@/project/read/readSlot.ts'
import { round3 } from '@/project/write/round3.ts'
import { writeSource } from '@/project/write/writeSource.ts'
import { writeSong } from '@/project/write/writeSong.ts'
import { PROJECT_VERSION, PROJECT_EXTENSION } from '@/project/constants.ts'
import type { Project, ReadResult } from '@/project/types.ts'

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
  const version = readNumber(record.version, 0, 0, 1000)
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
      name: readString(record.name, 'untitled'),
      saved: readString(record.saved, ''),
      macros: readMacros(record.macros),
      seedName: readString(record.seedName, 'restored'),
      slots,
      song: readSong(record.song),
    },
    warnings,
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
      level: round3(s.level),
      muted: s.muted,
      soloed: s.soloed,
      expression: s.expression,
      follow: round3(s.follow),
      knobs: Object.fromEntries(
        Object.entries(s.knobs).map(([k, v]) => [k, round3(v)]),
      ),
      lanes: s.lanes.map((l) => ({
        id: l.id,
        target: l.target,
        source: writeSource(l.source),
        depth: round3(l.depth),
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
