import type { SlotDesc, SlotReadout } from '@/engine/types.ts'
import type { InstrumentDef } from '@/instruments/types.ts'
import { XYPad } from '@/ui/controls/XYPad.tsx'
import { WordField } from '@/ui/controls/WordField.tsx'
import { LaneEditor } from '@/ui/rack/LaneEditor.tsx'
import { KnobPanel } from '@/ui/rack/KnobPanel.tsx'
import { FiringRules } from '@/ui/rack/FiringRules.tsx'
import { makeLane } from '@/automation/lane.ts'
import type { Lane } from '@/automation/lane.ts'
import type { Expression, ExpressionKey } from '@/fuzzy/expression.ts'
import { EXPRESSION_INFO, blendExpression } from '@/fuzzy/expression.ts'
import { automationColour } from '@/ui/rack/automationColour.ts'
import { explainerFor } from '@/ui/rack/explainerFor.ts'

interface Props {
  slot: SlotDesc
  def: InstrumentDef
  global: Expression
  accent: string
  bars: number
  playhead: number
  readout: SlotReadout | undefined
  /** The two expression dimensions the pad is currently showing. */
  axes: readonly [ExpressionKey, ExpressionKey]
  onAxisChange: (axis: 'x' | 'y', key: ExpressionKey) => void
  onPatch: (next: Partial<SlotDesc>) => void
}

let laneCounter = 0

/** An open slot: its pad, words, follow amount, firing rules, knobs and lanes. */
export function SlotBody({ slot, def, global, accent, bars, playhead, readout, axes, onAxisChange, onPatch }: Props) {
  const [xKey, yKey] = axes
  // What the instrument is actually seeing, after following the master
  // dials — the same blend the engine performs.
  const effective = blendExpression(slot.expression, global, slot.follow)
  const firing = explainerFor(slot.defId)?.explain(effective, 3) ?? []
  const axisAutomation: Partial<Record<ExpressionKey, string>> = Object.fromEntries(
    EXPRESSION_INFO.flatMap((info): [ExpressionKey, string][] => {
      const c = automationColour(slot.lanes, (t) => t.kind === 'expression' && t.key === info.key, accent)
      return c ? [[info.key, c]] : []
    }),
  )

  /**
   * Setting an instrument's own expression while it fully follows the master
   * dials would do nothing at all — the blend would discard it. Rather than
   * letting the pad and the word field appear broken, touching either loosens
   * the follow enough for the gesture to be heard. The slot still leans on the
   * dials; it just stops being overruled by them.
   */
  const setExpression = (expression: Expression): void => {
    onPatch({
      expression,
      follow: slot.follow > 0.6 ? 0.45 : slot.follow,
    })
  }

  return (
    <div className="slot-body">
      <p className="slot-blurb">{def.blurb}</p>

      <div className="slot-controls">
        <XYPad
          xKey={xKey}
          yKey={yKey}
          x={slot.expression[xKey]}
          y={slot.expression[yKey]}
          accent={accent}
          ghostX={effective[xKey]}
          ghostY={effective[yKey]}
          automated={axisAutomation}
          onChange={(x, y) => setExpression({ ...slot.expression, [xKey]: x, [yKey]: y })}
          onAxisChange={onAxisChange}
        />

        <div className="slot-side">
          <WordField accent={accent} onApply={setExpression} />

          <label className="follow">
            <span>follows the dials</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={slot.follow}
              onChange={(e) => onPatch({ follow: Number(e.target.value) })}
            />
            <span className="follow-value">{Math.round(slot.follow * 100)}%</span>
          </label>

          <FiringRules firing={firing} />
        </div>
      </div>

      <KnobPanel
        def={def}
        knobs={slot.knobs}
        lanes={slot.lanes}
        playhead={playhead}
        onLanesChange={(lanes) => onPatch({ lanes })}
        live={readout?.params}
        accent={accent}
        onChange={(knobs) => onPatch({ knobs })}
      />

      <div className="lanes">
        {slot.lanes.map((lane) => (
          <LaneEditor
            key={lane.id}
            lane={lane}
            def={def}
            accent={accent}
            phase={(bars / Math.max(0.25, lane.bars)) % 1}
            onChange={(next: Lane) => onPatch({
              lanes: slot.lanes.map((l) => (l.id === lane.id ? next : l)),
            })}
            onRemove={() => onPatch({
              lanes: slot.lanes.filter((l) => l.id !== lane.id),
            })}
          />
        ))}
        <button
          type="button"
          className="add-lane"
          onClick={() => onPatch({
            lanes: [...slot.lanes, makeLane(`${slot.id}-lane-${++laneCounter}`, {
              kind: 'expression', key: 'motion',
            })],
          })}
        >
          + automation
        </button>
      </div>
    </div>
  )
}
