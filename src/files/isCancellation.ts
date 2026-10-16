/** A cancelled dialog is not an error and must not be reported as one. */
export function isCancellation(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}
