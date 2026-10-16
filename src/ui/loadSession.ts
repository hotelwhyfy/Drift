import type { Session } from '@/ui/types.ts'
import { readProject } from '@/project/project.ts'
import { blankSession } from '@/ui/blankSession.ts'
import { defaultSlots } from '@/ui/defaultSlots.ts'

export const SESSION_STORAGE_KEY = 'drift.state.v1'

/**
 * The autosave is a project file.
 *
 * It used to be its own ad-hoc JSON shape, which quietly lost every drawn
 * automation curve on reload: `JSON.stringify` turns a Float32Array into an
 * object with numeric keys and no length, and nothing on the way back in
 * checked. Sharing one serialiser with the save/open path means there is a
 * single piece of code to get right, and it is the one with tests.
 */
export function loadSession(): Session {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY)
    if (raw) {
      const { project } = readProject(raw)
      return {
        macros: project.macros,
        seedName: project.seedName,
        slots: project.slots.length > 0 ? project.slots : defaultSlots(),
        song: project.song,
        projectName: project.name,
      }
    }
  } catch {
    // A corrupt, blocked or older store is not a reason to fail to start.
  }
  return blankSession()
}
