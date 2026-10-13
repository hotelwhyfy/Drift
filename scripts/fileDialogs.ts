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
 */

import { execFile } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { basename } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'

const SAVE_PATH = '/__drift/save'
const OPEN_PATH = '/__drift/open'

/** Large enough for any project; a project is a few kilobytes. */
const MAX_BODY = 8 * 1024 * 1024

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

function chooseSavePath(suggestedName: string): Promise<string> {
  return chooseInFront('choose file name with prompt "Save drift project" default name (item 1 of argv)', [suggestedName])
}

function chooseOpenPath(): Promise<string> {
  return chooseInFront('choose file with prompt "Open drift project" of type {"public.json"}', [])
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY) {
        reject(new Error('Project too large.'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
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

function withJsonExtension(path: string): string {
  return /\.json$/i.test(path) ? path : `${path}.drift.json`
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
  const path = withJsonExtension(await chooseSavePath(request.name))
  await writeFile(path, request.text, 'utf8')
  send(res, 200, { name: basename(path) })
}

async function handleOpen(res: ServerResponse): Promise<void> {
  const path = await chooseOpenPath()
  send(res, 200, { name: basename(path), text: await readFile(path, 'utf8') })
}

export function fileDialogs(): Plugin {
  return {
    name: 'drift-file-dialogs',
    apply: 'serve',
    configureServer(server) {
      if (process.platform !== 'darwin') return
      server.middlewares.use((req, res, next) => {
        const route = req.url?.split('?')[0]
        if (route !== SAVE_PATH && route !== OPEN_PATH) {
          next()
          return
        }
        if (!fromThePage(req)) {
          send(res, 403)
          return
        }
        const work = route === SAVE_PATH ? handleSave(req, res) : handleOpen(res)
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
