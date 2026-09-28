import { useEffect, useMemo, useRef, useState } from 'react'
import type { Song, SongEnd, Envelope, MacroTrack } from '../song/song.ts'
import { MAX_SONG_BARS } from '../song/song.ts'
import { songSeconds } from '../song/songSeconds.ts'
import type { Macros, MacroKey } from '../macros/macros.ts'
import { MACRO_INFO } from '../macros/macros.ts'
import type { SlotDesc } from '../engine/rack.ts'
import type { Lane } from '../automation/lane.ts'
import { instrumentById } from '../instruments/registry.ts'
import { controlsOf } from '../instruments/controlsOf.ts'
import { EXPRESSION_INFO } from '../fuzzy/expression.ts'
import { barScale } from './barScale.ts'
import type { BarScale } from './barScale.ts'
import { gridStep } from './gridStep.ts'
import { EnvelopeLane } from './EnvelopeLane.tsx'
import { MACRO_COLOURS, INSTRUMENT_LANE_COLOURS } from './laneColours.ts'
import { deriveSeed } from '../core/rng.ts'

/** Keyed by the lane's id, so removing one lane never repaints the others. */
const laneColour = (id: string): string =>
  INSTRUMENT_LANE_COLOURS[deriveSeed(id) % INSTRUMENT_LANE_COLOURS.length]

interface Props {
  song: Song
  dials: Macros
  slots: SlotDesc[]
  /** Fractional bar the listener is hearing, or the stopped cursor. */
  playhead: number
  playing: boolean
  accent: string
  onSongChange: (song: Song) => void
  onSlotsChange: (slots: SlotDesc[]) => void
  onSeek: (bar: number) => void
  /** Extra rows rendered under the ruler, before the dials — the harmony. */
  children?: (scale: BarScale, width: number) => React.ReactNode
}

