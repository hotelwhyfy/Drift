import { useState } from 'react'
import type { Song, HarmonySection } from '../song/song.ts'
import { PROGRESSION_STYLES, EXTENSIONS, CHORD_BAR_CHOICES, autoSection } from '../song/song.ts'
import { MODES, NOTE_NAMES } from '../core/theory.ts'
import type { Mode } from '../core/theory.ts'
import type { BarScale } from './barScale.ts'
import { romanNumeral } from './romanNumeral.ts'

interface Props {
  song: Song
  scale: BarScale
  width: number
  playhead: number
  /** The mode the dials would choose, for numerals in a section that leaves it to them. */
  dialMode: Mode
  accent: string
  onChange: (song: Song) => void
}

const STYLE_HINTS: Record<string, string> = {
  drift: 'wanders, weighted towards home',
  pedal: 'home under every other chord',
  circle: 'down a fifth each time',
  rise: 'steps up, home every four',
  custom: 'the chords you choose, in order',
}

function describe(section: HarmonySection): string {
  const key = section.key === null ? '' : NOTE_NAMES[section.key]
  const mode = section.mode ?? ''
  const where = [key, mode].filter(Boolean).join(' ') || 'dials'
  return section.style === 'drift' ? where : `${where} · ${section.style}`
}

/**
 * The harmony, as sections along the song.
 *
 * Each block holds from where it starts until the next begins, and each can
 * pin the key, the mode, how the chords move and how long they last — or leave
 * any of those to the dials. Click an empty stretch to start a section there,
 * click a block to edit it, double-click inside one to split it, and drag its
 * left edge to move where it begins.
 */
