import { Dial } from './Dial.tsx'
import type { ControlSpec, InstrumentDef } from '../instruments/types.ts'
import { controlsOf } from '../instruments/controlsOf.ts'
import { paramSpecOf } from '../instruments/paramSpecOf.ts'
import { denormaliseParam } from '../fuzzy/denormaliseParam.ts'

interface Props {
  def: InstrumentDef
  /** The slot's hand-set values, normalised. Missing means the rules decide. */
  knobs: Readonly<Record<string, number>>
  /** Where every parameter actually is right now, normalised. */
  live?: Readonly<Record<string, number>>
  accent: string
  onChange: (knobs: Record<string, number>) => void
}

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
export function KnobPanel({ def, knobs, live, accent, onChange }: Props) {
  const controls = controlsOf(def)
  const groups: { name: string; controls: ControlSpec[] }[] = []
  for (const c of controls) {
    const name = c.group ?? ''
    const group = groups.find((g) => g.name === name)
    if (group) group.controls.push(c)
    else groups.push({ name, controls: [c] })
  }

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
                    <div className="knob-choice-options" role="group" aria-label={control.label}>
                      <button
                        type="button"
                        className={chosen === null ? 'on' : ''}
                        onClick={() => set(control.param, null)}
                        title={inferred ? 'Let the dials decide' : 'The instrument’s default'}
                      >{inferred ? 'auto' : 'default'}</button>
                      {options.map((option, i) => (
                        <button
                          key={option}
                          type="button"
                          className={`${chosen === i ? 'on' : ''} ${chosen === null && current === i ? 'ghost' : ''}`}
                          onClick={() => set(control.param, (i + 0.5) / options.length)}
                        >{option}</button>
                      ))}
                    </div>
                    <div className="dial-label">{control.label}</div>
                  </div>
                )
              }
              return (
                <Dial
                  key={control.param}
                  label={control.label}
                  size={50}
                  value={own ?? now ?? 0.5}
                  ghost={own === undefined ? undefined : now}
                  auto={own === undefined}
                  accent={accent}
                  onChange={(v) => set(control.param, v)}
                  onReset={() => set(control.param, null)}
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
