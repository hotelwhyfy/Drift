import { useEffect, useRef, useState } from 'react'
import type { SongEnd } from '@/song/types.ts'
import { MAX_SONG_BARS } from '@/song/song.ts'
import type { BarScale } from '@/ui/timeline/barScale.ts'
import { released } from '@/ui/common/released.ts'
import { drawRuler, RULER_HEIGHT } from '@/ui/timeline/drawRuler.ts'

interface Props {
  scale: BarScale
  width: number
  lengthBars: number
  end: SongEnd
  playhead: number
  accent: string
  onSeek: (bar: number) => void
  onLengthChange: (bars: number) => void
}

/**
 * The bar ruler. Pressing it scrubs, seeking where the drag is let go; its end
 * marker drags to set the song's length.
 */
export function TimelineRuler({ scale, width, lengthBars, end, playhead, accent, onSeek, onLengthChange }: Props) {
  const [scrub, setScrub] = useState<number | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const draggingEnd = useRef(false)

  /** A ruler drag let go: an end drag just stops, a scrub seeks to where it was left. */
  const finish = (): void => {
    if (draggingEnd.current) {
      draggingEnd.current = false
      return
    }
    if (scrub !== null) {
      // Seeking on release rather than on every move: each seek
      // renders a bar of preroll, and a drag would queue dozens.
      onSeek(Math.max(0, Math.min(end === 'hold' ? MAX_SONG_BARS : lengthBars - 1, scrub)))
      setScrub(null)
    }
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || width <= 0) return
    drawRuler(canvas, { scale, width, lengthBars, playhead, scrub, accent })
  }, [scale, width, lengthBars, playhead, scrub, accent])

  const barAt = (e: React.PointerEvent<HTMLCanvasElement>): number => {
    const rect = e.currentTarget.getBoundingClientRect()
    return scale.toBar(e.clientX - rect.left)
  }

  return (
    <canvas
      ref={canvasRef}
      className="tl-ruler"
      style={{ width, height: RULER_HEIGHT }}
      onPointerDown={(e) => {
        const rect = e.currentTarget.getBoundingClientRect()
        const endX = scale.toX(lengthBars)
        e.currentTarget.setPointerCapture(e.pointerId)
        if (Math.abs(e.clientX - rect.left - endX) <= 7) {
          draggingEnd.current = true
          return
        }
        setScrub(Math.floor(barAt(e)))
      }}
      onPointerMove={(e) => {
        if ((draggingEnd.current || scrub !== null) && released(e)) {
          finish()
          return
        }
        if (draggingEnd.current) onLengthChange(Math.max(1, Math.round(barAt(e))))
        else if (scrub !== null) setScrub(Math.max(0, Math.floor(barAt(e))))
      }}
      onPointerUp={(e) => {
        e.currentTarget.releasePointerCapture(e.pointerId)
        finish()
      }}
    />
  )
}
