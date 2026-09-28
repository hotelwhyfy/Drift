import { Decay } from '../dsp/env.ts'
import { Phasor, sineFrom } from '../dsp/osc.ts'
import { Svf, DcBlock } from '../dsp/svf.ts'
import { Noise } from '../dsp/noise.ts'
import { clamp, clamp01, lerp } from '../core/curves.ts'
import type { Rng } from '../core/rng.ts'
import type { Stereo } from './types.ts'

export type DrumHit = 'kick' | 'snare' | 'hat' | 'openHat' | 'rim'

export interface DrumParams {
  /** 0..1 — lowpass on the whole kit. Low values give the dusty sampled feel. */
  tone: number
  level: number

  /** Resting pitch of the kick's body, Hz. */
  kickPitch: number
  /** Seconds. */
  kickDecay: number
  /** 0..1 — how far the pitch sweeps at the attack, and how much click. */
  kickPunch: number
  kickLevel: number
  kickPan: number

  /** Pitch of the lower body tone, Hz; the upper one sits a ratio above. */
  snarePitch: number
  /** Seconds, for the noise; the body rings a little shorter. */
  snareDecay: number
  /** 0..1 — body tone against the wires. */
  snareBody: number
  snareLevel: number
  snarePan: number

  rimPitch: number
  rimDecay: number
  rimLevel: number
  rimPan: number

  /** Multiplier on the hats' filter frequency. */
  hatPitch: number
  hatDecay: number
  hatLevel: number
  hatPan: number
  openHatDecay: number
  openHatLevel: number
  openHatPan: number
}

export const DEFAULT_DRUM_PARAMS: DrumParams = {
  tone: 0.5, level: 0.5,
  kickPitch: 55, kickDecay: 0.4, kickPunch: 0.6, kickLevel: 1, kickPan: 0,
  snarePitch: 182, snareDecay: 0.17, snareBody: 0.4, snareLevel: 0.6, snarePan: 0,
  rimPitch: 410, rimDecay: 0.042, rimLevel: 0.48, rimPan: 0,
  hatPitch: 1, hatDecay: 0.036, hatLevel: 0.5, hatPan: 0.12,
  openHatDecay: 0.28, openHatLevel: 0.45, openHatPan: -0.2,
}

/** Equal-power gains for a pan, written into a pair rather than allocated. */
function setPan(pan: number, into: Float64Array): void {
  const p = (clamp(pan, -1, 1) + 1) * 0.25 * Math.PI
  into[0] = Math.cos(p)
  into[1] = Math.sin(p)
}

