/**
 * Once a handle has been refused, every later one will be too, and offering
 * the dialog again only leads to a second dialog from the fallback (or, when
 * the browser asks where to put downloads, a second Save dialog straight after
 * the first). Remembered across reloads; storage may be unavailable, in which
 * case it is remembered for this page only.
 */
const REFUSED_KEY = 'drift.filePickerRefused'
let refusedThisPage = false

export function pickerRefused(): boolean {
  if (refusedThisPage) return true
  try {
    return window.localStorage.getItem(REFUSED_KEY) === '1'
  } catch {
    return false
  }
}

export function rememberRefusal(): void {
  refusedThisPage = true
  try {
    window.localStorage.setItem(REFUSED_KEY, '1')
  } catch {
    // Remembered for this page only.
  }
}
