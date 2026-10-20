import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DriftName } from '@/ui/header/DriftName.tsx'
import { Visualizer } from '@/ui/Visualizer.tsx'
import { Dials } from '@/ui/Dials.tsx'
import { FileActions } from '@/ui/header/FileActions.tsx'
import { CaptureControls } from '@/ui/transport/CaptureControls.tsx'
import { SCENES } from '@/macros/macros.ts'
import type { Macros, MacroKey } from '@/macros/macros.ts'
import { buildPatch, expressionFor } from '@/macros/patch.ts'
import { RackView } from '@/ui/rack/RackView.tsx'
import type { SlotDesc, EngineSnapshot } from '@/engine/types.ts'
import { deriveSeed } from '@/core/rng.ts'
import { Timeline } from '@/ui/timeline/Timeline.tsx'
import type { Song } from '@/song/types.ts'
import { macrosAt } from '@/song/macrosAt.ts'
import { setPointAt } from '@/song/setPointAt.ts'
import { songSeconds } from '@/song/songSeconds.ts'
import { sectionAt } from '@/song/sectionAt.ts'
import { composeAt } from '@/song/composeAt.ts'
import { HarmonyRow } from '@/ui/timeline/HarmonyRow.tsx'
import { generateDrift } from '@/generate/generateDrift.ts'
import { NOTE_NAMES } from '@/core/theory.ts'
import { loadSession } from '@/ui/session/loadSession.ts'
import { randomSeedName } from '@/ui/session/randomSeedName.ts'
import type { Session } from '@/ui/types.ts'
import { useNotice } from '@/ui/hooks/useNotice.ts'
import { useAutosave } from '@/ui/hooks/useAutosave.ts'
import { useSessionHistory } from '@/ui/hooks/useSessionHistory.ts'
import { useProjectFiles } from '@/ui/hooks/useProjectFiles.ts'
import { useCapture } from '@/ui/hooks/useCapture.ts'
import type { CaptureLength } from '@/ui/hooks/useCapture.ts'
import { useFileDrop } from '@/ui/hooks/useFileDrop.ts'
import { useShortcuts } from '@/ui/hooks/useShortcuts.ts'
import { usePlayer } from '@/ui/hooks/usePlayer.ts'
import { useAccent } from '@/ui/hooks/useAccent.ts'
import { useHeightAsCssVar } from '@/ui/hooks/useHeightAsCssVar.ts'
import { useScrolledPast } from '@/ui/hooks/useScrolledPast.ts'
import { usePlayerSync } from '@/ui/hooks/usePlayerSync.ts'

