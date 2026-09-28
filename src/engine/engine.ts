import { createRng, deriveSeed } from '../core/rng.ts'
import { clamp01 } from '../core/curves.ts'
import type { Stereo } from '../voices/types.ts'
import { Reverb } from '../dsp/reverb.ts'
import { WowFlutter, Saturator, Limiter } from '../dsp/tape.ts'
import { Chorus, PingPong, Ducker } from '../dsp/modfx.ts'
import { Svf } from '../dsp/svf.ts'
import { Harmony } from '../compose/harmony.ts'
import { Rack } from './rack.ts'
import type { SlotState, ScheduledEvent, SlotReadout } from './rack.ts'
import { buildPatch } from '../macros/patch.ts'
import type { Patch, ComposeSettings } from '../macros/patch.ts'
import type { Macros } from '../macros/macros.ts'
import { MACRO_KEYS } from '../macros/macros.ts'
import { barLengthSamples } from './barLengthSamples.ts'
import { DEFAULT_SONG } from '../song/song.ts'
import type { Song } from '../song/song.ts'
import { macrosAt } from '../song/macrosAt.ts'
import { sectionAt } from '../song/sectionAt.ts'
import { composeAt } from '../song/composeAt.ts'

import type { HarmonicContext } from '../harmony/resolver.ts'

/** Samples between control-rate updates, on a grid that restarts every bar. */
const CONTROL_BLOCK = 64

/**
 * What the rack starts with — the ensemble the six dials, and the loudness
 * fit in `levelTrim`, were tuned against. Harmony and room first: the melodic
 * and percussive instruments are a click away, not a default.
 */
export const DEFAULT_RACK = ['pad', 'strings', 'shimmer', 'sub', 'bed', 'dust'] as const

export interface EngineSnapshot {
  bar: number
  barPhase: number
  chordDegree: number
  chordNotes: readonly number[]
  peak: number
  rms: number
  /** Per-slot state after automation, for the interface to display. */
  slots: SlotReadout[]
  /** The six dials as the music has them now — the song's where it drives them. */
  macros: Macros
  tempo: number
  modeName: string
  rootMidi: number
  /** A song set to stop has reached its end; only tails remain. */
  ended: boolean
}

/** Everything after the rack: one shared room, the tape, the limiter. */
interface MasterChain {
  readonly reverb: Reverb
  readonly echo: PingPong
  readonly chorus: Chorus
  readonly wow: WowFlutter
  readonly sat: Saturator
  readonly limiter: Limiter
  readonly ducker: Ducker
  readonly tiltL: Svf
  readonly tiltR: Svf
  readonly lowCutL: Svf
  readonly lowCutR: Svf
}

export { barLengthSamples }

/**
 * The whole instrument.
 *
 * Its job is now narrower than it was: harmony, tempo, the master chain, and
 * the clock. Instruments, their parameters and their notes belong to the Rack;
 * pitch belongs to the Resolver. What is left here is everything that is true
 * of the piece rather than of any one part.
 */
export class Engine {
  readonly sampleRate: number
  readonly rack: Rack
  private patch: Patch
  private targetMacros: Macros
  private currentMacros: Macros

  private harmony: Harmony
  private dsp: MasterChain
  private song: Song = DEFAULT_SONG
  private ended = false
  /** Compose settings per bar, for the harmony's replay. Cleared on any change. */
  private settingsMemo = new Map<number, ComposeSettings>()

  private bar = 0
  private samplesIntoBar = 0
  private barLength = 0
  private pending: ScheduledEvent[] = []
  private pendingIndex = 0
  private peak = 0
  /** The meter the interface reads, reset by each snapshot. */
  private rmsAcc = 0
  private rmsCount = 0
  private lastRms = 0
  /**
   * The level follow lanes read, accumulated and smoothed inside control().
   * It used to be the snapshot meter, which only moved when the interface
   * asked for a snapshot — so a capture, which never asks, heard follow lanes
   * sitting at zero while playback heard them move.
   */
  private levelAcc = 0
  private levelCount = 0
  private level = 0
  private lastKick = 0

  private ducked: Stereo = [0, 0]
  private clean: Stereo = [0, 0]
  private rvOut: Stereo = [0, 0]
  private echoOut: Stereo = [0, 0]
  private chorusOut: Stereo = [0, 0]
  private limOut: Stereo = [0, 0]

