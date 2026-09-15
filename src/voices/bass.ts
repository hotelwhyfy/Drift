import { Adsr } from '../dsp/env.ts'
import { Phasor, sineFrom, Triangle } from '../dsp/osc.ts'
import { Svf, DcBlock } from '../dsp/svf.ts'
import { midiToHz } from '../core/theory.ts'
import { clamp01, lerp } from '../core/curves.ts'
import type { Stereo } from './types.ts'

export interface BassParams {
  decay: number
  release: number
  cutoff: number
  /** 0..1 — blends a triangle over the sine so the note reads on small speakers. */
  harmonics: number
  drive: number
  level: number
}

/**
 * Monophonic sub bass, centred in the stereo field.
 *
 * Mono and centred on purpose: anything below about 120 Hz that differs between
 * the channels cancels when the mix is folded down, which is what happens on a
 * phone speaker and on vinyl. Ambient music gets played on small speakers.
 */
export class Bass {
  private phasor: Phasor
  private triPhasor: Phasor
  private tri = new Triangle()
  private amp: Adsr
  private filter: Svf
  private dc = new DcBlock()
  private params: BassParams
  private hz = 55
  private velocity = 0
  private glideTarget = 55
  private glideCoef: number

  constructor(sampleRate: number) {
    this.phasor = new Phasor(sampleRate)
    this.triPhasor = new Phasor(sampleRate)
    this.amp = new Adsr(sampleRate)
    this.filter = new Svf(sampleRate)
    this.glideCoef = Math.exp(-1 / (0.045 * sampleRate))
    this.params = { decay: 1.4, release: 0.5, cutoff: 320, harmonics: 0.3, drive: 1.2, level: 0.5 }
  }

  set(p: BassParams): void {
    this.params = p
  }

  noteOn(midi: number, velocity: number, referenceHz: number): void {
    this.glideTarget = midiToHz(midi, referenceHz)
    // A short portamento between roots is the classic lo-fi bass gesture and
    // also hides the click a hard pitch jump would make on a sustaining sine.
    if (!this.amp.active) this.hz = this.glideTarget
    this.velocity = velocity
    this.amp.set(0.012, this.params.decay, 0.55, this.params.release)
    this.amp.gate()
  }

  noteOff(): void {
    this.amp.release()
  }

  process(out: Stereo): void {
    if (!this.amp.active) return
    this.hz = this.glideTarget + this.glideCoef * (this.hz - this.glideTarget)
    this.phasor.setHz(this.hz)
    this.triPhasor.setHz(this.hz)
    const sine = sineFrom(this.phasor.step())
    const tp = this.triPhasor.step()
    const tri = this.tri.process(tp, this.triPhasor.increment)
    let s = lerp(sine, sine * 0.7 + tri * 0.6, clamp01(this.params.harmonics))
    s = Math.tanh(s * this.params.drive) / Math.tanh(this.params.drive)
    this.filter.set(this.params.cutoff, 0.7)
    s = this.dc.process(this.filter.lowpass(s))
    const a = this.amp.process() * this.velocity * this.params.level
    out[0] += s * a
    out[1] += s * a
  }
}
