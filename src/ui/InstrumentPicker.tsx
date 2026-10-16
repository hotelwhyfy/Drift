import { INSTRUMENTS } from '@/instruments/registry.ts'

interface Props {
  onPick: (defId: string) => void
  onCancel: () => void
}

/** The list of instruments that can be added to the rack. */
export function InstrumentPicker({ onPick, onCancel }: Props) {
  return (
    <div className="picker">
      {INSTRUMENTS.map((def) => (
        <button key={def.id} type="button" onClick={() => onPick(def.id)}>
          <strong>{def.name}</strong>
          <span>{def.blurb}</span>
        </button>
      ))}
      <button type="button" className="picker-cancel" onClick={onCancel}>
        cancel
      </button>
    </div>
  )
}
