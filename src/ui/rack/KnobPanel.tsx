import { Dial } from '@/ui/controls/Dial.tsx'
import type { ControlSpec, InstrumentDef } from '@/instruments/types.ts'
import { controlsOf } from '@/instruments/controlsOf.ts'
import { paramSpecOf } from '@/instruments/paramSpecOf.ts'
import { denormaliseParam } from '@/fuzzy/denormaliseParam.ts'
import { Tooltip } from '@/ui/controls/Tooltip.tsx'
import type { Lane } from '@/automation/lane.ts'
import { songLaneFor } from '@/automation/songLaneFor.ts'
import { drivenValue } from '@/automation/drivenValue.ts'
import { recordInto } from '@/automation/recordInto.ts'
import { automationColour } from '@/ui/rack/automationColour.ts'

interface Props {
  def: InstrumentDef
  /** The slot's hand-set values, normalised. Missing means the rules decide. */
  knobs: Readonly<Record<string, number>>
  /** Where every parameter actually is right now, normalised. */
  live?: Readonly<Record<string, number>>
  accent: string
  onChange: (knobs: Record<string, number>) => void
  /** The slot's lanes; a timeline lane on a parameter drives its knob. */
  lanes: readonly Lane[]
  /** Where a driven knob's moves are written. */
  playhead: number
  onLanesChange: (lanes: Lane[]) => void
}

/**
 * A driven knob with no hand-set value has, as its true base, whatever the
 * rules inferred before lanes, which the interface never sees. It is treated
 * as a full-depth set lane instead: exact for every lane the timeline makes,
 * and only approximate for a partial-depth, add or scale lane over an
 * untouched knob.
 */
const AS_SET: Pick<Lane, 'mode' | 'depth'> = { mode: 'set', depth: 1 }

/** Which option an enumerated parameter's normalised value lands on. */
function optionIndex(def: InstrumentDef, control: ControlSpec, norm: number): number {
  const spec = paramSpecOf(def, control.param)
  const count = control.options?.length ?? 1
  if (!spec) return 0
  return Math.max(0, Math.min(count - 1, Math.floor(denormaliseParam(spec, norm))))
}

/**
 * Every parameter of an instrument, directly.
 *
 * A knob nobody has touched shows where the rules have put it, dimmed, and
 * follows them as the dials move. Touching it takes it over; double-clicking
 * gives it back. So the instrument is still steered by six dials until the
 * moment someone wants one thing exactly, and then only that one thing stops
 * listening to them.
 */
export function KnobPanel({ def, knobs, live, accent, onChange, lanes, playhead, onLanesChange }: Props) {
  const controls = controlsOf(def)
  // Groups in order of first appearance.
  const groups = [...new Set(controls.map((c) => c.group ?? ''))].map((name) => ({
    name,
    controls: controls.filter((c) => (c.group ?? '') === name),
  }))

  const set = (param: string, value: number | null): void => {
    const next: Record<string, number> = { ...knobs }
    if (value === null) delete next[param]
    else next[param] = Math.min(1, Math.max(0, value))
    onChange(next)
  }

  const anySet = Object.keys(knobs).length > 0

  return (
    <div className="knobs">
      {groups.map((group) => (
        <div className="knob-group" key={group.name || 'main'}>
          {group.name && <div className="knob-group-name">{group.name}</div>}
          <div className="knob-row">
            {group.controls.map((control) => {
              const own = knobs[control.param]
              const automated = automationColour(lanes, (t) => t.kind === 'param' && t.param === control.param, accent)
              const now = live?.[control.param]
              const options = control.options
              // Rule outputs follow the dials when untouched; fixed parameters
              // just sit at their default.
              const inferred = def.rules.outputs[control.param] !== undefined
              if (options) {
                const chosen = own === undefined ? null : optionIndex(def, control, own)
                const current = now === undefined ? null : optionIndex(def, control, now)
                return (
                  <div className="knob-choice" key={control.param}>
                    <div className="knob-choice-options" role="group" aria-label={automated ? `${control.label}, automated` : control.label}>
                      <Tooltip content={inferred ? 'Let the dials decide' : 'The instrument’s default'}>
                        <button
                          type="button"
                          className={chosen === null ? 'on' : ''}
                          onClick={() => set(control.param, null)}
                        >{inferred ? 'auto' : 'default'}</button>
                      </Tooltip>
                      {options.map((option, i) => (
                        <button
                          key={option}
                          type="button"
                          className={`${chosen === i ? 'on' : ''} ${chosen === null && current === i ? 'ghost' : ''}`}
                          onClick={() => set(control.param, (i + 0.5) / options.length)}
                        >{option}</button>
                      ))}
                    </div>
                    <div className="dial-label">
                      {automated && <span className="automated-dot" style={{ background: automated }} aria-hidden="true" />}
                      {control.label}
                    </div>
                  </div>
                )
              }
              const driver = songLaneFor(lanes, (t) => t.kind === 'param' && t.param === control.param)
              const lane = driver && own === undefined ? { ...driver, ...AS_SET } : driver
              const base = own ?? 0.5
              const shown = lane ? drivenValue(lane, base, playhead) : own ?? now ?? 0.5
              const spec = paramSpecOf(def, control.param)
              const display = control.display && spec ? control.display(denormaliseParam(spec, shown)) : undefined
              return (
                <Dial
                  key={control.param}
                  label={control.label}
                  size={50}
                  value={shown}
                  ghost={own === undefined && !lane ? undefined : now}
                  auto={own === undefined && !lane}
                  accent={accent}
                  automated={automated}
                  onChange={(v) => {
                    // Only the envelope is replaced, so the real lane keeps
                    // its own mode and depth.
                    if (lane) onLanesChange(recordInto(lanes, lane, base, v, playhead))
                    else set(control.param, v)
                  }}
                  onReset={() => set(control.param, null)}
                  display={display}
                />
              )
            })}
          </div>
        </div>
      ))}
      {anySet && (
        <button type="button" className="knobs-reset" onClick={() => onChange({})}>
          give every knob back to the dials
        </button>
      )}
    </div>
  )
}
