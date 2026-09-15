import { rngAt } from '../core/rng.ts'
import { buildChord, nextDegree, voiceNear } from '../core/theory.ts'
import type { Chord } from '../core/theory.ts'
import type { ComposeSettings } from '../macros/patch.ts'

/**
 * The endless progression.
 *
 * Chord N is derived by replaying the walk from the start, which sounds
 * wasteful and is not: the walk is a handful of table lookups per step, and
 * deriving rather than storing means chord 9000 is the same chord whether you
 * sat through it or seeked to it. That is the property the capture button
 * depends on — an export re-renders music you have already heard.
 *
 * The replay is capped and cached, so an hour-long session does not turn into
 * a quadratic amount of work.
 */
export class Harmony {
  private cacheIndex = -1
  private cacheDegree = 0
  private cacheVoicing: number[] = []

  constructor(private seed: number) {}

  /** Re-roll the walk. The next chord differs; nothing currently sounding does. */
  setSeed(seed: number): void {
    this.seed = seed
    this.reset()
  }

  /** The chord in effect at `chordIndex` (not bar index). */
  at(chordIndex: number, s: ComposeSettings): Chord {
    const target = Math.max(0, chordIndex)
    // Restart the walk if we jumped backwards or too far forward.
    if (this.cacheIndex > target || target - this.cacheIndex > 64) {
      this.cacheIndex = -1
      this.cacheDegree = 0
      this.cacheVoicing = []
    }
    while (this.cacheIndex < target) {
      const next = this.cacheIndex + 1
      if (next === 0) {
        this.cacheDegree = 0 // always open on the tonic
      } else {
        const rng = rngAt(this.seed, 'harmony', next)
        this.cacheDegree = nextDegree(rng, this.cacheDegree, s.wander)
      }
      const notes = buildChord(s.mode, s.rootMidi + 24, this.cacheDegree, s.richness)
      // Voiced around the chordal register, which is where a pad or
      // keyboard would naturally hold a chord.
      this.cacheVoicing = voiceNear(notes, this.cacheVoicing, s.rootMidi + 22)
      this.cacheIndex = next
    }
    return {
      degree: this.cacheDegree,
      notes: this.cacheVoicing,
      // The chord's own root, read in the bass register `rootMidi` sits in.
      root: s.rootMidi + this.degreeSemitone(s),
    }
  }

  private degreeSemitone(s: ComposeSettings): number {
    const n = s.mode.steps.length
    const d = ((this.cacheDegree % n) + n) % n
    return s.mode.steps[d]
  }

  reset(): void {
    this.cacheIndex = -1
    this.cacheDegree = 0
    this.cacheVoicing = []
  }
}
