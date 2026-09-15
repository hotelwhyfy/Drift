import { Decay } from '../dsp/env.ts'
import { Phasor, sineFrom } from '../dsp/osc.ts'
import { Svf, DcBlock } from '../dsp/svf.ts'
import { Noise } from '../dsp/noise.ts'
import { panGains, clamp01, lerp } from '../core/curves.ts'
import type { Rng } from '../core/rng.ts'
import type { Stereo } from './types.ts'

export type DrumHit = 'kick' | 'snare' | 'hat' | 'openHat' | 'rim'

export interface DrumParams {
  /** 0..1 — lowpass on the whole kit. Low values give the dusty sampled feel. */
  tone: number
  /** 0..1 — how far the kick's pitch envelope falls. */
  kickWeight: number
  snareBody: number
  /** 0..1 — swing amount is applied by the composer, not here. */
  level: number
  hatLevel: number
  snareLevel: number
  kickLevel: number
}

/**
 * A synthesised kit rather than samples, so it can be swept continuously by a
 * macro. Every piece is a decaying envelope over either a pitch-swept sine or
 * filtered noise — which is, in fact, all an acoustic drum is: a body resonance
 * and a burst of air.
 */
export class Drums {
  private kickPhase: Phasor
  private kickAmp: Decay
  private kickPitch: Decay
  private kickClick: Decay
  private kickDc = new DcBlock()

  private snareAmp: Decay
  private snareBodyAmp: Decay
  private snarePhaseA: Phasor
  private snarePhaseB: Phasor
  private snareFilter: Svf

  private hatAmp: Decay
  private hatFilter: Svf
  private hatPan = 0.12

  private rimAmp: Decay
  private rimPhase: Phasor
  private rimFilter: Svf

  private busFilterL: Svf
  private busFilterR: Svf
  private noise: Noise
  private params: DrumParams
  /** Level of the last kick, for the sidechain duck to read. */
  kickTrigger = 0

  constructor(sampleRate: number, rng: Rng) {
    this.kickPhase = new Phasor(sampleRate)
    this.kickAmp = new Decay(sampleRate)
    this.kickPitch = new Decay(sampleRate)
    this.kickClick = new Decay(sampleRate)
    this.snareAmp = new Decay(sampleRate)
    this.snareBodyAmp = new Decay(sampleRate)
    this.snarePhaseA = new Phasor(sampleRate)
    this.snarePhaseB = new Phasor(sampleRate)
    this.snareFilter = new Svf(sampleRate)
    this.hatAmp = new Decay(sampleRate)
    this.hatFilter = new Svf(sampleRate)
    this.rimAmp = new Decay(sampleRate)
    this.rimPhase = new Phasor(sampleRate)
    this.rimFilter = new Svf(sampleRate)
    this.busFilterL = new Svf(sampleRate)
    this.busFilterR = new Svf(sampleRate)
    this.noise = new Noise(rng)
    this.params = {
      tone: 0.5, kickWeight: 0.6, snareBody: 0.4, level: 0.5,
      hatLevel: 0.5, snareLevel: 0.6, kickLevel: 1,
    }
    this.snarePhaseA.setHz(182)
    this.snarePhaseB.setHz(331)
    this.rimPhase.setHz(410)
  }

  set(p: DrumParams): void {
    this.params = p
  }

  hit(kind: DrumHit, velocity: number): void {
    switch (kind) {
      case 'kick':
        this.kickAmp.set(lerp(0.16, 0.62, clamp01(this.params.kickWeight)))
        this.kickPitch.set(0.055)
        this.kickClick.set(0.004)
        this.kickAmp.trigger(velocity)
        this.kickPitch.trigger(1)
        this.kickClick.trigger(velocity)
        this.kickPhase.phase = 0
        this.kickTrigger = velocity
        break
      case 'snare':
        this.snareAmp.set(lerp(0.09, 0.26, this.params.snareBody))
        this.snareBodyAmp.set(0.1)
        this.snareAmp.trigger(velocity)
        this.snareBodyAmp.trigger(velocity)
        break
      case 'rim':
        this.rimAmp.set(0.042)
        this.rimAmp.trigger(velocity)
        this.rimPhase.phase = 0
        break
      case 'hat':
        this.hatAmp.set(0.036)
        this.hatAmp.trigger(velocity)
        break
      case 'openHat':
        this.hatAmp.set(0.28)
        this.hatAmp.trigger(velocity)
        break
    }
  }

  process(out: Stereo): void {
    const p = this.params
    let l = 0
    let r = 0

    if (this.kickAmp.active) {
      // 52 Hz base, swept up by nearly two octaves at the transient. Without
      // the sweep it is a sine blip; with it, it is a drum.
      const sweep = this.kickPitch.process()
      this.kickPhase.setHz(lerp(48, 62, p.kickWeight) * (1 + sweep * sweep * 2.6))
      const body = sineFrom(this.kickPhase.step())
      const click = this.noise.white() * this.kickClick.process() * 0.35
      const s = this.kickDc.process(Math.tanh((body + click) * 1.35)) *
        this.kickAmp.process() * p.kickLevel
      l += s
      r += s
    }

    if (this.snareAmp.active || this.snareBodyAmp.active) {
      this.snareFilter.set(lerp(900, 2600, p.tone), 0.9)
      const n = this.snareFilter.bandpass(this.noise.white()) * this.snareAmp.process()
      const bodyEnv = this.snareBodyAmp.process() * p.snareBody
      const body =
        (sineFrom(this.snarePhaseA.step()) + sineFrom(this.snarePhaseB.step()) * 0.6) * bodyEnv * 0.4
      const s = (n * 0.8 + body) * p.snareLevel
      l += s * 0.98
      r += s
    }

    if (this.rimAmp.active) {
      this.rimFilter.set(1750, 3.2)
      const e = this.rimAmp.process()
      const s = (this.rimFilter.bandpass(this.noise.white()) * 0.6 +
        sineFrom(this.rimPhase.step()) * 0.5) * e * p.snareLevel * 0.8
      l += s
      r += s * 0.9
    }

    if (this.hatAmp.active) {
      this.hatFilter.set(lerp(5200, 9500, p.tone), 1.1)
      const s = this.hatFilter.highpass(this.noise.white()) * this.hatAmp.process() * p.hatLevel * 0.45
      const g = panGains(this.hatPan)
      l += s * g[0]
      r += s * g[1]
    }

    // One lowpass across the kit is the "sampled off a record" move: it glues
    // the pieces into a single recorded object rather than four synth voices.
    const cut = lerp(1400, 15000, clamp01(p.tone) ** 1.4)
    this.busFilterL.set(cut, 0.6)
    this.busFilterR.set(cut, 0.6)
    out[0] += this.busFilterL.lowpass(l) * p.level
    out[1] += this.busFilterR.lowpass(r) * p.level
  }
}
