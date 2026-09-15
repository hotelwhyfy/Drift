import { createRng, deriveSeed } from '../core/rng.ts'
import { clamp01 } from '../core/curves.ts'
import type { Stereo } from '../voices/types.ts'
import { Reverb } from '../dsp/reverb.ts'
import { WowFlutter, Saturator, Limiter } from '../dsp/tape.ts'
import { Chorus, PingPong, Ducker } from '../dsp/modfx.ts'
import { Svf } from '../dsp/svf.ts'
import { Harmony } from '../compose/harmony.ts'
import { Rack } from './rack.ts'
import type { SlotState, ScheduledEvent } from './rack.ts'
import { buildPatch } from '../macros/patch.ts'
import type { Patch } from '../macros/patch.ts'
import type { Macros } from '../macros/macros.ts'
import type { Expression } from '../fuzzy/expression.ts'

import type { HarmonicContext } from '../harmony/resolver.ts'

/** Samples between control-rate updates, on an absolute grid. */
const CONTROL_BLOCK = 64

/** What the rack starts with — the ensemble the six dials were tuned against. */
export const DEFAULT_RACK = ['pad', 'sub', 'rhodes', 'kit', 'dust', 'bed'] as const

export interface EngineSnapshot {
  bar: number
  barPhase: number
  chordDegree: number
  chordNotes: readonly number[]
  peak: number
  rms: number
  /** Per-slot expression after automation, for the interface to display. */
  slots: { id: string; expression: Expression; level: number }[]
}

