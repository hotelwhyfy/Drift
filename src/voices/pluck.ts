import { Adsr, Decay } from '../dsp/env.ts'
import { Phasor, sawFrom, squareFrom } from '../dsp/osc.ts'
import { Svf } from '../dsp/svf.ts'
import { panGains, clamp01, lerp } from '../core/curves.ts'
import { midiToHz } from '../core/theory.ts'
import type { Rng } from '../core/rng.ts'
import type { Stereo } from '../core/types.ts'

export interface PluckParams {
  /** 0..1 — saw at 0, square at 1. */
  shape: number
  /** Resting lowpass cutoff, Hz. */
  cutoff: number
  /** How far the filter opens at the attack, as a multiple of `cutoff`. */
  envAmt: number
  /** Seconds for both the filter's pluck and the amp to fall. */
  decay: number
  /** Filter Q. */
  resonance: number
  spread: number
  level: number
}

/**
 * The classic synth arp note: two oscillators a few cents apart into a lowpass
 * that snaps open at the attack and closes again. The filter's fall is the
 * pluck — the amp only follows it down to a low sustain, so a long gate
 * lingers rather than stopping dead.
 */
class PluckVoice {
  private a: Phasor
  private b: Phasor
  private amp: Adsr
  private filterEnv: Decay
  private filter: Svf
  private midi = -1
  private detune = 1
  private velocity = 0
  private shape = 0
  private cutoff = 1000
  private envAmt = 0
  private resonance = 0.7
  private panL = 0.7
  private panR = 0.7

  constructor(sampleRate: number) {
    this.a = new Phasor(sampleRate)
    this.b = new Phasor(sampleRate)
    this.amp = new Adsr(sampleRate)
    this.filterEnv = new Decay(sampleRate)
    this.filter = new Svf(sampleRate)
  }

  get active(): boolean {
    return this.amp.active
  }

  retune(referenceHz: number): void {
    if (this.midi < 0) return
    const hz = midiToHz(this.midi, referenceHz)
    this.a.setHz(hz)
    this.b.setHz(hz * this.detune)
  }

  start(midi: number, velocity: number, p: PluckParams, referenceHz: number, rng: Rng): void {
    this.midi = midi
    this.velocity = velocity
    this.detune = 1 + 0.004 + rng() * 0.003
    this.retune(referenceHz)
    this.shape = clamp01(p.shape)
    // Higher notes get a proportionally higher filter, so the top of the arp
    // is not duller than the bottom.
    this.cutoff = p.cutoff * Math.pow(2, (midi - 66) / 24)
    this.envAmt = p.envAmt * (0.4 + velocity * 0.6)
    this.resonance = p.resonance
    this.filterEnv.set(p.decay * 0.6)
    this.filterEnv.trigger(1)
    this.amp.set(0.002, p.decay, 0.12, Math.max(0.05, p.decay * 0.5))
    this.amp.gate()
    const g = panGains((rng() - 0.5) * 2 * p.spread)
    this.panL = g[0]
    this.panR = g[1]
  }

  release(): void {
    this.amp.release()
  }

  process(out: Stereo): void {
    if (!this.amp.active) return
    const pa = this.a.step()
    const pb = this.b.step()
    const ia = this.a.increment
    const ib = this.b.increment
    const saw = sawFrom(pa, ia) + sawFrom(pb, ib)
    const square = squareFrom(pa, ia) + squareFrom(pb, ib)
    const raw = lerp(saw, square, this.shape) * 0.5
    this.filter.set(this.cutoff * (1 + this.envAmt * this.filterEnv.process()), this.resonance)
    const s = this.filter.lowpass(raw)
    const amp = this.amp.process() * this.velocity
    out[0] += s * amp * this.panL
    out[1] += s * amp * this.panR
  }
}

export class Pluck {
  private voices: PluckVoice[] = []
  private held: { voice: PluckVoice; until: number }[] = []
  private params: PluckParams
  private sample = 0
  private acc: Stereo = [0, 0]

  constructor(
    private readonly sampleRate: number,
    private readonly rng: Rng,
    polyphony = 8,
  ) {
    for (let i = 0; i < polyphony; i++) this.voices.push(new PluckVoice(sampleRate))
    this.params = {
      shape: 0.3, cutoff: 900, envAmt: 4, decay: 0.3, resonance: 1.2, spread: 0.4, level: 0.5,
    }
  }

  set(p: PluckParams): void {
    this.params = p
  }

  retune(referenceHz: number): void {
    for (let i = 0; i < this.voices.length; i++) this.voices[i].retune(referenceHz)
  }

  noteOn(midi: number, velocity: number, durationSec: number, referenceHz: number): void {
    const voice = this.steal()
    voice.start(midi, velocity, this.params, referenceHz, this.rng)
    this.held.push({ voice, until: this.sample + durationSec * this.sampleRate })
  }

  private steal(): PluckVoice {
    for (let i = 0; i < this.voices.length; i++) {
      if (!this.voices[i].active) return this.voices[i]
    }
    const oldest = this.held.shift()
    if (oldest) return oldest.voice
    return this.voices[0]
  }

  process(out: Stereo): void {
    this.sample++
    for (let i = this.held.length - 1; i >= 0; i--) {
      if (this.sample >= this.held[i].until) {
        this.held[i].voice.release()
        this.held.splice(i, 1)
      }
    }
    const acc = this.acc
    acc[0] = 0
    acc[1] = 0
    for (let i = 0; i < this.voices.length; i++) this.voices[i].process(acc)
    out[0] += acc[0] * this.params.level
    out[1] += acc[1] * this.params.level
  }
}
