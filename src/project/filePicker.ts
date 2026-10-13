/**
 * Saving and opening through the browser's own file dialog.
 *
 * `showSaveFilePicker` puts the naming where it belongs — in the dialog, where
 * the user can also choose the folder — instead of making the app carry a name
 * field it would otherwise have no use for. Chrome and Edge have it; Firefox
 * and Safari do not, so both paths fall back to the old anchor-download and
 * hidden-input approach, which still works, just without letting the user pick
 * the name.
 *
 * In development both go to the dev server first, which shows the native macOS
 * dialog itself (scripts/fileDialogs.ts). That is the only path that works in
 * Safari and in VS Code's built-in browser.
 *
 * Exports are written as they render rather than collected first (`FileSink`),
 * so an hour of audio never has to fit in the tab's memory.
 */

interface PickerType {
  description: string
  accept: Record<string, string[]>
}

interface WritableLike {
  write(data: string | Uint8Array<ArrayBuffer>): Promise<void>
  close(): Promise<void>
  abort(): Promise<void>
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

const WAV_TYPE: PickerType = {
  description: 'WAV audio',
  accept: { 'audio/wav': ['.wav'] },
}

/**
 * Once a handle has been refused, every later one will be too, and offering
 * the dialog again only leads to a second dialog from the fallback (or, when
 * the browser asks where to put downloads, a second Save dialog straight after
 * the first). Remembered across reloads; storage may be unavailable, in which
 * case it is remembered for this page only.
 */
const REFUSED_KEY = 'drift.filePickerRefused'
let refusedThisPage = false

function pickerRefused(): boolean {
  if (refusedThisPage) return true
  try {
    return window.localStorage.getItem(REFUSED_KEY) === '1'
  } catch {
    return false
  }
}

function rememberRefusal(): void {
  refusedThisPage = true
  try {
    window.localStorage.setItem(REFUSED_KEY, '1')
  } catch {
    // Remembered for this page only.
  }
}

function savePicker(): ((options: SaveOptions) => Promise<FileHandleLike>) | null {
  if (pickerRefused()) return null
  const fn: unknown = Reflect.get(window, 'showSaveFilePicker')
  if (typeof fn !== 'function') return null
  const bound: (options: SaveOptions) => Promise<FileHandleLike> = fn.bind(window)
  return bound
}

function openPicker(): ((options: OpenOptions) => Promise<FileHandleLike[]>) | null {
  if (pickerRefused()) return null
  const fn: unknown = Reflect.get(window, 'showOpenFilePicker')
  if (typeof fn !== 'function') return null
  const bound: (options: OpenOptions) => Promise<FileHandleLike[]> = fn.bind(window)
  return bound
}

/** A cancelled dialog is not an error and must not be reported as one. */
export function isCancellation(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

/**
 * Some hosts hand out a file handle from the dialog and then refuse every
 * operation on it — embedded browsers, Electron shells and some Chromium
 * forks with the API half-enabled. The dialog has already run, so the only
 * honest recovery is the path that does not need a handle at all.
 */
function isRefusal(error: unknown): boolean {
  return error instanceof DOMException &&
    (error.name === 'NotAllowedError' || error.name === 'SecurityError')
}

interface DevServerFile {
  name: string
  text?: string
}

function isDevServerFile(value: unknown): value is DevServerFile {
  if (typeof value !== 'object' || value === null) return false
  const name: unknown = Reflect.get(value, 'name')
  const text: unknown = Reflect.get(value, 'text')
  return typeof name === 'string' && (text === undefined || typeof text === 'string')
}

/**
 * One request to the dev server's file routes (scripts/fileDialogs.ts). Null
 * when there is no dev server to ask — a production build, or not macOS — so
 * the caller falls back. A cancelled dialog throws AbortError, like the
 * browser's own pickers do.
 */
async function devServerPost(route: string, body?: string | Uint8Array<ArrayBuffer>): Promise<unknown> {
  if (!import.meta.env.DEV) return null
  const response = await fetch(`/__drift/${route}`, {
    method: 'POST',
    headers: {
      'X-Drift': '1',
      'Content-Type': typeof body === 'string' || body === undefined ? 'application/json' : 'application/octet-stream',
    },
    body,
  })
  // A 404 on a route that starts something means there is no dev server to
  // ask. On one that continues an export it means the export was lost.
  if (response.status === 404 && (route === 'save' || route === 'open' || route === 'stream/begin')) return null
  if (response.status === 204) throw new DOMException('Dialog cancelled.', 'AbortError')
  const payload: unknown = await response.json().catch(() => null)
  if (!response.ok || payload === null) {
    const message: unknown = payload === null ? null : Reflect.get(Object(payload), 'error')
    throw new Error(typeof message === 'string' ? message : 'The dev server could not write the file.')
  }
  return payload
}

async function viaDevServer(route: 'save' | 'open', body?: string): Promise<DevServerFile | null> {
  const payload = await devServerPost(route, body)
  if (payload === null) return null
  if (!isDevServerFile(payload)) throw new Error(`The dev server could not ${route} the file.`)
  return payload
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
  const viaServer = await viaDevServer('save', JSON.stringify({ name: suggestedName, text }))
  if (viaServer) return { name: stripExtension(viaServer.name), fellBack: false }

  const picker = savePicker()
  if (picker) {
    const handle = await picker({ suggestedName, types: [PROJECT_TYPE] })
    try {
      const writable = await handle.createWritable()
      await writable.write(text)
      await writable.close()
      return { name: stripExtension(handle.name), fellBack: false }
    } catch (error) {
      if (!isRefusal(error)) throw error
      rememberRefusal()
      // The dialog has already created an empty file at the chosen path; the
      // refused handle cannot remove it. Download under the chosen name instead.
      console.warn('drift: file handle refused, downloading instead', error)
      return download(text, handle.name)
    }
  }
  return download(text, suggestedName)
}

function download(text: string, filename: string): SaveResult {
  // The browser decides the folder.
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  // Revoked on a delay: revoking immediately can cancel the download in some
  // browsers before they have read the blob.
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
  return { name: stripExtension(filename), fellBack: true }
}

/**
 * Somewhere a file is written to a piece at a time. Writes are awaited in
 * order by the caller; nothing here buffers more than the piece in hand,
 * except the last-resort download, which has no choice.
 */
export interface FileSink {
  /** The file's name, as the dialog left it. */
  readonly name: string
  /** True when this is a download collected in memory rather than written as it goes. */
  readonly inMemory: boolean
  write(bytes: Uint8Array<ArrayBuffer>): Promise<void>
  close(): Promise<void>
  /** Gives up, removing the partial file wherever that is possible. */
  abort(): Promise<void>
}

function isStreamBegun(value: unknown): value is { token: string, name: string } {
  if (typeof value !== 'object' || value === null) return false
  return typeof Reflect.get(value, 'token') === 'string' && typeof Reflect.get(value, 'name') === 'string'
}

/**
 * A file to export a WAV into, chosen through a Save dialog where there is
 * one. Must be called straight from the click that asked for it: the
 * browser's own dialog needs that click to be recent.
 */
export async function openWavSink(suggestedName: string): Promise<FileSink> {
  const begun = await devServerPost('stream/begin', JSON.stringify({ name: suggestedName, extension: '.wav' }))
  if (begun !== null) {
    if (!isStreamBegun(begun)) throw new Error('The dev server could not start the export.')
    const query = `?token=${encodeURIComponent(begun.token)}`
    return {
      name: begun.name,
      inMemory: false,
      write: async (bytes) => { await devServerPost(`stream/write${query}`, bytes) },
      close: async () => { await devServerPost(`stream/end${query}`) },
      abort: async () => { await devServerPost(`stream/abort${query}`) },
    }
  }

  const picker = savePicker()
  if (picker) {
    const handle = await picker({ suggestedName, types: [WAV_TYPE] })
    try {
      // Chrome writes this to a swap file beside the target and moves it into
      // place on close, so nothing accumulates in the tab.
      const writable = await handle.createWritable()
      return {
        name: handle.name,
        inMemory: false,
        write: (bytes) => writable.write(bytes),
        close: () => writable.close(),
        abort: () => writable.abort(),
      }
    } catch (error) {
      if (!isRefusal(error)) throw error
      rememberRefusal()
      console.warn('drift: file handle refused, downloading instead', error)
      return downloadSink(handle.name)
    }
  }
  return downloadSink(suggestedName)
}

/** The last resort: collect the pieces, then hand them to the browser as a download. */
function downloadSink(filename: string): FileSink {
  let parts: Uint8Array<ArrayBuffer>[] = []
  return {
    name: filename,
    inMemory: true,
    write: async (bytes) => { parts.push(bytes) },
    close: async () => {
      const url = URL.createObjectURL(new Blob(parts, { type: 'audio/wav' }))
      parts = []
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filename
      anchor.click()
      // Revoked on a delay: revoking immediately can cancel the download in
      // some browsers before they have read the blob.
      setTimeout(() => URL.revokeObjectURL(url), 30_000)
    },
    abort: async () => { parts = [] },
  }
}

export interface OpenedFile {
  name: string
  text: string
}

export async function openTextFile(): Promise<OpenedFile | null> {
  const viaServer = await viaDevServer('open')
  if (viaServer?.text !== undefined) return { name: stripExtension(viaServer.name), text: viaServer.text }

  const picker = openPicker()
  if (picker) {
    const [handle] = await picker({ types: [PROJECT_TYPE], multiple: false })
    if (!handle) return null
    try {
      const file = await handle.getFile()
      return { name: stripExtension(handle.name), text: await file.text() }
    } catch (error) {
      if (!isRefusal(error)) throw error
      rememberRefusal()
      // A second dialog cannot be opened here: the click that allowed the
      // first has been spent. Dropping the file needs no permission at all.
      console.warn('drift: file handle refused', error)
      throw new Error('This browser blocked reading the file. Open again, or drag it onto the window.')
    }
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