export function barLengthSamples(tempo: number, sampleRate: number): number {
  return (60 / tempo) * 4 * sampleRate
}

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
  private reverb: Reverb
  private echo: PingPong
  private chorus: Chorus
  private wow: WowFlutter
  private sat: Saturator
  private limiter: Limiter
  private ducker: Ducker
  private tiltL: Svf
  private tiltR: Svf
  private lowCutL: Svf
  private lowCutR: Svf

  private bar = 0
  private samplesIntoBar = 0
  private barLength = 0
  private pending: ScheduledEvent[] = []
  private pendingIndex = 0
  private position = 0
  private peak = 0
  private rmsAcc = 0
  private rmsCount = 0
  private lastRms = 0
  private lastKick = 0
  private lastControlPosition = 0

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

    const rng = createRng(deriveSeed(seed, 'engine'))
    this.rack = new Rack(sampleRate, seed)
    this.harmony = new Harmony(seed)

    this.reverb = new Reverb(sampleRate, rng)
    this.echo = new PingPong(sampleRate)
    this.chorus = new Chorus(sampleRate, rng)
    this.wow = new WowFlutter(sampleRate, rng)
    this.sat = new Saturator()
    this.limiter = new Limiter(sampleRate)
    this.ducker = new Ducker(sampleRate)
    this.tiltL = new Svf(sampleRate)
    this.tiltR = new Svf(sampleRate)
    this.lowCutL = new Svf(sampleRate)
    this.lowCutR = new Svf(sampleRate)

    for (const id of DEFAULT_RACK) this.rack.add(id)
    this.applyPatch()
    this.barLength = barLengthSamples(this.patch.compose.tempo, sampleRate)
    this.loadBar(0)
  }

  setMacros(m: Macros): void {
    this.targetMacros = { ...m }
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
    this.currentMacros = { ...m }
    this.patch = buildPatch(m)
    this.applyPatch()
  }

  private applyPatch(): void {
    const p = this.patch
    this.reverb.set(p.reverb.size, p.reverb.decay, p.reverb.damping, p.reverb.preDelay, p.reverb.width)
    this.echo.set(p.echo.time, p.echo.feedback, p.echo.mix, p.echo.tone)
    this.chorus.set(p.master.chorusDepth, p.master.chorusMix)
    this.wow.set(p.master.wow, p.master.flutter)
    this.sat.set(p.master.drive)
    this.ducker.setAmount(p.master.duckAmount)
    this.ducker.setRelease(p.master.duckRelease)
    this.tiltL.set(p.master.tilt, 0.6)
    this.tiltR.set(p.master.tilt, 0.6)
    this.lowCutL.set(p.master.lowCut, 0.5)
    this.lowCutR.set(p.master.lowCut, 0.5)
  }

  private glideMacros(): void {
    const t = 0.06
    let moved = false
    const cur = this.currentMacros
    const tgt = this.targetMacros
    const keys: (keyof Macros)[] = ['warmth', 'colour', 'space', 'pulse', 'density', 'drift']
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i]
      const d = tgt[k] - cur[k]
      if (Math.abs(d) > 1e-4) {
        cur[k] += d * t
        moved = true
      } else if (cur[k] !== tgt[k]) {
        cur[k] = tgt[k]
        moved = true
      }
    }
    if (moved) {
      this.patch = buildPatch(cur)
      this.applyPatch()
    }
  }

  private harmonicContext(): HarmonicContext {
    const s = this.patch.compose
    return {
      chord: this.harmony.at(Math.floor(this.bar / s.chordBars), s),
      mode: s.mode,
      rootMidi: s.rootMidi,
    }
  }

  private loadBar(bar: number): void {
    this.bar = bar
    const s = this.patch.compose
    this.pending = this.rack.bar(bar, this.harmonicContext(), s.tempo, s.swing, s.humanise)
    this.pendingIndex = 0
    this.samplesIntoBar = 0
    this.barLength = barLengthSamples(s.tempo, this.sampleRate)
  }

  /**
   * Control-rate pass: glide the macros, run every instrument's automation and
   * inference, then dispatch any events falling inside this block.
   */
  private control(): void {
    this.glideMacros()
    const dt = (this.position - this.lastControlPosition) / this.sampleRate
    this.lastControlPosition = this.position
    this.rack.control(this.patch.expression, {
      bars: this.bar + this.samplesIntoBar / this.barLength,
      dt: dt > 0 ? dt : CONTROL_BLOCK / this.sampleRate,
      kick: this.lastKick,
      level: this.lastRms,
    })
    this.lastKick *= 0.86

    const blockEnd = this.samplesIntoBar + CONTROL_BLOCK
    while (this.pendingIndex < this.pending.length && this.pending[this.pendingIndex].offset < blockEnd) {
      const kick = this.rack.fire(this.pending[this.pendingIndex], this.patch.compose.referenceHz)
      if (kick > 0) {
        this.ducker.trigger(kick)
        this.lastKick = kick
      }
      this.pendingIndex++
    }
  }

  render(left: Float32Array, right: Float32Array, frames: number): void {
    let done = 0
    while (done < frames) {
      // All control work happens on an absolute grid, and no block straddles a
      // bar line. Both matter: if control work followed the *caller's* buffer
      // boundaries, then a render in 0.4 s playback chunks would dispatch notes
      // at different instants than the same music rendered in 2 s capture
      // slices, and the export would quietly diverge from what was played. The
      // seam between playback and export is only honest if the engine cannot
      // tell how it is being asked for audio.
      if (this.position % CONTROL_BLOCK === 0) this.control()

      const toGrid = CONTROL_BLOCK - (this.position % CONTROL_BLOCK)
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

      const duck = this.ducker.process()
      let l = ducked[0] * duck
      let r = ducked[1] * duck

      ch[0] = 0
      ch[1] = 0
      this.chorus.process((l + r) * 0.5, ch)
      l = l * (1 - chMix) + ch[0] * chMix
      r = r * (1 - chMix) + ch[1] * chMix

      l += clean[0]
      r += clean[1]

      // One shared room. Most of why a rack of independent instruments sounds
      // like a single recording rather than several.
      this.echo.process(l * echoMix, r * echoMix, ec)
      l += ec[0] * echoMix
      r += ec[1] * echoMix
      this.reverb.process(l, r, rv)
      l = l * (1 - rvMix * 0.45) + rv[0] * rvMix
      r = r * (1 - rvMix * 0.45) + rv[1] * rvMix

      l = this.wow.process(l)
      r = this.wow.process(r)
      l = this.sat.process(l)
      r = this.sat.process(r)
      l = this.tiltL.lowpass(l)
      r = this.tiltR.lowpass(r)
      l = this.lowCutL.highpass(l)
      r = this.lowCutR.highpass(r)
      this.limiter.process(l * gain, r * gain, lim)

      left[start + i] = lim[0]
      right[start + i] = lim[1]

      const a = Math.max(Math.abs(lim[0]), Math.abs(lim[1]))
      if (a > this.peak) this.peak = a
      this.rmsAcc += lim[0] * lim[0] + lim[1] * lim[1]
      this.rmsCount += 2
      this.position++
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
      slots: this.rack.states.map((s) => ({
        id: s.id,
        expression: { ...s.expression },
        level: s.level,
      })),
    }
  }

  get patchNow(): Patch {
    return this.patch
  }

  get slotStates(): readonly SlotState[] {
    return this.rack.states
  }
}

