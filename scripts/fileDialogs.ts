/**
 * Native Save and Open dialogs, shown by the dev server rather than the page.
 *
 * The browser's own file dialogs are not dependable where drift is actually
 * used: Safari has none and turns a save into a download, and VS Code's
 * built-in browser shows the dialog and then refuses to write the file it
 * returned, leaving an empty file behind. The dev server runs on the same Mac,
 * so it can ask macOS for the dialog itself and read or write the file
 * directly — the same dialog in every browser.
 *
 * Dev only, macOS only. Anywhere else the endpoints answer 404 and the page
 * falls back to the browser's own dialogs (src/project/filePicker.ts).
 *
 * The path always comes from the dialog the person answered, never from the
 * request, so a page can at most ask for a dialog — it cannot pick a file.
 *
 * Exports stream: the page opens a file through the dialog, sends the WAV a
 * slice at a time as it renders, and closes it. However long the export, only
 * the slice in flight is ever in memory, on either side.
 */

import { execFile } from 'node:child_process'
import { open, readFile, rm, writeFile } from 'node:fs/promises'
import type { FileHandle } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { basename } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'

const SAVE_PATH = '/__drift/save'
const OPEN_PATH = '/__drift/open'
const STREAM_BEGIN_PATH = '/__drift/stream/begin'
const STREAM_WRITE_PATH = '/__drift/stream/write'
const STREAM_END_PATH = '/__drift/stream/end'
const STREAM_ABORT_PATH = '/__drift/stream/abort'

/**
 * Large enough for any project (a few kilobytes) and for any one slice of an
 * export (two seconds of audio is under a megabyte even at 96 kHz).
 */
const MAX_BODY = 16 * 1024 * 1024

/** Files being streamed to, by the token the page was given for each. */
interface OpenStream {
  readonly path: string
  readonly handle: FileHandle
}

/** osascript reports a cancelled dialog as error -128. */
class Cancelled extends Error {}

function runAppleScript(lines: string[], args: string[]): Promise<string> {
  const script = ['on run argv', ...lines, 'end run']
  const flags = script.flatMap((line) => ['-e', line])
  return new Promise((resolve, reject) => {
    // No timeout: the dialog waits for as long as the person takes.
    execFile('osascript', [...flags, ...args], (error, stdout, stderr) => {
      if (error) {
        reject(stderr.includes('-128') ? new Cancelled() : new Error(stderr.trim() || error.message))
        return
      }
      resolve(stdout.trim())
    })
  })
}

/**
 * Runs a `choose …` command as a dialog in front of everything.
 *
 * The dialog is shown by System Events, not by osascript itself. osascript
 * has to turn itself into a foreground app before it can show one, which
 * costs about two seconds every time; System Events is already running and
 * comes forward in a tenth of that. System Events has no window to leave the
 * person in afterwards, so focus goes back to whichever app asked — the
 * browser — whether the dialog was answered or cancelled.
 */
function chooseInFront(choose: string, args: string[]): Promise<string> {
  return runAppleScript([
    'tell application "System Events" to set asker to bundle identifier of first application process whose frontmost is true',
    'try',
    `  tell application "System Events"`,
    '    activate',
    `    set chosen to ${choose}`,
    '  end tell',
    'on error message number code',
    '  tell application id asker to activate',
    '  error message number code',
    'end try',
    'tell application id asker to activate',
    'return POSIX path of chosen',
  ], args)
}

function chooseSavePath(suggestedName: string, prompt: string): Promise<string> {
  return chooseInFront('choose file name with prompt (item 2 of argv) default name (item 1 of argv)', [suggestedName, prompt])
}

function chooseOpenPath(): Promise<string> {
  return chooseInFront('choose file with prompt "Open drift project" of type {"public.json"}', [])
}

function readBody(req: IncomingMessage): Promise<string> {
  return readBytes(req).then((bytes) => bytes.toString('utf8'))
}