/**
 * A synthesised kit rather than samples, so every piece can be swept
 * continuously — by a macro, a knob or a lane. Each is a decaying envelope over
 * either a pitch-swept sine or filtered noise, which is, in fact, all an
 * acoustic drum is: a body resonance and a burst of air.
 *
 * Every piece has its own pitch, length, level and place in the field. The open
 * hat has its own envelope and filter, and a closed hat chokes it, the way a
 * hi-hat pedal does.
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
  private openAmp: Decay
  private openFilter: Svf

  private rimAmp: Decay
  private rimPhase: Phasor
  private rimFilter: Svf

  private busFilterL: Svf
  private busFilterR: Svf
  private noise: Noise
  private params: DrumParams = DEFAULT_DRUM_PARAMS
  private readonly nyquistSafe: number

  private kickGain = new Float64Array(2)
  private snareGain = new Float64Array(2)
  private rimGain = new Float64Array(2)
  private hatGain = new Float64Array(2)
  private openGain = new Float64Array(2)

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
    this.openAmp = new Decay(sampleRate)
    this.openFilter = new Svf(sampleRate)
    this.rimAmp = new Decay(sampleRate)
    this.rimPhase = new Phasor(sampleRate)
    this.rimFilter = new Svf(sampleRate)
    this.busFilterL = new Svf(sampleRate)
    this.busFilterR = new Svf(sampleRate)
    this.noise = new Noise(rng)
    this.nyquistSafe = sampleRate * 0.45
    this.set(DEFAULT_DRUM_PARAMS)
  }

  set(p: DrumParams): void {
    const old = this.params
    this.params = p
    if (p.kickPan !== old.kickPan || this.kickGain[0] === 0) setPan(p.kickPan, this.kickGain)
    if (p.snarePan !== old.snarePan || this.snareGain[0] === 0) setPan(p.snarePan, this.snareGain)
    if (p.rimPan !== old.rimPan || this.rimGain[0] === 0) setPan(p.rimPan, this.rimGain)
    if (p.hatPan !== old.hatPan || this.hatGain[0] === 0) setPan(p.hatPan, this.hatGain)
    if (p.openHatPan !== old.openHatPan || this.openGain[0] === 0) setPan(p.openHatPan, this.openGain)
  }

  hit(kind: DrumHit, velocity: number): void {
    const p = this.params
    switch (kind) {
      case 'kick':
        this.kickAmp.set(p.kickDecay)
        this.kickPitch.set(0.055)
        this.kickClick.set(0.004)
        this.kickAmp.trigger(velocity)
        this.kickPitch.trigger(1)
        this.kickClick.trigger(velocity * lerp(0.3, 1.2, clamp01(p.kickPunch)))
        this.kickPhase.phase = 0
        break
      case 'snare':
        this.snareAmp.set(p.snareDecay)
        this.snareBodyAmp.set(p.snareDecay * 0.6)
        this.snarePhaseA.setHz(p.snarePitch)
        this.snarePhaseB.setHz(p.snarePitch * 1.82)
        this.snareAmp.trigger(velocity)
        this.snareBodyAmp.trigger(velocity)
        break
      case 'rim':
        this.rimAmp.set(p.rimDecay)
        this.rimPhase.setHz(p.rimPitch)
        this.rimAmp.trigger(velocity)
        this.rimPhase.phase = 0
        break
      case 'hat':
        this.hatAmp.set(p.hatDecay)
        this.hatAmp.trigger(velocity)
        // The pedal closes: an open hat still ringing is cut short.
        this.openAmp.set(0.012)
        break
      case 'openHat':
        this.openAmp.set(p.openHatDecay)
        this.openAmp.trigger(velocity)
        break
    }
  }

  process(out: Stereo): void {
    const p = this.params
    let l = 0
    let r = 0

    if (this.kickAmp.active) {
      // Swept up by up to two octaves at the transient. Without the sweep it
      // is a sine blip; with it, it is a drum.
      const sweep = this.kickPitch.process()
      this.kickPhase.setHz(p.kickPitch * (1 + sweep * sweep * lerp(0.8, 4, clamp01(p.kickPunch))))
      const body = sineFrom(this.kickPhase.step())
      const click = this.noise.white() * this.kickClick.process() * 0.35
      const s = this.kickDc.process(Math.tanh((body + click) * 1.35)) *
        this.kickAmp.process() * p.kickLevel
      l += s * this.kickGain[0]
      r += s * this.kickGain[1]
    }

    if (this.snareAmp.active || this.snareBodyAmp.active) {
      this.snareFilter.set(lerp(900, 2600, p.tone), 0.9)
      const n = this.snareFilter.bandpass(this.noise.white()) * this.snareAmp.process()
      const bodyEnv = this.snareBodyAmp.process() * p.snareBody
      const body =
        (sineFrom(this.snarePhaseA.step()) + sineFrom(this.snarePhaseB.step()) * 0.6) * bodyEnv * 0.4
      const s = (n * 0.8 + body) * p.snareLevel
      l += s * this.snareGain[0]
      r += s * this.snareGain[1]
    }

    if (this.rimAmp.active) {
      this.rimFilter.set(Math.min(this.nyquistSafe, p.rimPitch * 4.27), 3.2)
      const e = this.rimAmp.process()
      const s = (this.rimFilter.bandpass(this.noise.white()) * 0.6 +
        sineFrom(this.rimPhase.step()) * 0.5) * e * p.rimLevel * 0.8
      l += s * this.rimGain[0]
      r += s * this.rimGain[1]
    }

    const hatHz = Math.min(this.nyquistSafe, lerp(5200, 9500, p.tone) * p.hatPitch)
    if (this.hatAmp.active) {
      this.hatFilter.set(hatHz, 1.1)
      const s = this.hatFilter.highpass(this.noise.white()) * this.hatAmp.process() * p.hatLevel * 0.45
      l += s * this.hatGain[0]
      r += s * this.hatGain[1]
    }

    if (this.openAmp.active) {
      // A little lower and looser than the closed hat: more of the cymbal's
      // wash, less of the tick.
      this.openFilter.set(hatHz * 0.88, 0.8)
      const s = this.openFilter.highpass(this.noise.white()) * this.openAmp.process() * p.openHatLevel * 0.4
      l += s * this.openGain[0]
      r += s * this.openGain[1]
    }

    // One lowpass across the kit is the "sampled off a record" move: it glues
    // the pieces into a single recorded object rather than five synth voices.
    const cut = lerp(1400, 15000, clamp01(p.tone) ** 1.4)
    this.busFilterL.set(cut, 0.6)
    this.busFilterR.set(cut, 0.6)
    out[0] += this.busFilterL.lowpass(l) * p.level
    out[1] += this.busFilterR.lowpass(r) * p.level
  }
}
