import { Adsr, Decay } from '../dsp/env.ts'
import { Phasor, sineFrom, Lfo } from '../dsp/osc.ts'
import { Svf } from '../dsp/svf.ts'
import { panGains, clamp01, lerp } from '../core/curves.ts'
import { midiToHz } from '../core/theory.ts'
import type { Rng } from '../core/rng.ts'
import type { Stereo } from './types.ts'

export interface KeysParams {
  /** 0..1 — how much tine bark is in the attack. */
  bite: number
  /** Amp decay in seconds. Long values give the drifting, sustaining kind. */
  decay: number
  release: number
  /** Lowpass cutoff at full velocity, Hz. */
  tone: number
  /** Depth of the amplitude tremolo, 0..1. */
  tremolo: number
  tremoloHz: number
  spread: number
  level: number
}

/**
 * An FM electric piano, the Rhodes recipe: one sine carrier, one sine modulator
 * near unison, and a modulation index that collapses within about a tenth of a
 * second. That collapse is the whole trick — the bark of the hammer on the tine
 * is a burst of high harmonics that dies long before the note does, and no
 * fixed waveform can imitate it.
 */
class KeyVoice {
  private carrier: Phasor
  private modulator: Phasor
  private amp: Adsr
  private modEnv: Decay
  private filter: Svf
  private hz = 440
  private modRatio = 1
  private index = 0
  private velocity = 0
  private panL = 0.7
  private panR = 0.7

  constructor(sampleRate: number) {
    this.carrier = new Phasor(sampleRate)
    this.modulator = new Phasor(sampleRate)
    this.amp = new Adsr(sampleRate)
    this.modEnv = new Decay(sampleRate)
    this.filter = new Svf(sampleRate)
  }

  get active(): boolean {
    return this.amp.active
  }

  start(midi: number, velocity: number, p: KeysParams, referenceHz: number, rng: Rng): void {
    this.hz = midiToHz(midi, referenceHz)
    this.velocity = velocity
    this.carrier.setHz(this.hz)
    // A ratio just off an exact integer keeps the tone from sounding like a
    // pure FM preset; real tines are not perfectly harmonic.
    this.modRatio = lerp(1, 2, clamp01(p.bite)) * (1 + (rng() - 0.5) * 0.006)
    this.modulator.setHz(this.hz * this.modRatio)
    // Higher notes need less index or they scream; lower notes need more or
    // they sound like a plain sine.
    const keyScale = Math.pow(2, (60 - midi) / 24)
    this.index = (0.9 + p.bite * 6.5) * keyScale * (0.35 + velocity * 0.65)
    this.modEnv.set(lerp(0.05, 0.16, clamp01(p.bite)))
    this.modEnv.trigger(1)
    this.amp.set(0.004, p.decay, 0.16, p.release)
    this.amp.gate()
    this.filter.set(p.tone * (0.45 + velocity * 0.55), 0.55)
    const pan = (rng() - 0.5) * 2 * p.spread
    const g = panGains(pan)
    this.panL = g[0]
    this.panR = g[1]
  }

  release(): void {
    this.amp.release()
  }

  process(out: Stereo): void {
    if (!this.amp.active) return
    const mi = this.index * this.modEnv.process()
    const m = sineFrom(this.modulator.step()) * mi
    // Phase-modulate the carrier. Reading the sine at an offset phase is the
    // same thing as FM but without the integrator drift.
    const cp = this.carrier.step() + m
    let s = Math.sin(cp * Math.PI * 2)
    s = this.filter.lowpass(s)
    const a = this.amp.process() * this.velocity
    out[0] += s * a * this.panL
    out[1] += s * a * this.panR
  }
}

export class Keys {
  private voices: KeyVoice[] = []
  private held: { voice: KeyVoice; until: number }[] = []
  private tremolo: Lfo
  private params: KeysParams
  private sample = 0
  private acc: Stereo = [0, 0]

  constructor(
    private readonly sampleRate: number,
    private readonly rng: Rng,
    polyphony = 14,
  ) {
    for (let i = 0; i < polyphony; i++) this.voices.push(new KeyVoice(sampleRate))
    this.tremolo = new Lfo(sampleRate, 4.6, rng())
    this.params = {
      bite: 0.4, decay: 3.2, release: 1.4, tone: 3400,
      tremolo: 0.12, tremoloHz: 4.6, spread: 0.5, level: 0.5,
    }
  }

  set(p: KeysParams): void {
    this.params = p
    this.tremolo.setHz(p.tremoloHz)
  }

  /** `durationSec` schedules the release; ambient notes can ring for bars. */
  noteOn(midi: number, velocity: number, durationSec: number, referenceHz: number): void {
    const voice = this.steal()
    voice.start(midi, velocity, this.params, referenceHz, this.rng)
    this.held.push({ voice, until: this.sample + durationSec * this.sampleRate })
  }

  private steal(): KeyVoice {
    for (let i = 0; i < this.voices.length; i++) {
      if (!this.voices[i].active) return this.voices[i]
    }
    // All busy: take the oldest held note, which is the quietest by now.
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
    // Voices accumulate into one reused frame: allocating a pair per sample
    // would mean 48000 short-lived arrays a second per instrument.
    const acc = this.acc
    acc[0] = 0
    acc[1] = 0
    for (let i = 0; i < this.voices.length; i++) this.voices[i].process(acc)
    const trem = 1 - this.params.tremolo * 0.5 * (1 + this.tremolo.process())
    const g = this.params.level * trem
    out[0] += acc[0] * g
    out[1] += acc[1] * g
  }
}