export function App() {
  const initial = useMemo(loadSession, [])
  const [macros, setMacros] = useState<Macros>(initial.macros)
  const [seedName, setSeedName] = useState(initial.seedName)
  const [slots, setSlots] = useState<SlotDesc[]>(initial.slots)
  const { player, playing, snapshot, clearSnapshot, captureProgress, setCaptureProgress } =
    usePlayer(initial.macros, deriveSeed(initial.seedName))
  const [captureLength, setCaptureLength] = useState<CaptureLength>('song')
  const [song, setSong] = useState<Song>(initial.song)
  /** Where playback starts from, and where the playhead rests when stopped. */
  const [cursor, setCursor] = useState(0)
  const [projectName, setProjectName] = useState(initial.projectName)
  const { notice, say } = useNotice()

  const playhead = playing && snapshot ? snapshot.bar + snapshot.barPhase : cursor
  /** The dials as the music has them at the playhead: the song's where it drives them. */
  const heard = useMemo(
    () => (playing && snapshot ? snapshot.macros : macrosAt(song, macros, cursor).macros),
    [playing, snapshot, song, macros, cursor],
  )
  const accent = useAccent(heard.colour)
  const patch = useMemo(() => buildPatch(heard), [heard])
  const seconds = useMemo(() => songSeconds(song, macros), [song, macros])
  /** Key and mode at the playhead, sections included. */
  const harmonyNow = useMemo(() => {
    if (playing && snapshot) return { mode: snapshot.modeName, root: snapshot.rootMidi }
    const s = composeAt(patch.compose, sectionAt(song, cursor))
    return { mode: s.mode.name, root: s.rootMidi }
  }, [playing, snapshot, patch, song, cursor])

  usePlayerSync(player, macros, slots, song)

  // A song that stopped by itself goes back to the top, ready to play again.
  const lastSnapshot = useRef<EngineSnapshot | null>(null)
  // The header is pinned; the visualiser pins below it via --head-h.
  const headRef = useRef<HTMLElement>(null)
  useHeightAsCssVar(headRef, '--head-h')
  // Shorter once scrolled, for more room; it shrinks 16px, inside the 40/8 gap.
  const compact = useScrolledPast(40, 8)
  lastSnapshot.current = snapshot
  useEffect(() => {
    if (playing) return
    const last = lastSnapshot.current
    if (last?.ended) setCursor(0)
  }, [playing])

  const session = useMemo<Session>(
    () => ({ macros, seedName, slots, song, projectName }),
    [macros, seedName, slots, song, projectName],
  )
  useAutosave(session)

  /** Puts a past state back. The playhead stays where it is: undo is not a seek. */
  const restore = useCallback((past: Session, current: Session) => {
    setMacros(past.macros)
    setSlots(past.slots)
    setSong(past.song)
    setProjectName(past.projectName)
    if (past.seedName !== current.seedName) {
      setSeedName(past.seedName)
      player.reseed(deriveSeed(past.seedName))
    }
  }, [player])
  const history = useSessionHistory(session, restore)

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
      clearSnapshot()
      void player.play(Math.floor(cursor))
    }
  }, [player, snapshot, cursor])

  const seek = useCallback((bar: number) => {
    setCursor(bar)
    if (player.isPlaying) {
      clearSnapshot()
      player.seek(bar)
    }
  }, [player])

  /** Replaces everything at once: what opening a file, generating and undoing share. */
  const applySession = useCallback((next: Session) => {
    history.beforeReplace()
    setMacros(next.macros)
    setSlots(next.slots)
    setSong(next.song)
    setCursor(0)
    setSeedName(next.seedName)
    setProjectName(next.projectName)
    if (player.isPlaying) {
      clearSnapshot()
      player.seek(0)
    }
    player.reseed(deriveSeed(next.seedName))
  }, [player, history.beforeReplace])

  /**
   * The drift a name gives: its seed, dials, rack and song. It replaces the
   * work on screen, which the autosave would then overwrite, so the notice
   * offers it back rather than asking first — a confirmation on every press
   * would make generating several in a row a chore.
   */
  const generateFrom = useCallback((name: string) => {
    applySession({ ...generateDrift(name), seedName: name, projectName: name })
    say(`generated ${name}`, session)
  }, [session, applySession, say])

  /** A brand-new drift under a random name. */
  const generate = useCallback(() => generateFrom(randomSeedName()), [generateFrom])

  const undoGenerate = useCallback(() => {
    const previous = notice?.undo
    if (!previous) return
    applySession(previous)
    say(`back to ${previous.projectName}`)
  }, [notice, applySession, say])

  const capture = useCapture(player, captureLength, projectName, seedName, setCaptureProgress, say)
  const { saveProject, openProject, openFile } = useProjectFiles(session, applySession, setProjectName, say)
  useFileDrop(openFile)
  useShortcuts({
    toggle,
    save: () => void saveProject(),
    open: () => void openProject(),
    undo: history.undo,
    redo: history.redo,
  })

  return (
    <main className="app">
      <header className={`head ${compact ? 'compact' : ''}`} ref={headRef}>
        <div className="head-title">
          <h1>drift</h1>
          <DriftName value={seedName} onCommit={generateFrom} />
          {/* Saved or opened under a name of its own: show that too. */}
          {projectName !== seedName && projectName !== 'untitled' && (
            <span className="head-file">{projectName}</span>
          )}
        </div>
        <div className="state">
          <span className="mode">{NOTE_NAMES[harmonyNow.root % 12]} {harmonyNow.mode}</span>
          <span className="dot" />
          <span>{(playing && snapshot ? snapshot.tempo : patch.compose.tempo).toFixed(0)} bpm</span>
          <span className="dot" />
          <span className="bar-count">bar {Math.floor(playhead) + 1} / {song.lengthBars}</span>
          <FileActions
            canUndo={history.canUndo}
            canRedo={history.canRedo}
            onUndo={history.undo}
            onRedo={history.redo}
            onGenerate={generate}
            onOpen={() => void openProject()}
            onSave={() => void saveProject()}
          />
        </div>
      </header>

      <Visualizer player={player} playing={playing} accent={accent} />

      <Dials
        song={song}
        macros={macros}
        heard={heard}
        accent={accent}
        onChange={setMacro}
        onUnlink={unlinkMacro}
      />

      <Timeline
        song={song}
        dials={macros}
        slots={slots}
        playhead={playhead}
        playing={playing}
        accent={accent}
        autoTuning={patch.compose.referenceHz}
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
        metering={playing}
        playhead={playhead}
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

        <CaptureControls
          length={captureLength}
          onLengthChange={setCaptureLength}
          songSeconds={seconds}
          progress={captureProgress}
          onCapture={() => void capture()}
        />
      </footer>
      {/* Floats over the page rather than taking a row in it, so a
          confirmation never shifts the controls under the pointer. */}
      {notice && (
        <div key={notice.id} className={`toast ${notice.leaving ? 'leaving' : ''}`} role="status">
          {notice.text}
          {notice.undo && <button type="button" className="toast-action" onClick={undoGenerate}>undo</button>}
        </div>
      )}
    </main>
  )
}
