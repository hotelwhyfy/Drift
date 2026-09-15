import { useState } from 'react'
import type { SlotDesc } from '../engine/rack.ts'
import { INSTRUMENTS, instrumentById } from '../instruments/registry.ts'
import { XYPad } from './XYPad.tsx'
import { WordField } from './WordField.tsx'
import { LaneEditor } from './LaneEditor.tsx'
import { makeLane } from '../automation/lane.ts'
import type { Lane } from '../automation/lane.ts'
import type { Expression, ExpressionKey } from '../fuzzy/expression.ts'
import { FuzzyEngine } from '../fuzzy/inference.ts'
import { EXPRESSION_INFO } from '../fuzzy/expression.ts'

interface Props {
  slots: SlotDesc[]
  global: Expression
  accent: string
  bars: number
  onChange: (slots: SlotDesc[]) => void
}

let laneCounter = 0

/** Cached per instrument definition, purely to render the firing rules. */
const explainers = new Map<string, FuzzyEngine>()
function explainerFor(defId: string): FuzzyEngine | null {
  const cached = explainers.get(defId)
  if (cached) return cached
  const def = instrumentById(defId)
  if (!def) return null
  const engine = new FuzzyEngine(def.rules)
  explainers.set(defId, engine)
  return engine
}

export function RackView({ slots, global, accent, bars, onChange }: Props) {
  const [open, setOpen] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [axes, setAxes] = useState<Record<string, [ExpressionKey, ExpressionKey]>>({})

  const patch = (id: string, next: Partial<SlotDesc>): void => {
    onChange(slots.map((s) => (s.id === id ? { ...s, ...next } : s)))
  }

  /**
   * Setting an instrument's own expression while it fully follows the master
   * dials would do nothing at all — the blend would discard it. Rather than
   * letting the pad and the word field appear broken, touching either loosens
   * the follow enough for the gesture to be heard. The slot still leans on the
   * dials; it just stops being overruled by them.
   */
  const setExpression = (slot: SlotDesc, expression: Expression): void => {
    patch(slot.id, {
      expression,
      follow: slot.follow > 0.6 ? 0.45 : slot.follow,
    })
  }

  const add = (defId: string): void => {
    const def = instrumentById(defId)
    if (!def) return
    const id = `${defId}-${Date.now().toString(36)}`
    onChange([...slots, {
      id, defId, name: def.name, level: 0.8, muted: false, soloed: false,
      expression: { ...global }, follow: 0.7, lanes: [],
    }])
    setAdding(false)
    setOpen(id)
  }

  return (
    <section className="rack" aria-label="Instruments">
      {slots.map((slot) => {
        const def = instrumentById(slot.defId)
        if (!def) return null
        const isOpen = open === slot.id
        // What the instrument is actually seeing, after following the master
        // dials — the same blend the engine performs.
        const effective: Expression = { ...slot.expression }
        for (const info of EXPRESSION_INFO) {
          effective[info.key] = slot.expression[info.key] +
            (global[info.key] - slot.expression[info.key]) * slot.follow
        }
        const [xKey, yKey] = axes[slot.id] ?? ['brightness', 'weight']
        const firing = explainerFor(slot.defId)?.explain(effective, 3) ?? []

        return (
          <div className={`slot ${isOpen ? 'open' : ''}`} key={slot.id}>
            <div className="slot-row">
              <button
                type="button"
                className="slot-name"
                onClick={() => setOpen(isOpen ? null : slot.id)}
                aria-expanded={isOpen}
              >
                <span className={`slot-caret ${isOpen ? 'open' : ''}`} aria-hidden="true" />
                {slot.name}
                {slot.lanes.length > 0 && (
                  <span className="slot-lanes" style={{ color: accent }}>
                    {slot.lanes.length}
                  </span>
                )}
              </button>

              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={slot.level}
                onChange={(e) => patch(slot.id, { level: Number(e.target.value) })}
                aria-label={`${slot.name} level`}
                className="slot-level"
              />
              <button
                type="button"
                className={`slot-flag ${slot.muted ? 'on' : ''}`}
                onClick={() => patch(slot.id, { muted: !slot.muted })}
                aria-label={`Mute ${slot.name}`}
              >M</button>
              <button
                type="button"
                className={`slot-flag ${slot.soloed ? 'on' : ''}`}
                onClick={() => patch(slot.id, { soloed: !slot.soloed })}
                aria-label={`Solo ${slot.name}`}
              >S</button>
              <button
                type="button"
                className="slot-flag"
                onClick={() => onChange(slots.filter((s) => s.id !== slot.id))}
                aria-label={`Remove ${slot.name}`}
              >×</button>
            </div>

            {isOpen && (
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
                    onChange={(x, y) => setExpression(slot, {
                      ...slot.expression, [xKey]: x, [yKey]: y,
                    })}
                    onAxisChange={(axis, key) => setAxes((a) => ({
                      ...a,
                      [slot.id]: axis === 'x' ? [key, yKey] : [xKey, key],
                    }))}
                  />

                  <div className="slot-side">
                    <WordField
                      accent={accent}
                      onApply={(expression) => setExpression(slot, expression)}
                    />

                    <label className="follow">
                      <span>follows the dials</span>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        value={slot.follow}
                        onChange={(e) => patch(slot.id, { follow: Number(e.target.value) })}
                      />
                      <span className="follow-value">{Math.round(slot.follow * 100)}%</span>
                    </label>

                    {firing.length > 0 && (
                      <div className="rules">
                        {firing.map((f, i) => (
                          <div key={i} className="rule" style={{ opacity: 0.35 + f.strength * 0.65 }}>
                            <em>if</em>{' '}
                            {Object.entries(f.rule.when).map(([k, v]) => `${k} is ${v}`).join(' and ')}{' '}
                            <em>then</em>{' '}
                            {Object.entries(f.rule.then).map(([k, v]) => `${k} is ${v}`).join(', ')}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="lanes">
                  {slot.lanes.map((lane) => (
                    <LaneEditor
                      key={lane.id}
                      lane={lane}
                      accent={accent}
                      phase={(bars / Math.max(0.25, lane.bars)) % 1}
                      onChange={(next: Lane) => patch(slot.id, {
                        lanes: slot.lanes.map((l) => (l.id === lane.id ? next : l)),
                      })}
                      onRemove={() => patch(slot.id, {
                        lanes: slot.lanes.filter((l) => l.id !== lane.id),
                      })}
                    />
                  ))}
                  <button
                    type="button"
                    className="add-lane"
                    onClick={() => patch(slot.id, {
                      lanes: [...slot.lanes, makeLane(`${slot.id}-lane-${++laneCounter}`, {
                        kind: 'expression', key: 'motion',
                      })],
                    })}
                  >
                    + automation
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}

      {adding ? (
        <div className="picker">
          {INSTRUMENTS.map((def) => (
            <button key={def.id} type="button" onClick={() => add(def.id)}>
              <strong>{def.name}</strong>
              <span>{def.blurb}</span>
            </button>
          ))}
          <button type="button" className="picker-cancel" onClick={() => setAdding(false)}>
            cancel
          </button>
        </div>
      ) : (
        <button type="button" className="add-instrument" onClick={() => setAdding(true)}>
          + instrument
        </button>
      )}
    </section>
  )
}
