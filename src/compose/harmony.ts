import { rngAt } from '../core/rng.ts'
import { buildChord, nextDegree, voiceNear } from '../core/theory.ts'
import type { Chord } from '../core/theory.ts'
import type { ComposeSettings } from '../macros/patch.ts'

/** The compose settings in effect at a bar. Must be a pure function of the bar. */
export type SettingsAt = (bar: number) => ComposeSettings

/**
 * The endless progression.
 *
 * The chord at bar N is derived by replaying the walk bar by bar from the
 * start, which sounds wasteful and is not: each step is a handful of table
 * lookups, and deriving rather than storing means bar 9000 has the same chord
 * whether you sat through it or seeked to it. That is the property the capture
 * button and the timeline both depend on.
 *
 * It is keyed by bar rather than by chord index because the chord length can
 * itself change over a song. Counting chords would make bar 40's harmony depend
 * on how long every earlier chord happened to be held under whatever settings
 * were current when it was asked — a path, not a position. Walking bars against
 * `settingsAt` makes the answer a function of the song alone.
 *
 * Chord changes land where the bar number divides by the chord length, so a
 * change of harmonic rhythm always lands on a phrase line rather than wherever
 * the previous chord happened to end.
 */
export class Harmony {
  private cacheBar = -1
  private degree = 0
  private voicing: number[] = []
  private root = 0
  /** Chords since the current harmony section began, for the patterned styles. */
  private chordInSection = 0
  /** What the current voicing was built from, so a mid-chord change of mode,
   *  key or richness re-voices the same degree rather than waiting it out. */
  private builtFrom = ''

  constructor(private seed: number) {}

  /** Re-roll the walk. The next chord differs; nothing currently sounding does. */
  setSeed(seed: number): void {
    this.seed = seed
    this.invalidate()
  }

  /** Forget the replay, for when the settings the walk was run against change. */
  invalidate(): void {
    this.cacheBar = -1
    this.degree = 0
    this.voicing = []
    this.root = 0
    this.chordInSection = 0
    this.builtFrom = ''
  }

  /** The chord in effect at `bar`. */
  at(bar: number, settingsAt: SettingsAt): Chord {
    const target = Math.max(0, Math.floor(bar))
    if (this.cacheBar > target) this.invalidate()
    while (this.cacheBar < target) {
      const b = this.cacheBar + 1
      const s = settingsAt(b)
      const intoSection = b - s.sectionStart
      if (b === 0 || intoSection === 0) {
        // A piece, and every section of a song, opens on its own home chord.
        this.chordInSection = 0
        this.degree = this.choose(b, s, 0)
      } else if (intoSection % Math.max(1, s.chordBars) === 0) {
        this.chordInSection++
        this.degree = this.choose(b, s, this.chordInSection)
      }
      this.voice(s)
      this.cacheBar = b
    }
    return { degree: this.degree, notes: this.voicing, root: this.root }
  }

  /**
   * The degree for the `k`th chord of a section. The dials only ever ask for
   * the drifting walk; the other styles are for a song section that wants a
   * shape rather than a wander.
   */
  private choose(bar: number, s: ComposeSettings, k: number): number {
    const rng = rngAt(this.seed, 'harmony', bar)
    switch (s.style) {
      case 'custom':
        return s.degrees.length > 0 ? s.degrees[k % s.degrees.length] : 0
      case 'pedal':
        // Home, away, home: the tonic under every other chord, and a
        // neighbour borrowed in between.
        return k % 2 === 0 ? 0 : [3, 5, 6][Math.floor(rng() * 3)]
      case 'circle':
        // Down a fifth each time — the oldest progression there is.
        return (k * 3) % 7
      case 'rise':
        // Stepwise up from the tonic, back home every four chords.
        return k % 4
      case 'drift':
        return k === 0 ? 0 : nextDegree(rng, this.degree, s.wander)
    }
  }

  private voice(s: ComposeSettings): void {
    const notes = buildChord(s.mode, s.rootMidi + 24, this.degree, s.richness, s.extensions)
    const key = notes.join(',')
    if (key === this.builtFrom) return
    // Voiced around the chordal register, which is where a pad or keyboard
    // would naturally hold a chord.
    this.voicing = voiceNear(notes, this.voicing, s.rootMidi + 22)
    // The chord's own root, read in the bass register `rootMidi` sits in.
    const n = s.mode.steps.length
    const d = ((this.degree % n) + n) % n
    this.root = s.rootMidi + s.mode.steps[d]
    this.builtFrom = key
  }
}