  constructor(sampleRate: number, macros: Macros, private seed: number) {
    this.sampleRate = sampleRate
    this.targetMacros = { ...macros }
    this.currentMacros = { ...macros }
    this.patch = buildPatch(macros)

    this.rack = new Rack(sampleRate, seed)
    this.harmony = new Harmony(seed)
    this.dsp = this.buildDsp()

    for (const id of DEFAULT_RACK) this.rack.add(id)
    this.applyPatch()
    this.barLength = barLengthSamples(this.patch.compose.tempo, sampleRate)
    this.loadBar(0)
  }

  /** The master chain, fresh. Seeded, so a rebuilt chain is the same chain. */
  private buildDsp(): MasterChain {
    const sr = this.sampleRate
    const rng = createRng(deriveSeed(this.seed, 'engine'))
    // Constructed in this order because the reverb, chorus and wow share one
    // stream: reordering them would change every render.
    const reverb = new Reverb(sr, rng)
    const echo = new PingPong(sr)
    const chorus = new Chorus(sr, rng)
    const wow = new WowFlutter(sr, rng)
    return {
      reverb, echo, chorus, wow,
      sat: new Saturator(),
      limiter: new Limiter(sr),
      ducker: new Ducker(sr),
      tiltL: new Svf(sr),
      tiltR: new Svf(sr),
      lowCutL: new Svf(sr),
      lowCutR: new Svf(sr),
    }
  }

  /**
   * Jump to a bar.
   *
   * Everything that is a function of position — the bar's events, its chord,
   * every lane — is recomputed for the new bar exactly as if it had been
   * played to. What cannot be recomputed is what was *sounding*: tails, held
   * notes, the reverb. Those are rebuilt empty, so a seek is deterministic
   * (the same seek renders the same audio every time) even though its first
   * moments differ from a play-through. `preroll` bars are rendered silently
   * first, so the room is already full when the audio starts.
   */
  seek(bar: number, opts: { preroll?: number } = {}): void {
    const to = Math.max(0, Math.floor(bar))
    const from = Math.max(0, to - Math.max(0, Math.floor(opts.preroll ?? 0)))
    this.dsp = this.buildDsp()
    this.rack.resetVoices()
    this.harmony.invalidate()
    this.ended = false
    this.lastKick = 0
    this.levelAcc = 0
    this.levelCount = 0
    this.level = 0
    this.snapMacros(this.targetMacros)
    this.loadBar(from)
    if (from < to) {
      const scratch = 4096
      const l = new Float32Array(scratch)
      const r = new Float32Array(scratch)
      while (this.bar < to) {
        const n = Math.min(scratch, Math.max(1, Math.ceil(this.barLength - this.samplesIntoBar)))
        this.render(l, r, n)
      }
    }
    this.peak = 0
    this.rmsAcc = 0
    this.rmsCount = 0
  }

  /** The events scheduled for the current bar. For tests and diagnostics. */
  get barEvents(): readonly ScheduledEvent[] {
    return this.pending
  }

  setMacros(m: Macros): void {
    this.targetMacros = { ...m }
    this.settingsMemo.clear()
  }

  /**
   * Lay the dials (and later the harmony) out over a timeline. Takes effect at
   * the next control tick; the harmony is replayed against it from the start,
   * so every bar's chord reflects the song as it now is.
   */
  setSong(song: Song): void {
    this.song = song
    this.settingsMemo.clear()
    this.harmony.invalidate()
  }

  /**
   * A different piece from the same settings.
   *
   * Deliberately not a rebuild. Constructing a new Engine would reset the bar
   * count, empty the reverb and cut every sounding note — indistinguishable
   * from pressing stop and play, which is not what "a new world" means. The
   * seed only governs decisions not yet made, so re-rolling it changes the
   * music from the next bar on while the current one plays out underneath.
   */
  reseed(seed: number): void {
    this.seed = seed
    this.harmony.setSeed(seed)
    this.rack.setSeed(seed)
  }

  get currentSeed(): number {
    return this.seed
  }

  snapMacros(m: Macros): void {
    this.targetMacros = { ...m }
    this.settingsMemo.clear()
    this.currentMacros = macrosAt(this.song, m, this.bar + this.samplesIntoBar / (this.barLength || 1)).macros
    this.patch = buildPatch(this.currentMacros)
    this.applyPatch()
  }

