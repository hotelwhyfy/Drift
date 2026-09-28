import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Dial } from './Dial.tsx'
import { SeedField } from './SeedField.tsx'
import { Visualizer } from './Visualizer.tsx'
import { Player } from '../audio/player.ts'
import { MACRO_INFO, DEFAULT_MACROS, SCENES } from '../macros/macros.ts'
import type { Macros, MacroKey } from '../macros/macros.ts'
import { buildPatch, expressionFor } from '../macros/patch.ts'
import { RackView } from './RackView.tsx'
import type { SlotDesc } from '../engine/rack.ts'
import { DEFAULT_RACK } from '../engine/engine.ts'
import { instrumentById } from '../instruments/registry.ts'
import { NEUTRAL } from '../fuzzy/expression.ts'
import { readProject, writeProject, projectFilename } from '../project/project.ts'
import { saveTextFile, openTextFile, isCancellation, stripExtension } from '../project/filePicker.ts'
import { deriveSeed } from '../core/rng.ts'
import type { EngineSnapshot } from '../engine/engine.ts'
import { Timeline } from './Timeline.tsx'
import { DEFAULT_SONG } from '../song/song.ts'
import type { Song } from '../song/song.ts'
import { macrosAt } from '../song/macrosAt.ts'
import { setPointAt } from '../song/setPointAt.ts'
import { songSeconds } from '../song/songSeconds.ts'
import { sectionAt } from '../song/sectionAt.ts'
import { composeAt } from '../song/composeAt.ts'
import { HarmonyRow } from './HarmonyRow.tsx'
import { NOTE_NAMES } from '../core/theory.ts'
import { MACRO_COLOURS } from './laneColours.ts'

const CAPTURE_LENGTHS = [1, 3, 10, 30]
const STORAGE_KEY = 'drift.state.v1'

/** Words for the seed, so a world can be remembered and typed back in. */
const SEED_WORDS = [
  'amber', 'ash', 'bloom', 'cedar', 'dusk', 'ember', 'fern', 'glass', 'haze',
  'ivory', 'jade', 'kelp', 'linen', 'moss', 'night', 'ochre', 'pearl', 'quill',
  'rain', 'slate', 'tide', 'umber', 'vellum', 'willow', 'yarrow', 'zephyr',
]

function randomSeedName(): string {
  const a = SEED_WORDS[Math.floor(Math.random() * SEED_WORDS.length)]
  const b = SEED_WORDS[Math.floor(Math.random() * SEED_WORDS.length)]
  const n = Math.floor(Math.random() * 90 + 10)
  return `${a}-${b}-${n}`
}

interface Session {
  macros: Macros
  seedName: string
  slots: SlotDesc[]
  song: Song
  projectName: string
}

/** The rack the six dials were tuned against. */
function defaultSlots(): SlotDesc[] {
  return DEFAULT_RACK.map((defId, i) => ({
    id: `${defId}-${i}`,
    defId,
    name: instrumentById(defId)?.name ?? defId,
    level: 0.8,
    muted: false,
    soloed: false,
    expression: { ...NEUTRAL },
    // Following the dials completely by default, so the app behaves as a
    // six-dial instrument until someone deliberately breaks a slot away.
    follow: 1,
    lanes: [],
    knobs: {},
  }))
}

function blankSession(): Session {
  return {
    macros: DEFAULT_MACROS,
    seedName: randomSeedName(),
    slots: defaultSlots(),
    song: DEFAULT_SONG,
    projectName: 'untitled',
  }
}

/**
 * The autosave is a project file.
 *
 * It used to be its own ad-hoc JSON shape, which quietly lost every drawn
 * automation curve on reload: `JSON.stringify` turns a Float32Array into an
 * object with numeric keys and no length, and nothing on the way back in
 * checked. Sharing one serialiser with the save/open path means there is a
 * single piece of code to get right, and it is the one with tests.
 */
function loadSession(): Session {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const { project } = readProject(raw)
      return {
        macros: project.macros,
        seedName: project.seedName,
        slots: project.slots.length > 0 ? project.slots : defaultSlots(),
        song: project.song,
        projectName: project.name,
      }
    }
  } catch {
    // A corrupt, blocked or older store is not a reason to fail to start.
  }
  return blankSession()
}

/**
 * Accent colour follows the Colour macro — indigo when the harmony is modal and
 * dark, amber when it opens up. Tying the one piece of colour in the interface
 * to the one macro that changes the mood means the screen agrees with the
 * speakers without anyone having to read a label.
 */
function accentFor(colour: number): string {
  // Around the warm side of the wheel — indigo, violet, rose, amber. The
  // direct route from indigo to amber runs through green, which reads as
  // clinical and belongs to a different kind of music entirely.
  const hue = (248 + colour * 152) % 360
  const sat = 40 + colour * 28
  const light = 58 + colour * 7
  return hslToHex(hue, sat, light)
}