function readBytes(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY) {
        reject(new Error('Request too large.'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function send(res: ServerResponse, status: number, body?: unknown): void {
  res.statusCode = status
  if (body === undefined) {
    res.end()
    return
  }
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

/**
 * Only the page itself may ask. The custom header forces a CORS preflight on
 * any cross-site request, which this server never answers; the fetch-metadata
 * check catches the browsers that send it.
 */
function fromThePage(req: IncomingMessage): boolean {
  if (req.method !== 'POST' || req.headers['x-drift'] !== '1') return false
  const site = req.headers['sec-fetch-site']
  return site === undefined || site === 'same-origin'
}

function withExtension(path: string, extension: string, fallback = extension): string {
  return path.toLowerCase().endsWith(extension) ? path : `${path}${fallback}`
}

function parseSaveRequest(body: string): { name: string, text: string } | null {
  const parsed: unknown = JSON.parse(body)
  if (typeof parsed !== 'object' || parsed === null) return null
  const name: unknown = Reflect.get(parsed, 'name')
  const text: unknown = Reflect.get(parsed, 'text')
  if (typeof name !== 'string' || typeof text !== 'string') return null
  return { name, text }
}

async function handleSave(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const request = parseSaveRequest(await readBody(req))
  if (!request) {
    send(res, 400, { error: 'Malformed save request.' })
    return
  }
  // The dialog itself asks before replacing an existing file.
  const path = withExtension(await chooseSavePath(request.name, 'Save drift project'), '.json', '.drift.json')
  await writeFile(path, request.text, 'utf8')
  send(res, 200, { name: basename(path) })
}

async function handleOpen(res: ServerResponse): Promise<void> {
  const path = await chooseOpenPath()
  send(res, 200, { name: basename(path), text: await readFile(path, 'utf8') })
}

function parseBeginRequest(body: string): { name: string, extension: string } | null {
  const parsed: unknown = JSON.parse(body)
  if (typeof parsed !== 'object' || parsed === null) return null
  const name: unknown = Reflect.get(parsed, 'name')
  const extension: unknown = Reflect.get(parsed, 'extension')
  if (typeof name !== 'string' || typeof extension !== 'string') return null
  // Only an extension, never a path: the path is the dialog's to decide.
  if (!/^\.[a-z0-9]{1,8}$/i.test(extension)) return null
  return { name, extension }
}

function streamFor(streams: Map<string, OpenStream>, req: IncomingMessage): [string, OpenStream] | null {
  const token = new URL(req.url ?? '', 'http://localhost').searchParams.get('token') ?? ''
  const stream = streams.get(token)
  return stream ? [token, stream] : null
}

async function handleStream(
  route: string,
  streams: Map<string, OpenStream>,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (route === STREAM_BEGIN_PATH) {
    const request = parseBeginRequest(await readBody(req))
    if (!request) {
      send(res, 400, { error: 'Malformed export request.' })
      return
    }
    const path = withExtension(await chooseSavePath(request.name, 'Export drift'), request.extension)
    const handle = await open(path, 'w')
    const token = randomUUID()
    streams.set(token, { path, handle })
    send(res, 200, { token, name: basename(path) })
    return
  }

  const found = streamFor(streams, req)
  if (!found) {
    send(res, 404, { error: 'That export is no longer open.' })
    return
  }
  const [token, stream] = found
  if (route === STREAM_WRITE_PATH) {
    // The page sends one slice at a time and waits for each, so these arrive
    // in order and the file is written front to back.
    const bytes = await readBytes(req)
    await stream.handle.write(bytes)
    send(res, 200, {})
    return
  }
  streams.delete(token)
  await stream.handle.close()
  // A half-written WAV whose header promises more audio than it holds is
  // worse than no file, so an abandoned export is removed.
  if (route === STREAM_ABORT_PATH) await rm(stream.path, { force: true })
  send(res, 200, {})
}

const STREAM_PATHS = new Set([STREAM_BEGIN_PATH, STREAM_WRITE_PATH, STREAM_END_PATH, STREAM_ABORT_PATH])

export function fileDialogs(): Plugin {
  return {
    name: 'drift-file-dialogs',
    apply: 'serve',
    configureServer(server) {
      if (process.platform !== 'darwin') return
      const streams = new Map<string, OpenStream>()
      server.middlewares.use((req, res, next) => {
        const route = req.url?.split('?')[0] ?? ''
        if (route !== SAVE_PATH && route !== OPEN_PATH && !STREAM_PATHS.has(route)) {
          next()
          return
        }
        if (!fromThePage(req)) {
          send(res, 403)
          return
        }
        const work = route === SAVE_PATH
          ? handleSave(req, res)
          : route === OPEN_PATH
            ? handleOpen(res)
            : handleStream(route, streams, req, res)
        work.catch((error: unknown) => {
          if (error instanceof Cancelled) {
            send(res, 204)
            return
          }
          send(res, 500, { error: error instanceof Error ? error.message : String(error) })
        })
      })
    },
  }
}
