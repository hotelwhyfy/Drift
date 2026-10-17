import { useCallback, useEffect, useRef, useState } from 'react'
import { Journey } from '@/mood/journey.ts'
import type { Macros } from '@/macros/macros.ts'

/** How often the journey nudges the dials. Slow — nothing here is urgent. */
const JOURNEY_TICK_MS = 1800

export interface JourneyControl {
  /** Whether the journey is still moving the dials. */
  steering: boolean
  /** 0..1 along the journey. */
  progress: number
  /** Set off from `from` towards `to`, arriving in about `minutes`. */
  begin: (from: Macros, to: Macros, minutes: number) => void
  /**
   * Any deliberate touch of a control ends the steering. The journey is a
   * suggestion; dragging the dials out from under someone who has taken hold of
   * them would be indefensible.
   */
  takeOver: () => void
  /** Forget the journey altogether. */
  stop: () => void
}

/**
 * The journey: a slow, one-way move from where they are to somewhere calmer,
 * in wall-clock time. While `active`, each tick hands the dials' new position
 * to `onStep`; reaching the end lets go of them.
 */
export function useJourney(active: boolean, onStep: (macros: Macros) => void): JourneyControl {
  const [progress, setProgress] = useState(0)
  const [steering, setSteering] = useState(false)
  const journeyRef = useRef<Journey | null>(null)
  const stepRef = useRef(onStep)
  stepRef.current = onStep

  useEffect(() => {
    if (!active) return
    const timer = window.setInterval(() => {
      const journey = journeyRef.current
      if (!journey || !journey.isSteering) return
      const state = journey.at(performance.now())
      setProgress(state.progress)
      stepRef.current(state.macros)
      if (state.arrived) {
        journey.release()
        setSteering(false)
      }
    }, JOURNEY_TICK_MS)
    return () => window.clearInterval(timer)
  }, [active])

  const begin = useCallback((from: Macros, to: Macros, minutes: number) => {
    const journey = new Journey(from, to, minutes)
    journey.start(performance.now())
    journeyRef.current = journey
    setSteering(true)
    setProgress(0)
  }, [])

  const takeOver = useCallback(() => {
    if (journeyRef.current?.isSteering) {
      journeyRef.current.release()
      setSteering(false)
    }
  }, [])

  const stop = useCallback(() => {
    journeyRef.current?.release()
    journeyRef.current = null
    setSteering(false)
  }, [])

  return { steering, progress, begin, takeOver, stop }
}
