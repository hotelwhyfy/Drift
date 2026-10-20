import { useState } from 'react'
import type { SlotDesc, SlotReadout } from '@/engine/types.ts'
import { instrumentById } from '@/instruments/registry.ts'
import { SlotRow } from '@/ui/rack/SlotRow.tsx'
import { InstrumentPicker } from '@/ui/rack/InstrumentPicker.tsx'
import type { Expression } from '@/fuzzy/expression.ts'

interface Props {
  slots: SlotDesc[]
  global: Expression
  accent: string
  bars: number
  /** Where moves to a control driven by a timeline lane are written. */
  playhead: number
  /** Live per-slot state from the engine, when playing. */
  readouts?: readonly SlotReadout[]
  /** Meters move only while audio is playing; stopped, the last readout would freeze on them. */
  metering: boolean
  onChange: (slots: SlotDesc[]) => void
}

export function RackView({ slots, global, accent, bars, readouts, metering, playhead, onChange }: Props) {
  const [open, setOpen] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const patch = (id: string, next: Partial<SlotDesc>): void => {
    onChange(slots.map((s) => (s.id === id ? { ...s, ...next } : s)))
  }

  const add = (defId: string): void => {
    const def = instrumentById(defId)
    if (!def) return
    const id = `${defId}-${Date.now().toString(36)}`
    onChange([...slots, {
      id, defId, name: def.name, level: 0.8, muted: false, soloed: false,
      expression: { ...global }, follow: 0.7, lanes: [], knobs: {},
    }])
    setAdding(false)
    setOpen(id)
  }

  return (
    <section className="rack" aria-label="Instruments">
      {slots.map((slot) => {
        const def = instrumentById(slot.defId)
        if (!def) return null
        return (
          <SlotRow
            key={slot.id}
            slot={slot}
            def={def}
            global={global}
            accent={accent}
            bars={bars}
            playhead={playhead}
            readout={readouts?.find((r) => r.id === slot.id)}
            metering={metering}
            isOpen={open === slot.id}
            onToggle={() => setOpen(open === slot.id ? null : slot.id)}
            onPatch={(next) => patch(slot.id, next)}
            onRemove={() => onChange(slots.filter((s) => s.id !== slot.id))}
          />
        )
      })}

      {adding ? (
        <InstrumentPicker onPick={add} onCancel={() => setAdding(false)} />
      ) : (
        <button type="button" className="add-instrument" onClick={() => setAdding(true)}>
          + instrument
        </button>
      )}
    </section>
  )
}
