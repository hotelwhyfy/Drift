import { useEffect, useRef } from 'react'
import type { DependencyList, RefObject } from 'react'
import { canvasScale } from '@/ui/canvasScale.ts'

/** Draws one frame onto a canvas that has just been cleared, `width` by `height` CSS pixels. */
export type CanvasFrame = (width: number, height: number) => void

/**
 * A canvas that redraws every animation frame.
 *
 * Handles what every such canvas needs: sizing its backing store for the
 * device pixel ratio, following the element's size, clearing before each
 * frame, and stopping when it unmounts. `makeFrame` runs once each time `deps`
 * change and returns the function that draws a frame, so state that should
 * start afresh with them (a phase, say) lives in its closure.
 */
export function useCanvasLoop(
  makeFrame: (ctx: CanvasRenderingContext2D) => CanvasFrame,
  deps: DependencyList,
): RefObject<HTMLCanvasElement | null> {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    let raf = 0

    const resize = (): void => {
      const dpr = canvasScale()
      const rect = canvas.getBoundingClientRect()
      canvas.width = Math.max(1, Math.floor(rect.width * dpr))
      canvas.height = Math.max(1, Math.floor(rect.height * dpr))
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)

    const frame = makeFrame(ctx)
    const loop = (): void => {
      raf = requestAnimationFrame(loop)
      const rect = canvas.getBoundingClientRect()
      ctx.clearRect(0, 0, rect.width, rect.height)
      frame(rect.width, rect.height)
    }
    loop()

    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
    }
    // The caller names what the frame depends on; makeFrame itself is new every render.
  }, deps)

  return canvasRef
}
