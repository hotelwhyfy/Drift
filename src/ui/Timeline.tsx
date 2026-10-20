import type { Song } from '@/song/types.ts'
import { withMacroTrack } from '@/song/withMacroTrack.ts'
import { withLength } from '@/song/withLength.ts'
import type { Macros } from '@/macros/macros.ts'
import { MACRO_INFO } from '@/macros/macros.ts'
import type { SlotDesc } from '@/engine/types.ts'
import { isSongLane } from '@/automation/isSongLane.ts'
import { withSlotLane } from '@/automation/withSlotLane.ts'
import { addSongLane } from '@/automation/addSongLane.ts'
import type { BarScale } from '@/ui/barScale.ts'
import { useTimelineView } from '@/ui/hooks/useTimelineView.ts'
import { TimelineRuler } from '@/ui/TimelineRuler.tsx'
import { SongSettings } from '@/ui/SongSettings.tsx'
import { TimelineZoom } from '@/ui/TimelineZoom.tsx'
import { MacroRow } from '@/ui/MacroRow.tsx'
import { SongLaneRow } from '@/ui/SongLaneRow.tsx'
import { automationLaneOptions } from '@/ui/automationLaneOptions.ts'
import { Select } from '@/ui/Select.tsx'

interface Props {
  song: Song
  dials: Macros
  slots: SlotDesc[]
  /** Fractional bar the listener is hearing, or the stopped cursor. */
  playhead: number
  playing: boolean
  accent: string
  /** The A4 the dials give at the playhead — what an empty tuning field means. */
  autoTuning: number
  onSongChange: (song: Song) => void
  onSlotsChange: (slots: SlotDesc[]) => void
  onSeek: (bar: number) => void
  /** Extra rows rendered under the ruler, before the dials — the harmony. */
  children?: (scale: BarScale, width: number) => React.ReactNode
}

/**
 * The song, laid out left to right.
 *
 * One row per dial, then one per instrument lane placed on the timeline. The
 * ruler seeks; its end marker sets the length, which has no ceiling worth
 * mentioning. Wheel scrolls sideways, and with Ctrl or ⌘ it zooms around the
 * pointer, from whole phrases per pixel to a beat per finger-width.
 */
export function Timeline({
  song, dials, slots, playhead, playing, accent, autoTuning, onSongChange, onSlotsChange, onSeek, children,
}: Props) {
  const view = useTimelineView(playhead, playing)
  const { scale, width } = view

  const songLanes = slots.flatMap((slot) => slot.lanes.filter(isSongLane).map((lane) => ({ slot, lane })))

  return (
    <section className="timeline" aria-label="Song timeline">
      <div className="tl-head">
        <span className="tl-title">song</span>
        <SongSettings song={song} dials={dials} autoTuning={autoTuning} onSongChange={onSongChange} />
        <TimelineZoom
          follow={view.follow}
          onZoomIn={view.zoomIn}
          onZoomOut={view.zoomOut}
          onFit={() => view.fit(song.lengthBars)}
          onToggleFollow={view.toggleFollow}
        />
      </div>

      <div className="tl-rows" ref={view.rowsRef}>
        <div className="tl-row">
          <div className="tl-label" />
          <div className="tl-track">
            <TimelineRuler
              scale={scale}
              width={width}
              lengthBars={song.lengthBars}
              end={song.end}
              playhead={playhead}
              accent={accent}
              onSeek={onSeek}
              onLengthChange={(bars) => {
                const next = withLength(song, bars)
                if (next) onSongChange(next)
              }}
            />
          </div>
        </div>

        {children?.(scale, width)}

        {MACRO_INFO.map((info) => (
          <MacroRow
            key={info.key}
            info={info}
            track={song.macros[info.key]}
            dial={dials[info.key]}
            scale={scale}
            width={width}
            lengthBars={song.lengthBars}
            playhead={playhead}
            accent={accent}
            onTrackChange={(track) => onSongChange(withMacroTrack(song, info.key, track))}
          />
        ))}

        {songLanes.map(({ slot, lane }) => (
          <SongLaneRow
            key={lane.id}
            slot={slot}
            lane={lane}
            scale={scale}
            width={width}
            lengthBars={song.lengthBars}
            playhead={playhead}
            accent={accent}
            onLaneChange={(next) => onSlotsChange(withSlotLane(slots, slot.id, lane.id, next))}
          />
        ))}

        <div className="tl-row">
          <div className="tl-label">
            <Select
              className="tl-add"
              value={null}
              placeholder="+ automation lane"
              items={automationLaneOptions(slots)}
              onChange={(value) => {
                const next = addSongLane(slots, value, Date.now().toString(36))
                if (next) onSlotsChange(next)
              }}
              label="Add an automation lane to the timeline"
            />
          </div>
          <div className="tl-track" />
        </div>
      </div>

      <div
        className="tl-scroll"
        ref={view.scrollRef}
        // A hand on the scrollbar, not any scroll event: syncing it to the
        // playhead scrolls it too, and the browser may clamp that sync.
        onPointerDown={view.stopFollowing}
        onScroll={(e) => view.scrollTo(e.currentTarget.scrollLeft)}
      >
        <div style={{ width: (Math.max(song.lengthBars + 8, view.startBar + view.visibleBars)) * view.pxPerBar, height: 1 }} />
      </div>
    </section>
  )
}
