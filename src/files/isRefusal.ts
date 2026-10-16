/**
 * Some hosts hand out a file handle from the dialog and then refuse every
 * operation on it — embedded browsers, Electron shells and some Chromium
 * forks with the API half-enabled. The dialog has already run, so the only
 * honest recovery is the path that does not need a handle at all.
 */
export function isRefusal(error: unknown): boolean {
  return error instanceof DOMException &&
    (error.name === 'NotAllowedError' || error.name === 'SecurityError')
}
