const GAP = 4
const GUTTER = 8
const MAX_HEIGHT = 320

export interface PopupPosition {
  left: number
  top: number
  minWidth: number
  maxHeight: number
}

interface Anchor {
  left: number
  top: number
  bottom: number
  width: number
}

interface Measure {
  /** The trigger's box in the viewport. */
  anchor: Anchor
  /** The list's full height, however much of it is shown. */
  naturalHeight: number
  /** The list's width as it laid out. */
  listWidth: number
  viewportWidth: number
  viewportHeight: number
}

/**
 * Where to put a list relative to its trigger: under it, or above when there is
 * more room there, never taller than MAX_HEIGHT or the room, and clamped to
 * the viewport sideways.
 */
export function placePopup({ anchor, naturalHeight, listWidth, viewportWidth, viewportHeight }: Measure): PopupPosition {
  const below = viewportHeight - GUTTER - GAP - anchor.bottom
  const above = anchor.top - GUTTER - GAP
  const down = naturalHeight <= below || below >= above
  const maxHeight = Math.min(naturalHeight, MAX_HEIGHT, down ? below : above)
  const width = Math.max(listWidth, anchor.width)
  return {
    left: Math.max(GUTTER, Math.min(anchor.left, viewportWidth - GUTTER - width)),
    top: down ? anchor.bottom + GAP : anchor.top - GAP - maxHeight,
    minWidth: anchor.width,
    maxHeight,
  }
}
