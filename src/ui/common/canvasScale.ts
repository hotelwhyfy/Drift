/** Device pixels per CSS pixel to draw canvases at, capped at 2: beyond that the cost buys nothing visible. */
export const canvasScale = (): number => Math.min(2, window.devicePixelRatio || 1)