function hslToHex(h: number, s: number, l: number): string {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100)
  const f = (n: number): string => {
    const k = (n + h / 30) % 12
    const c = l / 100 - a * Math.max(-1, Math.min(Math.min(k - 3, 9 - k), 1))
    return Math.round(255 * c).toString(16).padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

export function App() {
  const initial = useMemo(loadSession, [])
  const [macros, setMacros] = useState<Macros>(initial.macros)
  const [seedName, setSeedName] = useState(initial.seedName)
  const [slots, setSlots] = useState<SlotDesc[]>(initial.slots)
  const [playing, setPlaying] = useState(false)
  const [snapshot, setSnapshot] = useState<EngineSnapshot | null>(null)
  const [captureProgress, setCaptureProgress] = useState<number | null>(null)
  /** Minutes, or 'song' for the song once through. */
  const [captureLength, setCaptureLength] = useState<number | 'song'>('song')
  const [song, setSong] = useState<Song>(initial.song)
  /** Where playback starts from, and where the playhead rests when stopped. */
  const [cursor, setCursor] = useState(0)
  const [projectName, setProjectName] = useState(initial.projectName)
  const [notice, setNotice] = useState<string | null>(null)
  const playerRef = useRef<Player | null>(null)

  const playhead = playing && snapshot ? snapshot.bar + snapshot.barPhase : cursor
  /** The dials as the music has them at the playhead: the song's where it drives them. */
  const heard = useMemo(
    () => (playing && snapshot ? snapshot.macros : macrosAt(song, macros, cursor).macros),
    [playing, snapshot, song, macros, cursor],
  )
  const accent = accentFor(heard.colour)
  const patch = useMemo(() => buildPatch(heard), [heard])
  const seconds = useMemo(() => songSeconds(song, macros), [song, macros])
  /** Key and mode at the playhead, sections included. */
  const harmonyNow = useMemo(() => {
    if (playing && snapshot) return { mode: snapshot.modeName, root: snapshot.rootMidi }
    const s = composeAt(patch.compose, sectionAt(song, cursor))
    return { mode: s.mode.name, root: s.rootMidi }
  }, [playing, snapshot, patch, song, cursor])

  // One Player for the life of the page. Recreating it would rebuild the
  // AudioContext, and browsers limit how many of those a page may have.
  if (playerRef.current === null) {
    playerRef.current = new Player(initial.macros, deriveSeed(initial.seedName), {
      onSnapshot: setSnapshot,
      onStateChange: setPlaying,
      onCaptureProgress: (p) => setCaptureProgress(p),
    })
  }
  const player = playerRef.current

  useEffect(() => () => player.dispose(), [player])

  // Dev-only diagnostic handle. The queue depth is exactly how long a mute or
  // level change takes to be heard, and it is worth being able to measure
  // rather than infer.
  useEffect(() => {
    if (!import.meta.env.DEV) return
    Reflect.set(window, '__drift', player)
    return () => { Reflect.deleteProperty(window, '__drift') }
  }, [player])

  useEffect(() => {
    player.setMacros(macros)
  }, [macros, player])

  useEffect(() => {
    player.setRack(slots)
  }, [slots, player])

  useEffect(() => {
    player.setSong(song)
  }, [song, player])

  // A song that stopped by itself goes back to the top, ready to play again.
  const lastSnapshot = useRef<EngineSnapshot | null>(null)
  lastSnapshot.current = snapshot
  useEffect(() => {
    if (playing) return
    const last = lastSnapshot.current
    if (last?.ended) setCursor(0)
  }, [playing])

  useEffect(() => {
    // Debounced: dragging a dial fires this every frame, and serialising every
    // automation curve at 60 Hz is wasted work.
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, writeProject(
          { name: projectName, macros, seedName, slots, song },
          new Date().toISOString(),
        ))
      } catch {
        // Private browsing. Losing the setting is survivable; crashing is not.
      }
    }, 400)
    return () => window.clearTimeout(timer)
  }, [macros, seedName, slots, song, projectName])

  useEffect(() => {
    document.documentElement.style.setProperty('--accent', accent)
  }, [accent])

  /**
   * Turning a dial the song drives writes into the song at the playhead,
   * rather than fighting it — and while playing, that leaves a trail of
   * points, which is recording automation by hand.
   */
  const setMacro = useCallback((key: MacroKey, v: number) => {
    const track = song.macros[key]
    if (track?.enabled && track.envelope.points.length > 0) {
      const at = Math.round(playhead * 4) / 4
      setSong({ ...song, macros: { ...song.macros, [key]: { ...track, envelope: setPointAt(track.envelope, at, v) } } })
      return
    }
    setMacros((m) => ({ ...m, [key]: v }))
  }, [song, playhead])

  const unlinkMacro = useCallback((key: MacroKey) => {
    const track = song.macros[key]
    if (!track) return
    // The dial keeps the value it had, so letting go is not a jump.
    setMacros((m) => ({ ...m, [key]: heard[key] }))
    setSong({ ...song, macros: { ...song.macros, [key]: { ...track, enabled: false } } })
  }, [song, heard])

  const toggle = useCallback(() => {
    if (player.isPlaying) {
      player.stop()
      if (snapshot) setCursor(snapshot.bar)
    } else {
      // Until audio from the new start is heard, the playhead sits on the
      // cursor rather than wherever the last snapshot left it.
      setSnapshot(null)
      void player.play(Math.floor(cursor))
    }
  }, [player, snapshot, cursor])

  const seek = useCallback((bar: number) => {
    setCursor(bar)
    if (player.isPlaying) {
      setSnapshot(null)
      player.seek(bar)
    }
  }, [player])

  /**
   * Set the seed to whatever was typed. Re-seeding is in place, so the current
   * bar and the reverb tail carry across — typing a seed is a change of
   * direction, not a restart.
   */
  const applySeed = useCallback((name: string) => {
    setSeedName(name)
    player.reseed(deriveSeed(name))
  }, [player])

  const reseed = useCallback(() => {
    applySeed(randomSeedName())
  }, [applySeed])

  const capture = useCallback(async () => {
    setCaptureProgress(0)
    const blob = captureLength === 'song'
      ? await player.capture('song')
      : await player.capture('minutes', captureLength * 60)
    setCaptureProgress(null)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = captureLength === 'song'
      ? `drift-${projectName !== 'untitled' ? projectName : seedName}.wav`
      : `drift-${seedName}-${captureLength}min.wav`
    a.click()
    // Revoked on a delay: revoking immediately can cancel the download in
    // some browsers before it has read the blob.
    setTimeout(() => URL.revokeObjectURL(url), 30_000)
  }, [player, captureLength, seedName, projectName])

  const saveProject = useCallback(async () => {
    try {
      const text = writeProject(
        { name: projectName, macros, seedName, slots, song },
        new Date().toISOString(),
      )
      const result = await saveTextFile(text, projectFilename(projectName))
      if (!result) return
      // The name the user typed in the dialog becomes the project's name.
      setProjectName(result.name)
      setNotice(`saved ${result.name}`)
    } catch (error) {
      if (isCancellation(error)) return
      setNotice(error instanceof Error ? error.message : 'Could not save.')
    }
  }, [projectName, macros, seedName, slots, song])

  const loadProject = useCallback((text: string, filename?: string) => {
    try {
      const { project, warnings } = readProject(text)
      setMacros(project.macros)
      setSlots(project.slots)
      setSong(project.song)
      setCursor(0)
      setSeedName(project.seedName)
      // The filename wins over the name inside the file: it is what the user
      // last chose to call it, and what they will look for next time.
      const name = filename ? stripExtension(filename) : project.name
      setProjectName(name)
      player.reseed(deriveSeed(project.seedName))
      setNotice(warnings.length > 0 ? warnings.join(' ') : `opened ${name}`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not open that file.')
    }
  }, [player])

  const openFile = useCallback(async (file: File | null | undefined) => {
    if (!file) return
    loadProject(await file.text(), file.name)
  }, [loadProject])

  const openProject = useCallback(async () => {
    try {
      const opened = await openTextFile()
      if (opened) loadProject(opened.text, opened.name)
    } catch (error) {
      if (isCancellation(error)) return
      setNotice(error instanceof Error ? error.message : 'Could not open that file.')
    }
  }, [loadProject])

  // Dropping a project anywhere on the window opens it.
  useEffect(() => {
    const over = (e: DragEvent): void => { e.preventDefault() }
    const drop = (e: DragEvent): void => {
      e.preventDefault()
      void openFile(e.dataTransfer?.files?.[0])
    }
    window.addEventListener('dragover', over)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragover', over)
      window.removeEventListener('drop', drop)
    }
  }, [openFile])

  // Notices clear themselves; they are confirmations, not state.
  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), 4500)
    return () => window.clearTimeout(timer)
  }, [notice])

  // Space toggles playback, the one shortcut worth having in an app you leave
  // running in a background tab.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target
      const typing = target instanceof HTMLElement &&
        (target.tagName === 'INPUT' || target.isContentEditable || target.getAttribute('role') === 'slider')
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void saveProject()
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'o') {
        e.preventDefault()
        void openProject()
        return
      }
      if (e.code === 'Space' && !typing) {
        e.preventDefault()
        toggle()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggle, saveProject, openProject])

  return (
    <main className="app">
      <header className="head">
        <h1>
          drift
          {projectName && projectName !== 'untitled' && (
            <span className="head-project">{projectName}</span>
          )}
        </h1>
        <div className="state">
          <span className="mode">{NOTE_NAMES[harmonyNow.root % 12]} {harmonyNow.mode}</span>
          <span className="dot" />
          <span>{(playing && snapshot ? snapshot.tempo : patch.compose.tempo).toFixed(0)} bpm</span>
          <span className="dot" />
          <span className="bar-count">bar {Math.floor(playhead) + 1} / {song.lengthBars}</span>
          <div className="file-actions">
            <button type="button" onClick={() => void openProject()} title="Open project (⌘O)" aria-label="Open project">
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M1.5 12.5V4a1 1 0 0 1 1-1h3.2l1.4 1.6h6.4a1 1 0 0 1 1 1v6.9a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1Z" />
              </svg>
            </button>
            <button type="button" onClick={() => void saveProject()} title="Save project (⌘S)" aria-label="Save project">
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M8 1.8v8.4M4.6 7l3.4 3.4L11.4 7M2.2 12.6v1.1a.6.6 0 0 0 .6.6h10.4a.6.6 0 0 0 .6-.6v-1.1" />
              </svg>
            </button>
          </div>
        </div>
      </header>
      {notice && <div className="notice" role="status">{notice}</div>}

      <Visualizer player={player} playing={playing} accent={accent} />

      <section className="dials" aria-label="Sound controls">
        {MACRO_INFO.map((info) => {
          const track = song.macros[info.key]
          const driven = !!track?.enabled && track.envelope.points.length > 0
          return (
            <div className={`dial-slot ${driven ? 'driven' : ''}`} key={info.key}>
              <Dial
                label={info.label}
                low={info.low}
                high={info.high}
                value={driven ? heard[info.key] : macros[info.key]}
                // A dial the song drives wears its lane's colour, so the two
                // read as one control in two places.
                accent={driven ? MACRO_COLOURS[info.key] : accent}
                onChange={(v) => setMacro(info.key, v)}
              />
              {driven && (
                <button
                  type="button"
                  className="dial-unlink"
                  onClick={() => unlinkMacro(info.key)}
                  title="The song is driving this dial. Turning it writes into the song at the playhead; click to take it back."
                >
                  <span className="tl-swatch" style={{ borderColor: MACRO_COLOURS[info.key], background: MACRO_COLOURS[info.key] }} />
                  on timeline ×
                </button>
              )}
            </div>
          )
        })}
      </section>

      <Timeline
        song={song}
        dials={macros}
        slots={slots}
        playhead={playhead}
        playing={playing}
        accent={accent}
        onSongChange={setSong}
        onSlotsChange={setSlots}
        onSeek={seek}
      >
        {(scale, width) => (
          <HarmonyRow
            song={song}
            scale={scale}
            width={width}
            playhead={playhead}
            dialMode={patch.compose.mode}
            accent={accent}
            onChange={setSong}
          />
        )}
      </Timeline>

      <RackView
        slots={slots}
        global={expressionFor(heard)}
        accent={accent}
        bars={(snapshot?.bar ?? 0) + (snapshot?.barPhase ?? 0)}
        readouts={snapshot?.slots}
        onChange={setSlots}
      />

      <section className="scenes" aria-label="Starting points">
        {SCENES.map((s) => (
          <button
            key={s.name}
            className="chip"
            onClick={() => setMacros(s.macros)}
            type="button"
          >
            {s.name}
          </button>
        ))}
      </section>

      <footer className="transport">
        <button
          className={`play ${playing ? 'on' : ''}`}
          onClick={toggle}
          type="button"
          aria-label={playing ? 'Stop' : 'Play'}
        >
          <span className="play-glyph">{playing ? '■' : '▶'}</span>
          <span>{playing ? 'stop' : cursor > 0 ? `from ${Math.floor(cursor) + 1}` : 'begin'}</span>
        </button>

        <SeedField value={seedName} onCommit={applySeed} onShuffle={reseed} />

        <div className="capture">
          <div className="lengths" role="group" aria-label="Capture length">
            <button
              type="button"
              className={captureLength === 'song' ? 'on' : ''}
              onClick={() => setCaptureLength('song')}
              title={`The song once through, ${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')} plus its tail`}
            >
              song
            </button>
            {CAPTURE_LENGTHS.map((m) => (
              <button
                key={m}
                type="button"
                className={captureLength === m ? 'on' : ''}
                onClick={() => setCaptureLength(m)}
              >
                {m}m
              </button>
            ))}
          </div>
          <button
            className="capture-go"
            onClick={() => void capture()}
            disabled={captureProgress !== null}
            type="button"
          >
            {captureProgress === null
              ? 'capture'
              : `${Math.round(captureProgress * 100)}%`}
          </button>
        </div>
      </footer>
    </main>
  )
}