  private applyPatch(): void {
    const p = this.patch
    this.dsp.reverb.set(p.reverb.size, p.reverb.decay, p.reverb.damping, p.reverb.preDelay, p.reverb.width)
    this.dsp.echo.set(p.echo.time, p.echo.feedback, p.echo.mix, p.echo.tone)
    this.dsp.chorus.set(p.master.chorusDepth, p.master.chorusMix)
    this.dsp.wow.set(p.master.wow, p.master.flutter)
    this.dsp.sat.set(p.master.drive)
    this.dsp.ducker.setAmount(p.master.duckAmount)
    this.dsp.ducker.setRelease(p.master.duckRelease)
    this.dsp.tiltL.set(p.master.tilt, 0.6)
    this.dsp.tiltR.set(p.master.tilt, 0.6)
    this.dsp.lowCutL.set(p.master.lowCut, 0.5)
    this.dsp.lowCutR.set(p.master.lowCut, 0.5)
  }

  /**
   * Move the dials towards where they belong at `pos`. Dials the song drives
   * are set exactly — the envelope is already smooth, and gliding it would put
   * the music behind the timeline by an amount that depends on how fast it
   * was moving. Dials under the hand glide, so a drag is heard as a gesture
   * rather than a series of steps.
   */
  private moveMacros(pos: number): void {
    const { macros, driven } = macrosAt(this.song, this.targetMacros, pos)
    const cur = this.currentMacros
    let moved = false
    for (let i = 0; i < MACRO_KEYS.length; i++) {
      const k = MACRO_KEYS[i]
      let next = macros[k]
      if (!driven.includes(k)) {
        const d = next - cur[k]
        if (Math.abs(d) > 1e-4) next = cur[k] + d * 0.06
      }
      if (next !== cur[k]) {
        cur[k] = next
        moved = true
      }
    }
    if (moved) {
      this.patch = buildPatch(cur)
      this.applyPatch()
    }
  }

  /** What the composer works from at a bar. A pure function of the song and the dials. */
  private settingsAt = (bar: number): ComposeSettings => {
    const cached = this.settingsMemo.get(bar)
    if (cached) return cached
    if (this.settingsMemo.size > 8192) this.settingsMemo.clear()
    const s = composeAt(
      buildPatch(macrosAt(this.song, this.targetMacros, bar).macros).compose,
      sectionAt(this.song, bar),
    )
    this.settingsMemo.set(bar, s)
    return s
  }

  private harmonicContext(): HarmonicContext {
    const s = this.settingsAt(this.bar)
    return {
      chord: this.harmony.at(this.bar, this.settingsAt),
      mode: s.mode,
      rootMidi: s.rootMidi,
    }
  }

  private loadBar(requested: number): void {
    let bar = requested
    if (bar >= this.song.lengthBars && this.song.end === 'loop') bar = 0
    this.ended = bar >= this.song.lengthBars && this.song.end === 'stop'
    this.bar = bar
    this.samplesIntoBar = 0
    this.moveMacros(bar)
    const s = this.patch.compose
    this.barLength = barLengthSamples(s.tempo, this.sampleRate)
    this.pendingIndex = 0
    if (this.ended) {
      // Past the end of a song that stops: nothing new starts, and what was
      // already sounding is left to ring out.
      this.pending = []
      return
    }
    this.rack.prepareBar(this.patch.expression, bar)
    this.pending = this.rack.bar(bar, this.harmonicContext(), s.tempo, s.swing, s.humanise)
  }

  /**
   * Control-rate pass: glide the macros, run every instrument's automation and
   * inference, then dispatch any events falling inside this block.
   */
  private control(): void {
    this.moveMacros(this.bar + this.samplesIntoBar / this.barLength)
    if (this.levelCount > 0) {
      // About a tenth of a second of smoothing, the same window the meter
      // used to give, but counted in samples rather than in snapshots.
      const rms = Math.sqrt(this.levelAcc / this.levelCount)
      const frames = this.levelCount / 2
      const k = 1 - Math.exp(-frames / (this.sampleRate * 0.1))
      this.level += (rms - this.level) * k
      this.levelAcc = 0
      this.levelCount = 0
    }
    this.rack.control(this.patch.expression, {
      bars: this.bar + this.samplesIntoBar / this.barLength,
      kick: this.lastKick,
      level: this.level,
    })
    this.lastKick *= 0.86

    const blockEnd = this.samplesIntoBar + CONTROL_BLOCK
    while (this.pendingIndex < this.pending.length && this.pending[this.pendingIndex].offset < blockEnd) {
      const kick = this.rack.fire(this.pending[this.pendingIndex], this.patch.compose.referenceHz)
      if (kick > 0) {
        this.dsp.ducker.trigger(kick)
        this.lastKick = kick
      }
      this.pendingIndex++
    }
  }

