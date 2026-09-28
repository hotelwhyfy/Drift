import { useEffect, useRef } from 'react'
import type { Player } from '../../audio/player.ts'

interface Props {
  player: Player | null
  playing: boolean
  accent: string
}

/**
 * The picture while it plays.
 *
 * Slower and quieter than the prototype's horizon: this screen is meant to be
 * left on for an hour in the corner of someone's vision, so it has no peaks to
 * catch the eye. It is a band that widens and narrows with the music, drifting
 * as it goes.
 */
export function Listening({ player, playing, accent }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    let raf = 0
    let phase = 0
    let level = 0

    const resize = (): void => {
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const rect = canvas.getBoundingClientRect()
      canvas.width = Math.max(1, Math.floor(rect.width * dpr))
      canvas.height = Math.max(1, Math.floor(rect.height * dpr))
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)

    const draw = (): void => {
      raf = requestAnimationFrame(draw)
      const rect = canvas.getBoundingClientRect()
      const w = rect.width
      const h = rect.height
      ctx.clearRect(0, 0, w, h)
      phase += 0.0016

      const data = playing ? player?.frequencyData ?? null : null
      let energy = 0
      if (data) {
        // Weighted to the low mids, where this music actually lives, so the
        // band answers to the music rather than to the hiss.
        let sum = 0
        let count = 0
        for (let i = 2; i < Math.min(data.length, 220); i++) {
          sum += data[i]
          count++
        }
        energy = count > 0 ? sum / count / 255 : 0
      }
      level += (energy - level) * 0.045

      const mid = h * 0.5
      const lines = 5
      for (let line = 0; line < lines; line++) {
        const offset = (line - (lines - 1) / 2) / lines
        ctx.beginPath()
        for (let x = 0; x <= w; x += 4) {
          const u = x / w
          // Three slow sines at incommensurate rates: the shape never repeats,
          // so there is nothing for the eye to lock onto and start predicting.
          const wave =
            Math.sin(u * 3.1 + phase * 7 + line) * 1 +
            Math.sin(u * 1.7 - phase * 4.3 + line * 0.7) * 0.7 +
            Math.sin(u * 5.3 + phase * 2.1 + line * 1.3) * 0.35
          const spread = h * 0.16 * (0.25 + level * 1.5)
          const y = mid + offset * spread * 2.2 + wave * spread * 0.5
          if (x === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.strokeStyle = accent
        ctx.globalAlpha = 0.1 + (1 - Math.abs(offset) * 2) * 0.24 + level * 0.18
        ctx.lineWidth = 1
        ctx.stroke()
      }
      ctx.globalAlpha = 1
    }
    draw()

    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
    }
  }, [player, playing, accent])

  return <canvas className="listening" ref={canvasRef} aria-hidden="true" />
}