export function HarmonyRow({ song, scale, width, playhead, dialMode, accent, onChange }: Props) {
  const [selected, setSelected] = useState<number | null>(null)
  const [dragging, setDragging] = useState<number | null>(null)
  const sections = song.harmony
  const current = selected !== null ? sections[selected] : undefined

  const write = (next: HarmonySection[]): void => {
    const sorted = [...next].sort((a, b) => a.startBar - b.startBar)
    onChange({ ...song, harmony: sorted })
  }

  const update = (index: number, changes: Partial<HarmonySection>): void => {
    write(sections.map((s, i) => (i === index ? { ...s, ...changes } : s)))
  }

  const add = (bar: number): void => {
    const start = Math.max(0, Math.floor(bar))
    if (sections.some((s) => s.startBar === start)) return
    // A new section starts as a copy of the one it interrupts, so splitting a
    // section and then changing one thing is a single edit.
    const previous = [...sections].reverse().find((s) => s.startBar < start)
    const section: HarmonySection = previous ? { ...previous, startBar: start } : autoSection(start)
    const next = [...sections, section].sort((a, b) => a.startBar - b.startBar)
    write(next)
    setSelected(next.indexOf(section))
  }

  const mode = current?.mode ? MODES.find((m) => m.name === current.mode) ?? dialMode : dialMode

  return (
    <>
      <div className="tl-row">
        <div className="tl-label">
          <span className={`tl-toggle ${sections.length > 0 ? 'on' : ''}`}>harmony</span>
        </div>
        <div
          className="tl-track harmony-track"
          style={{ width }}
          onPointerDown={(e) => {
            if (e.target !== e.currentTarget) return
            const rect = e.currentTarget.getBoundingClientRect()
            add(scale.toBar(e.clientX - rect.left))
          }}
          onPointerMove={(e) => {
            if (dragging === null) return
            const rect = e.currentTarget.getBoundingClientRect()
            const bar = Math.max(0, Math.round(scale.toBar(e.clientX - rect.left)))
            const prev = sections[dragging - 1]
            const next = sections[dragging + 1]
            const lo = prev ? prev.startBar + 1 : 0
            const hi = next ? next.startBar - 1 : Number.MAX_SAFE_INTEGER
            const start = Math.min(hi, Math.max(lo, bar))
            if (start !== sections[dragging].startBar) update(dragging, { startBar: start })
          }}
          onPointerUp={() => setDragging(null)}
          title={sections.length === 0 ? 'Click to give this stretch of the song its own key, mode or progression' : undefined}
        >
          {sections.length === 0 && <span className="harmony-empty">the dials decide · click to add a section</span>}
          {sections.map((section, i) => {
            const left = scale.toX(section.startBar)
            const end = sections[i + 1]?.startBar ?? Math.max(song.lengthBars, section.startBar + 1)
            const right = scale.toX(end)
            if (right < 0 || left > width) return null
            return (
              <button
                key={`${section.startBar}-${i}`}
                type="button"
                className={`harmony-block ${selected === i ? 'on' : ''}`}
                style={{ left: Math.max(0, left), width: Math.max(4, right - Math.max(0, left) - 1), borderColor: selected === i ? accent : undefined }}
                onClick={() => setSelected(i)}
                onDoubleClick={(e) => {
                  const track = e.currentTarget.parentElement
                  if (!track) return
                  add(scale.toBar(e.clientX - track.getBoundingClientRect().left))
                }}
                title="Click to edit · double-click to split here"
              >
                <span
                  className="harmony-edge"
                  onPointerDown={(e) => {
                    e.stopPropagation()
                    const track = e.currentTarget.closest('.harmony-track')
                    if (track instanceof HTMLElement) track.setPointerCapture(e.pointerId)
                    setDragging(i)
                  }}
                />
                {describe(section)}
              </button>
            )
          })}
          {(() => {
            const x = scale.toX(playhead)
            return x >= 0 && x <= width
              ? <span className="harmony-playhead" style={{ left: x, background: accent }} />
              : null
          })()}
        </div>
      </div>

      {current && selected !== null && (
        <div className="harmony-panel">
          <div className="hp-row">
            <span className="hp-label">from bar</span>
            <span className="hp-value">{current.startBar + 1}</span>
            <span className="hp-hint">double-click a section to split it</span>
            <button type="button" className="tl-btn hp-remove" onClick={() => { write(sections.filter((_, i) => i !== selected)); setSelected(null) }}>
              remove section
            </button>
            <button type="button" className="tl-btn" onClick={() => setSelected(null)} aria-label="Close">×</button>
          </div>
          <div className="hp-row">
            <span className="hp-label">key</span>
            <div className="tl-seg">
              <button type="button" className={current.key === null ? 'on' : ''} onClick={() => update(selected, { key: null })}>dials</button>
              {NOTE_NAMES.map((name, pc) => (
                <button key={name} type="button" className={current.key === pc ? 'on' : ''} onClick={() => update(selected, { key: pc })}>{name}</button>
              ))}
            </div>
          </div>
          <div className="hp-row">
            <span className="hp-label">mode</span>
            <div className="tl-seg">
              <button type="button" className={current.mode === null ? 'on' : ''} onClick={() => update(selected, { mode: null })}>dials</button>
              {MODES.map((m) => (
                <button key={m.name} type="button" className={current.mode === m.name ? 'on' : ''} onClick={() => update(selected, { mode: m.name })}>{m.name}</button>
              ))}
            </div>
          </div>
          <div className="hp-row">
            <span className="hp-label">chords</span>
            <div className="tl-seg">
              {PROGRESSION_STYLES.map((style) => (
                <button key={style} type="button" title={STYLE_HINTS[style]} className={current.style === style ? 'on' : ''} onClick={() => update(selected, { style })}>{style}</button>
              ))}
            </div>
            <span className="hp-hint">{STYLE_HINTS[current.style]}</span>
          </div>
          {current.style === 'custom' && (
            <div className="hp-row">
              <span className="hp-label">sequence</span>
              <div className="hp-degrees">
                {current.degrees.map((d, i) => (
                  <button
                    key={i}
                    type="button"
                    className="hp-degree"
                    title="Remove"
                    onClick={() => update(selected, { degrees: current.degrees.filter((_, j) => j !== i) })}
                  >{romanNumeral(mode, d)}</button>
                ))}
              </div>
              <span className="hp-hint">add</span>
              <div className="tl-seg">
                {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                  <button
                    key={d}
                    type="button"
                    disabled={current.degrees.length >= 16}
                    onClick={() => update(selected, { degrees: [...current.degrees, d] })}
                  >{romanNumeral(mode, d)}</button>
                ))}
              </div>
            </div>
          )}
          <div className="hp-row">
            <span className="hp-label">each chord</span>
            <div className="tl-seg">
              <button type="button" className={current.chordBars === null ? 'on' : ''} onClick={() => update(selected, { chordBars: null })}>dials</button>
              {CHORD_BAR_CHOICES.map((n) => (
                <button key={n} type="button" className={current.chordBars === n ? 'on' : ''} onClick={() => update(selected, { chordBars: n })}>{n} bar{n > 1 ? 's' : ''}</button>
              ))}
            </div>
          </div>
          <div className="hp-row">
            <span className="hp-label">voicing</span>
            <div className="tl-seg">
              {EXTENSIONS.map((ext) => (
                <button key={ext} type="button" className={current.extensions === ext ? 'on' : ''} onClick={() => update(selected, { extensions: ext })}>
                  {ext === 'auto' ? 'density' : ext}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
