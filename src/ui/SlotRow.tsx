import { useState } from 'react'
import type { CSSProperties } from 'react'
import type { SlotDesc, SlotReadout } from '@/engine/types.ts'
import type { InstrumentDef } from '@/instruments/types.ts'
import type { Expression, ExpressionKey } from '@/fuzzy/expression.ts'
import { SlotBody } from '@/ui/SlotBody.tsx'
import { Tooltip } from '@/ui/Tooltip.tsx'
import { songLaneFor } from '@/automation/songLaneFor.ts'
import { drivenValue } from '@/automation/drivenValue.ts'
import { recordInto } from '@/automation/recordInto.ts'
import { automationColour } from '@/ui/automationColour.ts'
import { meterPosition } from '@/ui/meterPosition.ts'

interface Props {
  slot: SlotDesc
  def: InstrumentDef
  global: Expression
  accent: string
  bars: number
  /** Where moves to a control driven by a timeline lane are written. */
  playhead: number
  /** Live state from the engine, when playing. */
  readout: SlotReadout | undefined
  /** Meters move only while audio is playing; stopped, the last readout would freeze on them. */
  metering: boolean
  isOpen: boolean
  onToggle: () => void
  onPatch: (next: Partial<SlotDesc>) => void
  onRemove: () => void
}

/** One instrument in the rack: its fader, meter, mute/solo, and its body when open. */
export function SlotRow({
  slot, def, global, accent, bars, playhead, readout, metering, isOpen, onToggle, onPatch, onRemove,
}: Props) {
  const [axes, setAxes] = useState<[ExpressionKey, ExpressionKey]>(['brightness', 'weight'])

  // A timeline level lane drives the fader: it shows the lane and a move
  // records into it, the way the six dials do. Under looped and
  // generated lanes the fader is the base, and a ghost shows where the
  // automation has taken it.
  const levelLane = songLaneFor(slot.lanes, (t) => t.kind === 'level')
  const shownLevel = levelLane ? drivenValue(levelLane, slot.level, playhead) : slot.level
  const liveLevel = readout && Math.abs(readout.level - shownLevel) > 0.01 ? readout.level : undefined
  const levelAutomated = automationColour(slot.lanes, (t) => t.kind === 'level', accent)
  // The thumb reads --accent; overriding it on the input repaints just
  // the fader in its automation's colour, and leaves the meter alone.
  const levelStyle: (CSSProperties & { '--accent': string }) | undefined =
    levelAutomated ? { '--accent': levelAutomated } : undefined
  const levelTip = levelLane
    ? `following its timeline lane${liveLevel === undefined ? '' : ` · now ${Math.round(liveLevel * 100)}%`}`
    : liveLevel === undefined
      ? levelAutomated ? 'automated' : undefined
      : `automated · base ${Math.round(slot.level * 100)}% · now ${Math.round(liveLevel * 100)}%`
  const meterRms = metering && readout ? meterPosition(readout.rms) : 0
  const meterPeak = metering && readout ? meterPosition(readout.peak) : 0

  return (
    <div className={`slot ${isOpen ? 'open' : ''}`}>
      <div className="slot-row">
        <button
          type="button"
          className="slot-name"
          onClick={onToggle}
          aria-expanded={isOpen}
        >
          <span className={`slot-caret ${isOpen ? 'open' : ''}`} aria-hidden="true" />
          {slot.name}
          {Object.keys(slot.knobs).length > 0 && (
            <Tooltip content="Knobs set by hand">
              <span className="slot-knobs">
                {Object.keys(slot.knobs).length} set
              </span>
            </Tooltip>
          )}
          {slot.lanes.length > 0 && (
            <span className="slot-lanes" style={{ color: accent }}>
              {slot.lanes.length}
            </span>
          )}
        </button>

        <span className="slot-level-wrap">
          {levelAutomated && (
            <span className="automated-dot slot-level-dot" style={{ background: levelAutomated }} aria-hidden="true" />
          )}
          <Tooltip content={levelTip}>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={shownLevel}
              onChange={(e) => {
                const v = Number(e.target.value)
                if (levelLane) onPatch({ lanes: recordInto(slot.lanes, levelLane, slot.level, v, playhead) })
                else onPatch({ level: v })
              }}
              aria-label={`${slot.name} level${levelAutomated ? ', automated' : ''}`}
              className="slot-level"
              style={levelStyle}
            />
          </Tooltip>
          {liveLevel !== undefined && (
            <span
              className="slot-level-ghost"
              style={{ left: `calc(5.5px + ${liveLevel} * (100% - 11px))`, background: levelAutomated }}
              aria-hidden="true"
            />
          )}
          <span className="slot-meter" aria-hidden="true">
            <span className="slot-meter-fill" style={{ transform: `scaleX(${meterRms})` }} />
            {meterPeak > 0 && (
              <span className="slot-meter-peak" style={{ left: `${meterPeak * 100}%` }} />
            )}
          </span>
        </span>
        <button
          type="button"
          className={`slot-flag ${slot.muted ? 'on' : ''}`}
          onClick={() => onPatch({ muted: !slot.muted })}
          aria-label={`Mute ${slot.name}`}
        >M</button>
        <button
          type="button"
          className={`slot-flag ${slot.soloed ? 'on' : ''}`}
          onClick={() => onPatch({ soloed: !slot.soloed })}
          aria-label={`Solo ${slot.name}`}
        >S</button>
        <button
          type="button"
          className="slot-flag"
          onClick={onRemove}
          aria-label={`Remove ${slot.name}`}
        >×</button>
      </div>

      {isOpen && (
        <SlotBody
          slot={slot}
          def={def}
          global={global}
          accent={accent}
          bars={bars}
          playhead={playhead}
          readout={readout}
          axes={axes}
          onAxisChange={(axis, key) => setAxes(([x, y]) => (axis === 'x' ? [key, y] : [x, key]))}
          onPatch={onPatch}
        />
      )}
    </div>
  )
}
