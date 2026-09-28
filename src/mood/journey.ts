import type { Macros } from '../macros/macros.ts'
import { MACRO_KEYS } from '../macros/macros.ts'
import { clamp01 } from '../core/curves.ts'

/**
 * The one-way move from where someone is to somewhere calmer.
 *
 * A one-way trajectory, not an automation lane — lanes loop, and a loop would
 * carry the music back to the agitation it started from every few minutes,
 * which is the opposite of the point.
 *
 * The shape matters as much as the destination. It holds near the start for the
 * first fifth of the journey, because arriving and immediately being moved
 * somewhere else reads as not having been heard; then it eases across; then it
 * settles slowly rather than stopping dead.
 */
export function journeyEase(t: number): number {
  const x = clamp01(t)
  // A flat start, a smooth middle, a long tail.
  const held = 0.2
  if (x <= held) return 0
  const u = (x - held) / (1 - held)
  return u * u * (3 - 2 * u)
}

export function blendMacros(from: Macros, to: Macros, t: number): Macros {
  const eased = journeyEase(t)
  const out: Macros = { ...from }
  for (const key of MACRO_KEYS) {
    out[key] = clamp01(from[key] + (to[key] - from[key]) * eased)
  }
  return out
}

export interface JourneyState {
  /** 0..1 along the journey. */
  progress: number
  macros: Macros
  arrived: boolean
}

/**
 * Tracks the journey in wall-clock time.
 *
 * Wall-clock rather than musical time on purpose: this is about how long a
 * person has been sitting with it, which is not a number of bars. It lives
 * outside the engine for the same reason — nothing here may touch the render
 * path, whose determinism depends on never reading a clock.
 */
export class Journey {
  private startedAt = 0
  private durationMs = 0
  private running = false
  private released = false

  constructor(
    private from: Macros,
    private to: Macros,
    minutes: number,
  ) {
    this.durationMs = Math.max(60_000, minutes * 60_000)
  }

  start(now: number): void {
    this.startedAt = now
    this.running = true
    this.released = false
  }

  /**
   * Stop steering. Called the moment someone touches a dial: the journey is a
   * suggestion, and continuing to drag the controls out from under a person who
   * has taken hold of them would be indefensible.
   */
  release(): void {
    this.released = true
    this.running = false
  }

  get isSteering(): boolean {
    return this.running && !this.released
  }

  /** Re-aim at a new destination, keeping the time already elapsed. */
  retarget(from: Macros, to: Macros, minutes: number, now: number): void {
    this.from = from
    this.to = to
    this.durationMs = Math.max(60_000, minutes * 60_000)
    this.startedAt = now
    this.running = true
    this.released = false
  }

  at(now: number): JourneyState {
    if (!this.running) {
      return { progress: this.released ? 1 : 0, macros: this.from, arrived: this.released }
    }
    const progress = clamp01((now - this.startedAt) / this.durationMs)
    return {
      progress,
      macros: blendMacros(this.from, this.to, progress),
      arrived: progress >= 1,
    }
  }
}
