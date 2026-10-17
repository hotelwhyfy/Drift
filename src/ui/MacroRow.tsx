import type { MacroInfo } from '@/macros/macros.ts'
import type { MacroTrack } from '@/song/types.ts'
import type { BarScale } from '@/ui/barScale.ts'
import { EnvelopeLane } from '@/ui/EnvelopeLane.tsx'
import { MACRO_COLOURS } from '@/ui/laneColours.ts'
import { Tooltip } from '@/ui/Tooltip.tsx'

interface Props {
  info: MacroInfo
  /** This dial's track, if the song has one. */
  track: MacroTrack | undefined
  /** Where the dial is set by hand. */
  dial: number
  scale: BarScale
  width: number
  lengthBars: number
  playhead: number
  accent: string
  /** The track to keep, or undefined to remove it. */
  onTrackChange: (track: MacroTrack | undefined) => void
}

/** One dial's row on the timeline: a switch for the song to drive it, and its envelope. */
export function MacroRow({ info, track, dial, scale, width, lengthBars, playhead, accent, onTrackChange }: Props) {
  const envelope = track?.envelope ?? { points: [] }
  const enabled = track?.enabled ?? false
  const driving = enabled && envelope.points.length > 0
  return (
    <div className="tl-row">
      <div className="tl-label">
        <Tooltip content={enabled ? 'The song drives this dial — click to hand it back' : 'Let the song drive this dial'}>
          <button
            type="button"
            className={`tl-toggle ${driving ? 'on' : ''}`}
            onClick={() => {
              if (!track || envelope.points.length === 0) {
                // Switching on an empty track starts it where the dial is.
                onTrackChange({ enabled: true, envelope: { points: [{ bar: 0, value: dial, shape: 'linear' }] } })
              } else {
                onTrackChange({ ...track, enabled: !track.enabled })
              }
            }}
          >
            <span
              className="tl-swatch"
              style={{
                borderColor: MACRO_COLOURS[info.key],
                background: driving ? MACRO_COLOURS[info.key] : 'transparent',
              }}
            />
            {info.label.toLowerCase()}
          </button>
        </Tooltip>
        {envelope.points.length > 0 && (
          <button type="button" className="tl-clear" onClick={() => onTrackChange(undefined)} aria-label={`Clear ${info.label} track`}>×</button>
        )}
      </div>
      <div className="tl-track">
        <EnvelopeLane
          envelope={envelope}
          enabled={enabled}
          fallback={dial}
          scale={scale}
          width={width}
          lengthBars={lengthBars}
          playhead={playhead}
          colour={MACRO_COLOURS[info.key]}
          accent={accent}
          onChange={(env) => onTrackChange({ enabled: true, envelope: env })}
        />
      </div>
    </div>
  )
}