const RULER_HEIGHT = 24
const MIN_PX = 1
const MAX_PX = 96
const ENDS: SongEnd[] = ['loop', 'hold', 'stop']

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function targetLabel(slot: SlotDesc, lane: Lane): string {
  const def = instrumentById(slot.defId)
  const t = lane.target
  if (t.kind === 'level') return 'level'
  if (t.kind === 'expression') return EXPRESSION_INFO.find((i) => i.key === t.key)?.label.toLowerCase() ?? t.key
  return (def && controlsOf(def).find((c) => c.param === t.param)?.label.toLowerCase()) ?? t.param
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
  song, dials, slots, playhead, playing, accent, onSongChange, onSlotsChange, onSeek, children,
}: Props) {
  const [pxPerBar, setPxPerBar] = useState(10)
  const [startBar, setStartBar] = useState(0)
  const [follow, setFollow] = useState(true)
  const [width, setWidth] = useState(0)
  const [lengthDraft, setLengthDraft] = useState<string | null>(null)
  const [scrub, setScrub] = useState<number | null>(null)
  const rowsRef = useRef<HTMLDivElement>(null)
  const rulerRef = useRef<HTMLCanvasElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const draggingEnd = useRef(false)
  // The wheel listener is registered once; it reads the view through these.
  const view = useRef({ pxPerBar, startBar })
  view.current = { pxPerBar, startBar }

  const scale = useMemo(() => barScale(pxPerBar, startBar), [pxPerBar, startBar])
  const visibleBars = width / pxPerBar
  const seconds = useMemo(() => songSeconds(song, dials), [song, dials])

  // Canvas width follows the column the rows sit in.
  useEffect(() => {
    const el = rowsRef.current
    if (!el) return
    const observer = new ResizeObserver(() => {
      const probe = el.querySelector('.tl-track')
      setWidth(probe instanceof HTMLElement ? probe.clientWidth : 0)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Keep the playhead in view while playing, paging rather than scrolling
  // continuously — a timeline sliding under the pointer is hard to edit.
  useEffect(() => {
    if (!playing || !follow || visibleBars <= 0) return
    if (playhead < startBar || playhead > startBar + visibleBars * 0.92) {
      setStartBar(Math.max(0, playhead - visibleBars * 0.08))
    }
  }, [playhead, playing, follow, startBar, visibleBars])

  // The scrollbar and startBar describe the same thing; keep them in step.
  useEffect(() => {
    const el = scrollRef.current
    if (el && Math.abs(el.scrollLeft - startBar * pxPerBar) > 1) el.scrollLeft = startBar * pxPerBar
  }, [startBar, pxPerBar])

  // Wheel: sideways scrolls, Ctrl/⌘ zooms about the pointer. Registered by
  // hand because React's wheel listener is passive and cannot stop the page
  // from zooming too.
  useEffect(() => {
    const el = rowsRef.current
    if (!el) return
    const onWheel = (e: WheelEvent): void => {
      const track = el.querySelector('.tl-track')
      const left = track instanceof HTMLElement ? track.getBoundingClientRect().left : 0
      const { pxPerBar: px, startBar: sb } = view.current
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        // Zoom about the pointer: the bar under it stays under it.
        const x = e.clientX - left
        const next = Math.min(MAX_PX, Math.max(MIN_PX, px * Math.exp(-e.deltaY * 0.0025)))
        setPxPerBar(next)
        setStartBar(Math.max(0, sb + x / px - x / next))
        return
      }
      const dx = e.deltaX !== 0 ? e.deltaX : e.shiftKey ? e.deltaY : 0
      if (dx === 0) return
      e.preventDefault()
      setStartBar(Math.max(0, sb + dx / px))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // Ruler.
  useEffect(() => {
    const canvas = rulerRef.current
    if (!canvas || width <= 0) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = Math.floor(width * dpr)
    canvas.height = Math.floor(RULER_HEIGHT * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, RULER_HEIGHT)
    ctx.font = '10px ui-sans-serif, system-ui, sans-serif'
    ctx.textBaseline = 'top'

    const label = gridStep(pxPerBar, 34)
    const tick = gridStep(pxPerBar, 6)
    const first = Math.max(0, Math.floor(startBar / tick) * tick)
    for (let b = first; b <= scale.toBar(width); b += tick) {
      const x = Math.round(scale.toX(b)) + 0.5
      const major = b % label === 0
      ctx.strokeStyle = major ? '#ffffff30' : '#ffffff12'
      ctx.beginPath()
      ctx.moveTo(x, major ? 10 : 17)
      ctx.lineTo(x, RULER_HEIGHT)
      ctx.stroke()
      if (major) {
        ctx.fillStyle = b < song.lengthBars ? '#8b8593' : '#55505c'
        ctx.fillText(String(b + 1), x + 3, 1)
      }
    }

    const endX = scale.toX(song.lengthBars)
    if (endX < width) {
      ctx.fillStyle = '#00000055'
      ctx.fillRect(Math.max(0, endX), 0, width, RULER_HEIGHT)
    }
    if (endX >= -6 && endX <= width + 6) {
      ctx.fillStyle = accent
      ctx.fillRect(Math.round(endX) - 1, 0, 2, RULER_HEIGHT)
      ctx.beginPath()
      ctx.moveTo(endX - 6, 0)
      ctx.lineTo(endX + 6, 0)
      ctx.lineTo(endX, 7)
      ctx.closePath()
      ctx.fill()
    }

    const heads: { bar: number; colour: string }[] = [{ bar: playhead, colour: accent }]
    if (scrub !== null) heads.push({ bar: scrub, colour: '#ffffff80' })
    for (const head of heads) {
      const px = scale.toX(head.bar)
      if (px < 0 || px > width) continue
      ctx.strokeStyle = head.colour
      ctx.beginPath()
      ctx.moveTo(Math.round(px) + 0.5, 0)
      ctx.lineTo(Math.round(px) + 0.5, RULER_HEIGHT)
      ctx.stroke()
    }
  }, [scale, width, pxPerBar, startBar, song.lengthBars, playhead, scrub, accent])

  const setTrack = (key: MacroKey, track: MacroTrack | undefined): void => {
    const macros = { ...song.macros }
    if (track) macros[key] = track
    else delete macros[key]
    onSongChange({ ...song, macros })
  }

  const setLength = (bars: number): void => {
    const n = Math.round(bars)
    if (!Number.isFinite(n)) return
    onSongChange({ ...song, lengthBars: Math.min(MAX_SONG_BARS, Math.max(1, n)) })
  }

  const setSlotLane = (slotId: string, laneId: string, next: Lane | null): void => {
    onSlotsChange(slots.map((s) => s.id !== slotId ? s : {
      ...s,
      lanes: next ? s.lanes.map((l) => (l.id === laneId ? next : l)) : s.lanes.filter((l) => l.id !== laneId),
    }))
  }

  const addSlotLane = (value: string): void => {
    const [slotId, target] = value.split('|')
    const slot = slots.find((s) => s.id === slotId)
    if (!slot || !target) return
    const lane: Lane = {
      id: `${slot.id}-song-${Date.now().toString(36)}`,
      target: target === 'level' ? { kind: 'level' } : { kind: 'param', param: target },
      source: { kind: 'song', envelope: { points: [] } },
      depth: 1,
      bars: 4,
      mode: 'set',
      enabled: true,
    }
    onSlotsChange(slots.map((s) => (s.id === slot.id ? { ...s, lanes: [...s.lanes, lane] } : s)))
  }

  const songLanes = slots.flatMap((slot) => slot.lanes
    .filter((l): l is Lane & { source: { kind: 'song'; envelope: Envelope } } => l.source.kind === 'song')
    .map((lane) => ({ slot, lane })))

  const rulerBar = (e: React.PointerEvent<HTMLCanvasElement>): number => {
    const rect = e.currentTarget.getBoundingClientRect()
    return scale.toBar(e.clientX - rect.left)
  }

  return (
    <section className="timeline" aria-label="Song timeline">
      <div className="tl-head">
        <span className="tl-title">song</span>
        <label className="tl-length">
          <input
            type="number"
            min={1}
            max={MAX_SONG_BARS}
            value={lengthDraft ?? String(song.lengthBars)}
            onChange={(e) => setLengthDraft(e.target.value)}
            onBlur={(e) => { setLength(Number(e.target.value)); setLengthDraft(null) }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { setLength(Number(e.currentTarget.value)); setLengthDraft(null) }
            }}
            aria-label="Song length in bars"
          />
          <span>bars · {formatDuration(seconds)}</span>
        </label>
        <button type="button" className="tl-btn" onClick={() => setLength(song.lengthBars + 16)} title="Add sixteen bars">+16</button>
        <div className="tl-seg" role="group" aria-label="At the end">
          {ENDS.map((end) => (
            <button
              key={end}
              type="button"
              className={song.end === end ? 'on' : ''}
              onClick={() => onSongChange({ ...song, end })}
            >{end}</button>
          ))}
        </div>
        <div className="tl-zoom">
          <button type="button" className="tl-btn" onClick={() => setPxPerBar((p) => Math.max(MIN_PX, p / 1.5))} aria-label="Zoom out">−</button>
          <button
            type="button"
            className="tl-btn"
            onClick={() => { setPxPerBar(Math.max(MIN_PX, Math.min(MAX_PX, width / (song.lengthBars + 1)))); setStartBar(0) }}
            title="Fit the whole song"
          >fit</button>
          <button type="button" className="tl-btn" onClick={() => setPxPerBar((p) => Math.min(MAX_PX, p * 1.5))} aria-label="Zoom in">+</button>
          <button
            type="button"
            className={`tl-btn ${follow ? 'on' : ''}`}
            onClick={() => setFollow((f) => !f)}
            title="Keep the playhead in view"
          >follow</button>
        </div>
      </div>

      <div className="tl-rows" ref={rowsRef}>
        <div className="tl-row">
          <div className="tl-label" />
          <div className="tl-track">
            <canvas
              ref={rulerRef}
              className="tl-ruler"
              style={{ width, height: RULER_HEIGHT }}
              onPointerDown={(e) => {
                const rect = e.currentTarget.getBoundingClientRect()
                const endX = scale.toX(song.lengthBars)
                e.currentTarget.setPointerCapture(e.pointerId)
                if (Math.abs(e.clientX - rect.left - endX) <= 7) {
                  draggingEnd.current = true
                  return
                }
                setScrub(Math.floor(rulerBar(e)))
              }}
              onPointerMove={(e) => {
                if (draggingEnd.current) setLength(Math.max(1, Math.round(rulerBar(e))))
                else if (scrub !== null) setScrub(Math.max(0, Math.floor(rulerBar(e))))
              }}
              onPointerUp={(e) => {
                e.currentTarget.releasePointerCapture(e.pointerId)
                if (draggingEnd.current) {
                  draggingEnd.current = false
                  return
                }
                if (scrub !== null) {
                  // Seeking on release rather than on every move: each seek
                  // renders a bar of preroll, and a drag would queue dozens.
                  onSeek(Math.max(0, Math.min(song.end === 'hold' ? MAX_SONG_BARS : song.lengthBars - 1, scrub)))
                  setScrub(null)
                }
              }}
            />
          </div>
        </div>

        {children?.(scale, width)}

        {MACRO_INFO.map((info) => {
          const track = song.macros[info.key]
          const envelope = track?.envelope ?? { points: [] }
          const enabled = track?.enabled ?? false
          return (
            <div className="tl-row" key={info.key}>
              <div className="tl-label">
                <button
                  type="button"
                  className={`tl-toggle ${enabled && envelope.points.length > 0 ? 'on' : ''}`}
                  onClick={() => {
                    if (!track || envelope.points.length === 0) {
                      // Switching on an empty track starts it where the dial is.
                      setTrack(info.key, { enabled: true, envelope: { points: [{ bar: 0, value: dials[info.key], shape: 'linear' }] } })
                    } else {
                      setTrack(info.key, { ...track, enabled: !track.enabled })
                    }
                  }}
                  title={enabled ? 'The song drives this dial — click to hand it back' : 'Let the song drive this dial'}
                >
                  <span
                    className="tl-swatch"
                    style={{
                      borderColor: MACRO_COLOURS[info.key],
                      background: enabled && envelope.points.length > 0 ? MACRO_COLOURS[info.key] : 'transparent',
                    }}
                  />
                  {info.label.toLowerCase()}
                </button>
                {envelope.points.length > 0 && (
                  <button type="button" className="tl-clear" onClick={() => setTrack(info.key, undefined)} aria-label={`Clear ${info.label} track`}>×</button>
                )}
              </div>
              <div className="tl-track">
                <EnvelopeLane
                  envelope={envelope}
                  enabled={enabled}
                  fallback={dials[info.key]}
                  scale={scale}
                  width={width}
                  lengthBars={song.lengthBars}
                  playhead={playhead}
                  colour={MACRO_COLOURS[info.key]}
                  accent={accent}
                  onChange={(env) => setTrack(info.key, { enabled: true, envelope: env })}
                />
              </div>
            </div>
          )
        })}

        {songLanes.map(({ slot, lane }) => (
          <div className="tl-row" key={lane.id}>
            <div className="tl-label">
              <button
                type="button"
                className={`tl-toggle ${lane.enabled && lane.source.envelope.points.length > 0 ? 'on' : ''}`}
                onClick={() => setSlotLane(slot.id, lane.id, { ...lane, enabled: !lane.enabled })}
                title={`${slot.name} ${targetLabel(slot, lane)}`}
              >
                <span
                  className="tl-swatch"
                  style={{
                    borderColor: laneColour(lane.id),
                    background: lane.enabled && lane.source.envelope.points.length > 0 ? laneColour(lane.id) : 'transparent',
                  }}
                />
                <span className="tl-slot">{slot.name.toLowerCase()}</span> {targetLabel(slot, lane)}
              </button>
              <button type="button" className="tl-clear" onClick={() => setSlotLane(slot.id, lane.id, null)} aria-label="Remove lane">×</button>
            </div>
            <div className="tl-track">
              <EnvelopeLane
                envelope={lane.source.envelope}
                enabled={lane.enabled}
                fallback={0.5}
                scale={scale}
                width={width}
                lengthBars={song.lengthBars}
                playhead={playhead}
                colour={laneColour(lane.id)}
                accent={accent}
                onChange={(envelope) => setSlotLane(slot.id, lane.id, { ...lane, source: { kind: 'song', envelope } })}
              />
            </div>
          </div>
        ))}

        <div className="tl-row">
          <div className="tl-label">
            <select
              className="tl-add"
              value=""
              onChange={(e) => addSlotLane(e.target.value)}
              aria-label="Add an instrument lane to the timeline"
            >
              <option value="">+ instrument lane</option>
              {slots.map((slot) => {
                const def = instrumentById(slot.defId)
                if (!def) return null
                return (
                  <optgroup key={slot.id} label={slot.name}>
                    <option value={`${slot.id}|level`}>level</option>
                    {controlsOf(def).map((c) => (
                      <option key={c.param} value={`${slot.id}|${c.param}`}>{c.label.toLowerCase()}</option>
                    ))}
                  </optgroup>
                )
              })}
            </select>
          </div>
          <div className="tl-track" />
        </div>
      </div>

      <div
        className="tl-scroll"
        ref={scrollRef}
        onScroll={(e) => {
          const next = e.currentTarget.scrollLeft / pxPerBar
          if (Math.abs(next - startBar) * pxPerBar > 1) setStartBar(next)
        }}
      >
        <div style={{ width: (Math.max(song.lengthBars + 8, startBar + visibleBars)) * pxPerBar, height: 1 }} />
      </div>
    </section>
  )
}
