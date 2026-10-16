/**
 * One request to the dev server's file routes (scripts/fileDialogs.ts). Null
 * when there is no dev server to ask — a production build, or not macOS — so
 * the caller falls back. A cancelled dialog throws AbortError, like the
 * browser's own pickers do.
 */
export async function devServerPost(route: string, body?: string | Uint8Array<ArrayBuffer>): Promise<unknown> {
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
