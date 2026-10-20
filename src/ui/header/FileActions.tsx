import { Tooltip } from '@/ui/controls/Tooltip.tsx'

interface Props {
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  onGenerate: () => void
  onOpen: () => void
  onSave: () => void
}

/** The header's icon buttons: undo, redo, generate, open and save. */
export function FileActions({ canUndo, canRedo, onUndo, onRedo, onGenerate, onOpen, onSave }: Props) {
  return (
    <div className="file-actions">
      <Tooltip content={<>Undo<kbd>⌘Z</kbd></>}>
        <button type="button" onClick={onUndo} disabled={!canUndo} aria-label="Undo">
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M5.5 3.5 2.5 6.5l3 3M2.5 6.5h7a4 4 0 0 1 0 8H7" />
          </svg>
        </button>
      </Tooltip>
      <Tooltip content={<>Redo<kbd>⇧⌘Z</kbd></>}>
        <button type="button" onClick={onRedo} disabled={!canRedo} aria-label="Redo">
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M10.5 3.5l3 3-3 3M13.5 6.5h-7a4 4 0 0 0 0 8H9" />
          </svg>
        </button>
      </Tooltip>
      <Tooltip content="Generate a new drift">
        <button type="button" onClick={onGenerate} aria-label="Generate a new drift">
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M7 2.2 8.1 5.6 11.5 6.7 8.1 7.8 7 11.2 5.9 7.8 2.5 6.7 5.9 5.6Z M12.4 10.2l.5 1.4 1.4.5-1.4.5-.5 1.4-.5-1.4-1.4-.5 1.4-.5Z" />
          </svg>
        </button>
      </Tooltip>
      <Tooltip content={<>Open project<kbd>⌘O</kbd></>}>
        <button type="button" onClick={onOpen} aria-label="Open project">
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M1.5 12.5V4a1 1 0 0 1 1-1h3.2l1.4 1.6h6.4a1 1 0 0 1 1 1v6.9a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1Z" />
          </svg>
        </button>
      </Tooltip>
      <Tooltip content={<>Save project<kbd>⌘S</kbd></>}>
        <button type="button" onClick={onSave} aria-label="Save project">
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M8 1.8v8.4M4.6 7l3.4 3.4L11.4 7M2.2 12.6v1.1a.6.6 0 0 0 .6.6h10.4a.6.6 0 0 0 .6-.6v-1.1" />
          </svg>
        </button>
      </Tooltip>
    </div>
  )
}
