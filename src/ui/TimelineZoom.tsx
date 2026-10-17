import { Tooltip } from '@/ui/Tooltip.tsx'

interface Props {
  follow: boolean
  onZoomIn: () => void
  onZoomOut: () => void
  onFit: () => void
  onToggleFollow: () => void
}

/** Zoom, fit-to-song and follow-the-playhead buttons. */
export function TimelineZoom({ follow, onZoomIn, onZoomOut, onFit, onToggleFollow }: Props) {
  return (
    <div className="tl-zoom">
      <button type="button" className="tl-btn" onClick={onZoomOut} aria-label="Zoom out">−</button>
      <Tooltip content="Fit the whole song">
        <button type="button" className="tl-btn" onClick={onFit}>fit</button>
      </Tooltip>
      <button type="button" className="tl-btn" onClick={onZoomIn} aria-label="Zoom in">+</button>
      <Tooltip content="Keep the playhead in view. Scrolling away turns it off">
        <button type="button" className={`tl-btn ${follow ? 'on' : ''}`} onClick={onToggleFollow}>follow</button>
      </Tooltip>
    </div>
  )
}
