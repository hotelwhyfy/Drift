import { useCallback } from 'react'
import type { Session } from '@/ui/types.ts'
import { readProject, writeProject, projectFilename } from '@/project/project.ts'
import { saveTextFile, openTextFile, isCancellation, stripExtension } from '@/project/filePicker.ts'

interface ProjectFiles {
  saveProject: () => Promise<void>
  openProject: () => Promise<void>
  openFile: (file: File | null | undefined) => Promise<void>
}

/** Save, open and drop-to-open, all through the one project serialiser. */
export function useProjectFiles(
  session: Session,
  replaceSession: (next: Session) => void,
  renameProject: (name: string) => void,
  say: (text: string) => void,
): ProjectFiles {
  const saveProject = useCallback(async () => {
    try {
      const text = writeProject(
        {
          name: session.projectName,
          macros: session.macros,
          seedName: session.seedName,
          slots: session.slots,
          song: session.song,
        },
        new Date().toISOString(),
      )
      const result = await saveTextFile(text, projectFilename(session.projectName))
      if (!result) return
      // The name the user typed in the dialog becomes the project's name.
      renameProject(result.name)
      say(result.fellBack ? `downloaded ${result.name}` : `saved ${result.name}`)
    } catch (error) {
      if (isCancellation(error)) return
      say(error instanceof Error ? error.message : 'Could not save.')
    }
  }, [session, renameProject, say])

  const loadProject = useCallback((text: string, filename?: string) => {
    try {
      const { project, warnings } = readProject(text)
      // The filename wins over the name inside the file: it is what the user
      // last chose to call it, and what they will look for next time.
      const name = filename ? stripExtension(filename) : project.name
      replaceSession({
        macros: project.macros,
        seedName: project.seedName,
        slots: project.slots,
        song: project.song,
        projectName: name,
      })
      say(warnings.length > 0 ? warnings.join(' ') : `opened ${name}`)
    } catch (error) {
      say(error instanceof Error ? error.message : 'Could not open that file.')
    }
  }, [replaceSession, say])

  const openFile = useCallback(async (file: File | null | undefined) => {
    if (!file) return
    loadProject(await file.text(), file.name)
  }, [loadProject])

  const openProject = useCallback(async () => {
    try {
      const opened = await openTextFile()
      if (opened) loadProject(opened.text, opened.name)
    } catch (error) {
      if (isCancellation(error)) return
      say(error instanceof Error ? error.message : 'Could not open that file.')
    }
  }, [loadProject, say])

  return { saveProject, openProject, openFile }
}
