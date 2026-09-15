import { useEffect, useRef } from 'react'
import type { Player } from '../audio/player.ts'

/** The band the music lives in; everything outside it is dead space. */
const LOW_HZ = 45
const HIGH_HZ = 11000

interface Props {
  player: Player | null
  playing: boolean
  accent: string
}

/**
 * A slow horizon rather than a spectrum analyser.
 *
 * The point of the picture is to confirm the music is alive and to be
 * restful while doing it. Bar meters twitch and pull the eye; a band that
 * swells and settles reads as breathing, and can sit on screen for an hour
 * without becoming something you want to look away from.
 */
export function Visualizer({ player, playing, accent }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const smoothed = useRef<Float32Array | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    let raf = 0
    let phase = 0

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
      phase += 0.0022

      const data = playing ? player?.frequencyData ?? null : null
      const bands = 72
      if (!smoothed.current || smoothed.current.length !== bands) {
        smoothed.current = new Float32Array(bands)
      }
      const sm = smoothed.current

      // Logarithmic in frequency, and only across the range this music
      // actually occupies. Plotting all the way to Nyquist gives a third of
      // the width to 7-24 kHz, which a lo-fi patch has rolled off entirely —
      // so a third of the picture would never move.
      const nyquist = (player?.sampleRate ?? 48000) / 2
      const binOf = (hz: number): number =>
        Math.min(data ? data.length - 1 : 0, Math.max(0, Math.round((hz / nyquist) * (data ? data.length : 1))))
      for (let i = 0; i < bands; i++) {
        let v = 0
        if (data) {
          const hzLo = LOW_HZ * Math.pow(HIGH_HZ / LOW_HZ, i / bands)
          const hzHi = LOW_HZ * Math.pow(HIGH_HZ / LOW_HZ, (i + 1) / bands)
          const lo = binOf(hzLo)
          const hi = Math.max(lo + 1, binOf(hzHi))
          let sum = 0
          for (let k = lo; k < hi && k < data.length; k++) sum += data[k]
          v = sum / (hi - lo) / 255
        }
        // Music has far more energy low down than high, so an untilted plot
        // slumps from left to right and only the bass end ever moves. Adding
        // a rising tilt levels the resting shape, which puts the whole width
        // to work showing what is actually changing.
        if (v > 0.02) v = Math.min(1, v + 0.34 * Math.pow(i / bands, 0.7))
        // Asymmetric smoothing: rise quickly, fall slowly.
        const target = Math.pow(v, 1.3)
        sm[i] += (target - sm[i]) * (target > sm[i] ? 0.28 : 0.045)
      }

      const mid = h * 0.56
      ctx.beginPath()
      ctx.moveTo(0, mid)
      for (let i = 0; i < bands; i++) {
        const x = (i / (bands - 1)) * w
        // A slow idle undulation so the horizon is never perfectly flat, even
        // in silence — a dead-straight line reads as "broken", not "quiet".
        const idle = Math.sin(phase * 6 + i * 0.28) * 1.6 + Math.sin(phase * 2.3 + i * 0.11) * 2.4
        const y = mid - sm[i] * h * 0.5 - idle
        if (i === 0) ctx.lineTo(x, y)
        else {
          const px = ((i - 1) / (bands - 1)) * w
          ctx.quadraticCurveTo(px, y, (px + x) / 2, y)
        }
      }
      ctx.lineTo(w, mid)

      const fill = ctx.createLinearGradient(0, 0, 0, h)
      fill.addColorStop(0, `${accent}44`)
      fill.addColorStop(1, `${accent}00`)
      ctx.fillStyle = fill
      ctx.lineTo(w, h)
      ctx.lineTo(0, h)
      ctx.closePath()
      ctx.fill()

      ctx.beginPath()
      for (let i = 0; i < bands; i++) {
        const x = (i / (bands - 1)) * w
        const idle = Math.sin(phase * 6 + i * 0.28) * 1.6 + Math.sin(phase * 2.3 + i * 0.11) * 2.4
        const y = mid - sm[i] * h * 0.5 - idle
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.strokeStyle = `${accent}cc`
      ctx.lineWidth = 1.25
      ctx.stroke()
    }
    draw()

    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
    }
  }, [player, playing, accent])

  return <canvas className="viz" ref={canvasRef} aria-hidden="true" />
}
