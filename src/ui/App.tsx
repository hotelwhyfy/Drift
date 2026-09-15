import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Dial } from './Dial.tsx'
import { SeedField } from './SeedField.tsx'
import { Visualizer } from './Visualizer.tsx'
import { Player } from '../audio/player.ts'
import { MACRO_INFO, DEFAULT_MACROS, SCENES } from '../macros/macros.ts'
import type { Macros, MacroKey } from '../macros/macros.ts'
import { buildPatch, modeNameAt, expressionFor } from '../macros/patch.ts'
import { RackView } from './RackView.tsx'
import type { SlotDesc } from '../engine/rack.ts'
import { DEFAULT_RACK } from '../engine/engine.ts'
import { instrumentById } from '../instruments/registry.ts'
import { NEUTRAL } from '../fuzzy/expression.ts'
import { readProject, writeProject, projectFilename } from '../project/project.ts'
import { saveTextFile, openTextFile, isCancellation, stripExtension } from '../project/filePicker.ts'
import { deriveSeed } from '../core/rng.ts'
import type { EngineSnapshot } from '../engine/engine.ts'

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
  }))
}

function blankSession(): Session {
  return {
    macros: DEFAULT_MACROS,
    seedName: randomSeedName(),
    slots: defaultSlots(),
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
  const [captureMinutes, setCaptureMinutes] = useState(3)
  const [projectName, setProjectName] = useState(initial.projectName)
  const [notice, setNotice] = useState<string | null>(null)
  const playerRef = useRef<Player | null>(null)

  const accent = accentFor(macros.colour)
  const patch = useMemo(() => buildPatch(macros), [macros])

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
    // Debounced: dragging a dial fires this every frame, and serialising every
    // automation curve at 60 Hz is wasted work.
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, writeProject(
          { name: projectName, macros, seedName, slots },
          new Date().toISOString(),
        ))
      } catch {
        // Private browsing. Losing the setting is survivable; crashing is not.
      }
    }, 400)
    return () => window.clearTimeout(timer)
  }, [macros, seedName, slots, projectName])

  useEffect(() => {
    document.documentElement.style.setProperty('--accent', accent)
  }, [accent])

  const setMacro = useCallback((key: MacroKey, v: number) => {
    setMacros((m) => ({ ...m, [key]: v }))
  }, [])

  const toggle = useCallback(() => {
    if (player.isPlaying) player.stop()
    else void player.play()
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
    const blob = await player.capture(captureMinutes * 60)
    setCaptureProgress(null)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `drift-${seedName}-${captureMinutes}min.wav`
    a.click()
    // Revoked on a delay: revoking immediately can cancel the download in
    // some browsers before it has read the blob.
    setTimeout(() => URL.revokeObjectURL(url), 30_000)
  }, [player, captureMinutes, seedName])

  const saveProject = useCallback(async () => {
    try {
      const text = writeProject(
        { name: projectName, macros, seedName, slots },
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
  }, [projectName, macros, seedName, slots])

  const loadProject = useCallback((text: string, filename?: string) => {
    try {
      const { project, warnings } = readProject(text)
      setMacros(project.macros)
      setSlots(project.slots)
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
          <span className="mode">{modeNameAt(macros.colour)}</span>
          <span className="dot" />
          <span>{patch.compose.tempo.toFixed(0)} bpm</span>
          {snapshot && playing && (
            <>
              <span className="dot" />
              <span className="bar-count">bar {snapshot.bar + 1}</span>
            </>
          )}
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
        {MACRO_INFO.map((info) => (
          <Dial
            key={info.key}
            label={info.label}
            low={info.low}
            high={info.high}
            value={macros[info.key]}
            accent={accent}
            onChange={(v) => setMacro(info.key, v)}
          />
        ))}
      </section>

      <RackView
        slots={slots}
        global={expressionFor(macros)}
        accent={accent}
        bars={(snapshot?.bar ?? 0) + (snapshot?.barPhase ?? 0)}
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
          <span>{playing ? 'endless' : 'begin'}</span>
        </button>

        <SeedField value={seedName} onCommit={applySeed} onShuffle={reseed} />

        <div className="capture">
          <div className="lengths" role="group" aria-label="Capture length">
            {CAPTURE_LENGTHS.map((m) => (
              <button
                key={m}
                type="button"
                className={captureMinutes === m ? 'on' : ''}
                onClick={() => setCaptureMinutes(m)}
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
