import type { BarScale } from '@/ui/timeline/barScale.ts'
import { gridStep } from '@/ui/timeline/gridStep.ts'
import { canvasScale } from '@/ui/common/canvasScale.ts'

export const RULER_HEIGHT = 24

export interface RulerView {
  scale: BarScale
  /** Canvas width in pixels. */
  width: number
  lengthBars: number
  playhead: number
  /** Where a drag along the ruler would seek to, if one is under way. */
  scrub: number | null
  accent: string
}

/** Draws the bar ruler: ticks and numbers, the song's end marker, the playhead and any scrub position. */
export function drawRuler(canvas: HTMLCanvasElement, { scale, width, lengthBars, playhead, scrub, accent }: RulerView): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const dpr = canvasScale()
  canvas.width = Math.floor(width * dpr)
  canvas.height = Math.floor(RULER_HEIGHT * dpr)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, RULER_HEIGHT)
  ctx.font = '10px ui-sans-serif, system-ui, sans-serif'
  ctx.textBaseline = 'top'

  const label = gridStep(scale.pxPerBar, 34)
  const tick = gridStep(scale.pxPerBar, 6)
  const first = Math.max(0, Math.floor(scale.startBar / tick) * tick)
  for (let b = first; b <= scale.toBar(width); b += tick) {
    const x = Math.round(scale.toX(b)) + 0.5
    const major = b % label === 0
    ctx.strokeStyle = major ? '#ffffff30' : '#ffffff12'
    ctx.beginPath()
    ctx.moveTo(x, major ? 10 : 17)
    ctx.lineTo(x, RULER_HEIGHT)
    ctx.stroke()
    if (major) {
      ctx.fillStyle = b < lengthBars ? '#8b8593' : '#55505c'
      ctx.fillText(String(b + 1), x + 3, 1)
    }
  }

  const endX = scale.toX(lengthBars)
  if (endX < width) {
    ctx.fillStyle = '#00000055'
    ctx.fillRect(Math.max(0, endX), 0, width, RULER_HEIGHT)
  }
  if (endX >= -6 && endX <= width + 6) {
    ctx.fillStyle = accent
    ctx.fillRect(Math.round(endX) - 1, 0, 2, RULER_HEIGHT)
    ctx.beginPath()
    ctx.moveTo(endX - 6, 0)
    ctx.lineTo(endX + 6, 0)
    ctx.lineTo(endX, 7)
    ctx.closePath()
    ctx.fill()
  }

  const heads: { bar: number; colour: string }[] = [{ bar: playhead, colour: accent }]
  if (scrub !== null) heads.push({ bar: scrub, colour: '#ffffff80' })
  heads.forEach((head) => {
    const px = scale.toX(head.bar)
    if (px < 0 || px > width) return
    ctx.strokeStyle = head.colour
    ctx.beginPath()
    ctx.moveTo(Math.round(px) + 0.5, 0)
    ctx.lineTo(Math.round(px) + 0.5, RULER_HEIGHT)
    ctx.stroke()
  })
}
