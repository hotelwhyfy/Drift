import type { SlotDesc } from '@/engine/types.ts'
import type { SongLane } from '@/automation/songLaneFor.ts'
import { laneActs } from '@/automation/laneActs.ts'
import type { BarScale } from '@/ui/barScale.ts'
import { EnvelopeLane } from '@/ui/EnvelopeLane.tsx'
import { laneColour } from '@/ui/laneColour.ts'
import { targetLabel } from '@/ui/targetLabel.ts'
import { Tooltip } from '@/ui/Tooltip.tsx'

interface Props {
  slot: SlotDesc
  lane: SongLane
  scale: BarScale
  width: number
  lengthBars: number
  playhead: number
  accent: string
  /** The lane to keep, or null to remove it. */
  onLaneChange: (lane: SongLane | null) => void
}

/** One instrument lane drawn on the timeline: a switch, a remove button, and its envelope. */
export function SongLaneRow({ slot, lane, scale, width, lengthBars, playhead, accent, onLaneChange }: Props) {
  const driving = laneActs(lane)
  return (
    <div className="tl-row">
      <div className="tl-label">
        <Tooltip content={`${slot.name} ${targetLabel(slot, lane)}`}>
          <button
            type="button"
            className={`tl-toggle ${driving ? 'on' : ''}`}
            onClick={() => onLaneChange({ ...lane, enabled: !lane.enabled })}
          >
            <span
              className="tl-swatch"
              style={{
                borderColor: laneColour(lane.id),
                background: driving ? laneColour(lane.id) : 'transparent',
              }}
            />
            <span className="tl-slot">{slot.name.toLowerCase()}</span> {targetLabel(slot, lane)}
          </button>
        </Tooltip>
        <button type="button" className="tl-clear" onClick={() => onLaneChange(null)} aria-label="Remove lane">×</button>
      </div>
      <div className="tl-track">
        <EnvelopeLane
          envelope={lane.source.envelope}
          enabled={lane.enabled}
          fallback={0.5}
          scale={scale}
          width={width}
          lengthBars={lengthBars}
          playhead={playhead}
          colour={laneColour(lane.id)}
          accent={accent}
          onChange={(envelope) => onLaneChange({ ...lane, source: { kind: 'song', envelope } })}
        />
      </div>
    </div>
  )
}
