import { useEffect } from 'react'

/** Dropping a file anywhere on the window hands it over. */
export function useFileDrop(onFile: (file: File | null | undefined) => void): void {
  useEffect(() => {
    const over = (e: DragEvent): void => { e.preventDefault() }
    const drop = (e: DragEvent): void => {
      e.preventDefault()
      onFile(e.dataTransfer?.files?.[0])
    }
    window.addEventListener('dragover', over)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragover', over)
      window.removeEventListener('drop', drop)
    }
  }, [onFile])
}
