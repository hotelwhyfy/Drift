import { useCallback, useEffect, useRef, useState } from 'react'
import { Opening } from './Opening.tsx'
import { Listening } from './Listening.tsx'
import { Dial } from '../Dial.tsx'
import { RackView } from '../RackView.tsx'
import { Player } from '../../audio/player.ts'
import { accentFor } from '../accent.ts'
import { choosePrompt } from '../../mood/prompts.ts'
import type { Prompt } from '../../mood/prompts.ts'
import { interpret } from '../../mood/interpret.ts'
import type { Reading } from '../../mood/interpret.ts'
import { arrangementFor } from '../../mood/arrange.ts'
import type { Arrangement } from '../../mood/arrange.ts'
import { Journey } from '../../mood/journey.ts'
import { MACRO_INFO, DEFAULT_MACROS } from '../../macros/macros.ts'
import type { Macros, MacroKey } from '../../macros/macros.ts'
import { buildPatch, expressionFor, modeNameAt } from '../../macros/patch.ts'
import type { SlotDesc } from '../../engine/rack.ts'
import type { EngineSnapshot } from '../../engine/engine.ts'

type Phase = 'opening' | 'playing'

/** How often the journey nudges the dials. Slow — nothing here is urgent. */
const JOURNEY_TICK_MS = 1800

export function MoodApp() {
  const [prompt, setPrompt] = useState<Prompt>(() => choosePrompt())
  const [phase, setPhase] = useState<Phase>('opening')
  const [reading, setReading] = useState<Reading | null>(null)
  const [arrangement, setArrangement] = useState<Arrangement | null>(null)
  const [macros, setMacros] = useState<Macros>(DEFAULT_MACROS)
  const [slots, setSlots] = useState<SlotDesc[]>([])
  const [playing, setPlaying] = useState(false)
  const [snapshot, setSnapshot] = useState<EngineSnapshot | null>(null)
  const [deskOpen, setDeskOpen] = useState(false)
  const [progress, setProgress] = useState(0)
  const [steering, setSteering] = useState(false)

  const playerRef = useRef<Player | null>(null)
  const journeyRef = useRef<Journey | null>(null)

  if (playerRef.current === null) {
    playerRef.current = new Player(DEFAULT_MACROS, 1, {
      onSnapshot: setSnapshot,
      onStateChange: setPlaying,
    })
  }
  const player = playerRef.current

  useEffect(() => () => player.dispose(), [player])

  const accent = accentFor(macros.colour)
  // Read the real tempo from the patch rather than re-deriving it here, so the
  // readout cannot drift away from what is actually playing.
  const tempo = Math.round(buildPatch(macros).compose.tempo)
  useEffect(() => {
    document.documentElement.style.setProperty('--accent', accent)
  }, [accent])

  /** Everything downstream of the answer happens here. */
  const answer = useCallback((text: string) => {
    const nextReading = interpret(text)
    const plan = arrangementFor(nextReading)

    setReading(nextReading)
    setArrangement(plan)
    setMacros(plan.macros)
    setSlots(plan.slots)

    player.reseed(plan.seed)
    player.setMacros(plan.macros)
    player.setRack(plan.slots)
    void player.play()

    const journey = new Journey(plan.macros, plan.resting, plan.minutes)
    journey.start(performance.now())
    journeyRef.current = journey
    setSteering(true)
    setProgress(0)
    setPhase('playing')
  }, [player])

  // The journey: a slow, one-way move from where they are to somewhere calmer.
  useEffect(() => {
    if (phase !== 'playing') return
    const timer = window.setInterval(() => {
      const journey = journeyRef.current
      if (!journey || !journey.isSteering) return
      const state = journey.at(performance.now())
      setProgress(state.progress)
      setMacros(state.macros)
      player.setMacros(state.macros)
      if (state.arrived) {
        journey.release()
        setSteering(false)
      }
    }, JOURNEY_TICK_MS)
    return () => window.clearInterval(timer)
  }, [phase, player])

  /**
   * Any deliberate touch of a control ends the steering. The journey is a
   * suggestion; dragging the dials out from under someone who has taken hold of
   * them would be indefensible.
   */
  const takeOver = useCallback(() => {
    if (journeyRef.current?.isSteering) {
      journeyRef.current.release()
      setSteering(false)
    }
  }, [])

  const setMacro = useCallback((key: MacroKey, value: number) => {
    takeOver()
    setMacros((m) => {
      const next = { ...m, [key]: value }
      player.setMacros(next)
      return next
    })
  }, [player, takeOver])

  const changeSlots = useCallback((next: SlotDesc[]) => {
    setSlots(next)
    player.setRack(next)
  }, [player])

  const askAgain = useCallback(() => {
    player.stop()
    journeyRef.current?.release()
    journeyRef.current = null
    setSteering(false)
    setDeskOpen(false)
    setReading(null)
    setArrangement(null)
    setPrompt(choosePrompt())
    setPhase('opening')
  }, [player])

  if (phase === 'opening') {
    return <Opening prompt={prompt} onAnswer={answer} />
  }

  return (
    <main className={`mood ${deskOpen ? 'desk-open' : ''}`}>
      <Listening player={player} playing={playing} accent={accent} />

      <section className="mood-centre">
        {reading && (
          <p className="mood-echo" title={arrangement ? `${arrangement.slots.length} instruments` : undefined}>
            “{reading.text}”
          </p>
        )}

        <div className="mood-state">
          <span style={{ color: accent }}>{modeNameAt(macros.colour)}</span>
          <span className="mood-dot" />
          <span>{tempo} bpm</span>
          {snapshot && playing && (
            <>
              <span className="mood-dot" />
              <span>bar {snapshot.bar + 1}</span>
            </>
          )}
        </div>

        <button
          type="button"
          className={`mood-play ${playing ? 'on' : ''}`}
          onClick={() => (playing ? player.stop() : void player.play())}
          aria-label={playing ? 'Pause' : 'Play'}
        >
          {playing ? '■' : '▶'}
        </button>

        {steering && (
          <div className="mood-journey" title="Easing toward something calmer">
            <div className="mood-journey-bar">
              <span style={{ width: `${progress * 100}%`, background: accent }} />
            </div>
            <span className="mood-journey-label">settling</span>
          </div>
        )}
      </section>

      <div className="mood-actions">
        <button type="button" onClick={askAgain}>ask me again</button>
        <button
          type="button"
          onClick={() => setDeskOpen((open) => !open)}
          aria-expanded={deskOpen}
        >
          {deskOpen ? 'put it away' : 'open the desk'}
        </button>
      </div>

      {deskOpen && (
        <section className="desk">
          <div className="desk-dials">
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
          </div>
          <RackView
            slots={slots}
            global={expressionFor(macros)}
            accent={accent}
            bars={(snapshot?.bar ?? 0) + (snapshot?.barPhase ?? 0)}
            onChange={changeSlots}
          />
        </section>
      )}
    </main>
  )
}