  render(left: Float32Array, right: Float32Array, frames: number): void {
    let done = 0
    while (done < frames) {
      // All control work happens on a grid owned by the engine, and no block
      // straddles a bar line. Both matter: if control work followed the
      // *caller's* buffer boundaries, then a render in 0.4 s playback chunks
      // would dispatch notes at different instants than the same music
      // rendered in 2 s capture slices, and the export would quietly diverge
      // from what was played. The seam between playback and export is only
      // honest if the engine cannot tell how it is being asked for audio.
      //
      // The grid restarts at every bar line rather than running from sample
      // zero. Bars are a whole number of samples that depends on the tempo, so
      // an absolute grid lands at a different point inside bar N depending on
      // every tempo before it — and a seek, which has no "before", could not
      // reproduce it.
      if (this.samplesIntoBar % CONTROL_BLOCK === 0) this.control()

      const toGrid = CONTROL_BLOCK - (this.samplesIntoBar % CONTROL_BLOCK)
      const toBarEnd = Math.max(1, Math.ceil(this.barLength - this.samplesIntoBar))
      const n = Math.min(frames - done, toGrid, toBarEnd)

      this.renderBlock(left, right, done, n)

      done += n
      this.samplesIntoBar += n
      if (this.samplesIntoBar >= this.barLength) this.loadBar(this.bar + 1)
    }
  }

  private renderBlock(left: Float32Array, right: Float32Array, start: number, n: number): void {
    const p = this.patch
    const ducked = this.ducked
    const clean = this.clean
    const rv = this.rvOut
    const ec = this.echoOut
    const ch = this.chorusOut
    const lim = this.limOut
    const echoMix = p.echo.mix
    const rvMix = p.reverb.mix
    const chMix = p.master.chorusMix
    const gain = p.master.gain

    for (let i = 0; i < n; i++) {
      ducked[0] = 0
      ducked[1] = 0
      clean[0] = 0
      clean[1] = 0
      this.rack.process(ducked, clean)

      const duck = this.dsp.ducker.process()
      let l = ducked[0] * duck
      let r = ducked[1] * duck

      ch[0] = 0
      ch[1] = 0
      this.dsp.chorus.process((l + r) * 0.5, ch)
      l = l * (1 - chMix) + ch[0] * chMix
      r = r * (1 - chMix) + ch[1] * chMix

      l += clean[0]
      r += clean[1]

      // One shared room. Most of why a rack of independent instruments sounds
      // like a single recording rather than several.
      this.dsp.echo.process(l * echoMix, r * echoMix, ec)
      l += ec[0] * echoMix
      r += ec[1] * echoMix
      this.dsp.reverb.process(l, r, rv)
      l = l * (1 - rvMix * 0.45) + rv[0] * rvMix
      r = r * (1 - rvMix * 0.45) + rv[1] * rvMix

      l = this.dsp.wow.process(l)
      r = this.dsp.wow.process(r)
      l = this.dsp.sat.process(l)
      r = this.dsp.sat.process(r)
      l = this.dsp.tiltL.lowpass(l)
      r = this.dsp.tiltR.lowpass(r)
      l = this.dsp.lowCutL.highpass(l)
      r = this.dsp.lowCutR.highpass(r)
      this.dsp.limiter.process(l * gain, r * gain, lim)

      left[start + i] = lim[0]
      right[start + i] = lim[1]

      const a = Math.max(Math.abs(lim[0]), Math.abs(lim[1]))
      if (a > this.peak) this.peak = a
      const energy = lim[0] * lim[0] + lim[1] * lim[1]
      this.rmsAcc += energy
      this.rmsCount += 2
      this.levelAcc += energy
      this.levelCount += 2
    }
  }

  snapshot(): EngineSnapshot {
    const ctx = this.harmonicContext()
    if (this.rmsCount > 0) {
      this.lastRms = Math.sqrt(this.rmsAcc / this.rmsCount)
      this.rmsAcc = 0
      this.rmsCount = 0
    }
    const peak = this.peak
    this.peak = 0
    return {
      bar: this.bar,
      barPhase: clamp01(this.samplesIntoBar / this.barLength),
      chordDegree: ctx.chord.degree,
      chordNotes: ctx.chord.notes,
      peak,
      rms: this.lastRms,
      slots: this.rack.readout(),
      macros: { ...this.currentMacros },
      tempo: (60 * 4 * this.sampleRate) / this.barLength,
      modeName: this.settingsAt(this.bar).mode.name,
      rootMidi: this.settingsAt(this.bar).rootMidi,
      ended: this.ended,
    }
  }

  get patchNow(): Patch {
    return this.patch
  }

  get slotStates(): readonly SlotState[] {
    return this.rack.states
  }
}

