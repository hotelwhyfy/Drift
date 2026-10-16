import { useEffect } from 'react'

export interface Shortcuts {
  toggle: () => void
  save: () => void
  open: () => void
  undo: () => void
  redo: () => void
}

/**
 * Space toggles playback, the one shortcut worth having in an app you leave
 * running in a background tab. The rest are the usual file and edit chords.
 */
export function useShortcuts({ toggle, save, open, undo, redo }: Shortcuts): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target
      const typing = target instanceof HTMLElement &&
        (target.tagName === 'INPUT' || target.isContentEditable || target.getAttribute('role') === 'slider')
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        save()
        return
      }
      // A text field keeps its own undo for what is being typed into it.
      const editingText = target instanceof HTMLElement &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      if ((e.metaKey || e.ctrlKey) && !editingText) {
        const key = e.key.toLowerCase()
        if (key === 'z' || (key === 'y' && !e.metaKey)) {
          e.preventDefault()
          if (key === 'y' || e.shiftKey) redo()
          else undo()
          return
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'o') {
        e.preventDefault()
        open()
        return
      }
      if (e.code === 'Space' && !typing) {
        e.preventDefault()
        toggle()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggle, save, open, undo, redo])
}
