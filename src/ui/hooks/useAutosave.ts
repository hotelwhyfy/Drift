import { useEffect } from 'react'
import type { Session } from '@/ui/types.ts'
import { writeProject } from '@/project/project.ts'
import { SESSION_STORAGE_KEY } from '@/ui/session/loadSession.ts'

/** Keeps the session in localStorage, debounced. */
export function useAutosave(session: Session): void {
  useEffect(() => {
    // Debounced: dragging a dial fires this every frame, and serialising every
    // automation curve at 60 Hz is wasted work.
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(SESSION_STORAGE_KEY, writeProject(
          {
            name: session.projectName,
            macros: session.macros,
            seedName: session.seedName,
            slots: session.slots,
            song: session.song,
          },
          new Date().toISOString(),
        ))
      } catch {
        // Private browsing. Losing the setting is survivable; crashing is not.
      }
    }, 400)
    return () => window.clearTimeout(timer)
  }, [session])
}
