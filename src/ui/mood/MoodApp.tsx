import { useCallback, useState } from 'react'
import { Opening } from '@/ui/mood/Opening.tsx'
import { Listening } from '@/ui/mood/Listening.tsx'
import { Dial } from '@/ui/Dial.tsx'
import { RackView } from '@/ui/RackView.tsx'
import { usePlayer } from '@/ui/hooks/usePlayer.ts'
import { useAccent } from '@/ui/hooks/useAccent.ts'
import { choosePrompt } from '@/mood/prompts.ts'
import type { Prompt } from '@/mood/prompts.ts'
import { interpret } from '@/mood/interpret.ts'
import type { Reading } from '@/mood/interpret.ts'
import { arrangementFor } from '@/mood/arrange.ts'
import type { Arrangement } from '@/mood/arrange.ts'
import { useJourney } from '@/ui/hooks/useJourney.ts'
import { MACRO_INFO, DEFAULT_MACROS } from '@/macros/macros.ts'
import type { Macros, MacroKey } from '@/macros/macros.ts'
import { buildPatch, expressionFor, modeNameAt } from '@/macros/patch.ts'
import type { SlotDesc } from '@/engine/types.ts'
import { Tooltip } from '@/ui/Tooltip.tsx'

type Phase = 'opening' | 'playing'

export function MoodApp() {
  const [prompt, setPrompt] = useState<Prompt>(() => choosePrompt())
  const [phase, setPhase] = useState<Phase>('opening')
  const [reading, setReading] = useState<Reading | null>(null)
  const [arrangement, setArrangement] = useState<Arrangement | null>(null)
  const [macros, setMacros] = useState<Macros>(DEFAULT_MACROS)
  const [slots, setSlots] = useState<SlotDesc[]>([])
  const [deskOpen, setDeskOpen] = useState(false)

  const { player, playing, snapshot } = usePlayer(DEFAULT_MACROS, 1)

  const { steering, progress, begin: beginJourney, takeOver, stop: stopJourney } = useJourney(
    phase === 'playing',
    (next) => {
      setMacros(next)
      player.setMacros(next)
    },
  )

  const accent = useAccent(macros.colour)
  // Read the real tempo from the patch rather than re-deriving it here, so the
  // readout cannot drift away from what is actually playing.
  const tempo = Math.round(buildPatch(macros).compose.tempo)

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
    // From the top, against the rack just sent, so its first bar is not lost
    // to the one the engine had already scheduled.
    void player.play(0)

    beginJourney(plan.macros, plan.resting, plan.minutes)
    setPhase('playing')
  }, [player, beginJourney])

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
    stopJourney()
    setDeskOpen(false)
    setReading(null)
    setArrangement(null)
    setPrompt(choosePrompt())
    setPhase('opening')
  }, [player, stopJourney])

  if (phase === 'opening') {
    return <Opening prompt={prompt} onAnswer={answer} />
  }

  return (
    <main className={`mood ${deskOpen ? 'desk-open' : ''}`}>
      <Listening player={player} playing={playing} accent={accent} />

      <section className="mood-centre">
        {reading && (
          <Tooltip content={arrangement ? `${arrangement.slots.length} instruments` : undefined}>
            <p className="mood-echo">
              “{reading.text}”
            </p>
          </Tooltip>
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
          <Tooltip content="Easing toward something calmer">
            <div className="mood-journey">
              <div className="mood-journey-bar">
                <span style={{ width: `${progress * 100}%`, background: accent }} />
              </div>
              <span className="mood-journey-label">settling</span>
            </div>
          </Tooltip>
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
            readouts={snapshot?.slots}
            metering={playing}
            playhead={(snapshot?.bar ?? 0) + (snapshot?.barPhase ?? 0)}
            onChange={changeSlots}
          />
        </section>
      )}
    </main>
  )
}

