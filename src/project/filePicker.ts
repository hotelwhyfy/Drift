/**
 * Saving and opening through the browser's own file dialog.
 *
 * `showSaveFilePicker` puts the naming where it belongs — in the dialog, where
 * the user can also choose the folder — instead of making the app carry a name
 * field it would otherwise have no use for. Chrome and Edge have it; Firefox
 * and Safari do not, so both paths fall back to the old anchor-download and
 * hidden-input approach, which still works, just without letting the user pick
 * the name.
 */

interface PickerType {
  description: string
  accept: Record<string, string[]>
}

interface WritableLike {
  write(data: string): Promise<void>
  close(): Promise<void>
}

interface FileHandleLike {
  name: string
  getFile(): Promise<File>
  createWritable(): Promise<WritableLike>
}

interface SaveOptions {
  suggestedName?: string
  types?: PickerType[]
}

interface OpenOptions {
  types?: PickerType[]
  multiple?: boolean
}

const PROJECT_TYPE: PickerType = {
  description: 'drift project',
  accept: { 'application/json': ['.json'] },
}

function savePicker(): ((options: SaveOptions) => Promise<FileHandleLike>) | null {
  const fn: unknown = Reflect.get(window, 'showSaveFilePicker')
  if (typeof fn !== 'function') return null
  const bound: (options: SaveOptions) => Promise<FileHandleLike> = fn.bind(window)
  return bound
}

function openPicker(): ((options: OpenOptions) => Promise<FileHandleLike[]>) | null {
  const fn: unknown = Reflect.get(window, 'showOpenFilePicker')
  if (typeof fn !== 'function') return null
  const bound: (options: OpenOptions) => Promise<FileHandleLike[]> = fn.bind(window)
  return bound
}

/** A cancelled dialog is not an error and must not be reported as one. */
export function isCancellation(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

export interface SaveResult {
  /** The name the file ended up with, without its extension. */
  name: string
  /** True when the browser could not offer a real dialog. */
  fellBack: boolean
}

export async function saveTextFile(
  text: string,
  suggestedName: string,
): Promise<SaveResult | null> {
  const picker = savePicker()
  if (picker) {
    const handle = await picker({ suggestedName, types: [PROJECT_TYPE] })
    const writable = await handle.createWritable()
    await writable.write(text)
    await writable.close()
    return { name: stripExtension(handle.name), fellBack: false }
  }

  // Fallback: a download. The browser decides the name and the folder.
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = suggestedName
  anchor.click()
  // Revoked on a delay: revoking immediately can cancel the download in some
  // browsers before they have read the blob.
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
  return { name: stripExtension(suggestedName), fellBack: true }
}

export interface OpenedFile {
  name: string
  text: string
}

export async function openTextFile(): Promise<OpenedFile | null> {
  const picker = openPicker()
  if (picker) {
    const [handle] = await picker({ types: [PROJECT_TYPE], multiple: false })
    if (!handle) return null
    const file = await handle.getFile()
    return { name: stripExtension(handle.name), text: await file.text() }
  }

  // Fallback: a transient file input.
  return new Promise<OpenedFile | null>((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,application/json'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) {
        resolve(null)
        return
      }
      void file.text().then((text) => resolve({ name: stripExtension(file.name), text }))
    }
    // A cancelled input fires nothing at all in some browsers, so the promise
    // is simply left unsettled rather than resolving to a false "no file".
    input.click()
  })
}

export function stripExtension(filename: string): string {
  return filename.replace(/\.drift\.json$/i, '').replace(/\.json$/i, '')
}
