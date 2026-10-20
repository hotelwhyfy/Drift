/**
 * The pointer moved with no button held: a drag whose release was never seen.
 *
 * Pointer capture usually delivers the release wherever it happens, but not
 * always — let go outside the browser window, over another app, or while the
 * tab loses focus, and the pointerup can simply never arrive. Without this
 * check the control keeps following the pointer, turning a dial nobody is
 * holding. Every drag asks it on each move and treats a yes as the release.
 */
export function released(e: { buttons: number }): boolean {
  return e.buttons === 0
}
