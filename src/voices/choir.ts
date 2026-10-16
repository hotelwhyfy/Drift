import { Adsr } from '../dsp/env.ts'
import { Phasor, sawFrom } from '../dsp/osc.ts'
import { Svf } from '../dsp/svf.ts'
import { Noise, SmoothRandom } from '../dsp/noise.ts'
import { panGains, clamp01, lerp } from '../core/curves.ts'
import { midiToHz } from '../core/theory.ts'
import type { Rng } from '../core/rng.ts'
import type { Stereo } from '../core/types.ts'

export interface ChoirParams {
  attack: number
  release: number
  /** 0..1 — the vowel, walking oo, oh, ah, eh: closed and dark to open and bright. */
  vowel: number
  /** 0..1 — how far each singer's vowel wanders from the section's. */
  vowelDrift: number
  /** Vibrato depth in cents, once it has arrived. */
  vibrato: number
  /** 0..1 — air in the voice. */
  breath: number
  /** 0..1 — how far the singers on one note disagree in pitch. */
  ensemble: number
  /** 0..1 — how far the notes spread across the field. */
  width: number
  level: number
}

const UNISON = 3
const DETUNE = [-1, 0.15, 0.9] as const
const FORMANTS = 3
/** Samples between formant updates. The vowel moves over seconds; a tan() per sample per filter buys nothing. */
const FORMANT_EVERY = 64

/**
 * Formant frequencies (Hz) and levels for each vowel, in the order the vowel
 * parameter walks them. Rounded averages for an untrained voice in the middle
 * of its range — a choir, not a soloist.
 */
const VOWELS: readonly { readonly hz: readonly number[]; readonly gain: readonly number[] }[] = [
  { hz: [320, 800, 2500], gain: [1, 0.35, 0.08] }, // oo
  { hz: [450, 830, 2600], gain: [1, 0.5, 0.12] }, // oh
  { hz: [720, 1100, 2550], gain: [1, 0.55, 0.16] }, // ah
  { hz: [540, 1750, 2500], gain: [1, 0.4, 0.2] }, // eh
]
/** Formant sharpness. Higher formants are narrower in Hz but not in proportion. */
const FORMANT_Q = [5, 7, 9] as const

/**
 * One singer per note — or rather three, slightly apart, the way a section
 * sounds on one pitch. A buzz (detuned saws and a little breath) through three
 * resonances that place the vowel.
 *
 * The voice is mono and panned afterwards, so one set of formant filters is
 * enough; it is the section that is wide, not each singer.
 */
class ChoirVoice {
  private phasors: Phasor[] = []
  private formants: Svf[] = []
  private formantGain = new Float64Array(FORMANTS)
  private amp: Adsr
  private drift: SmoothRandom
  private pitchDrift: SmoothRandom
  private hz = 220
  private age = 0
  private velocity = 0
  private vibPhase = 0
  private vibHz = 5
  private panL = 0.7
  private panR = 0.7
  midi = -1

  constructor(private readonly sampleRate: number, rng: Rng) {
    for (let i = 0; i < UNISON; i++) this.phasors.push(new Phasor(sampleRate, rng()))
    for (let f = 0; f < FORMANTS; f++) this.formants.push(new Svf(sampleRate))
    this.amp = new Adsr(sampleRate)
    // Stepped once per formant update rather than per sample, so its rate is
    // scaled up to wander at about 0.07 Hz in real time.
    this.drift = new SmoothRandom(sampleRate, rng, 0.07 * FORMANT_EVERY)
    this.pitchDrift = new SmoothRandom(sampleRate, rng, 0.25)
  }

  get active(): boolean {
    return this.amp.active
  }

  get held(): boolean {
    return this.amp.gated
  }

  retune(referenceHz: number): void {
    if (this.midi >= 0) this.hz = midiToHz(this.midi, referenceHz)
  }

  start(midi: number, velocity: number, p: ChoirParams, referenceHz: number, rng: Rng): void {
    this.midi = midi
    this.hz = midiToHz(midi, referenceHz)
    this.velocity = velocity
    this.age = 0
    this.vibPhase = rng()
    this.vibHz = lerp(4.6, 5.6, rng())
    this.amp.set(p.attack, p.attack, 0.85, p.release)
    this.amp.gate()
    const g = panGains((rng() - 0.5) * 2 * p.width)
    this.panL = g[0]
    this.panR = g[1]
    this.shapeVowel(p)
  }

  release(): void {
    this.amp.release()
  }

  /** Place the three formants for where this singer's vowel is now. */
  private shapeVowel(p: ChoirParams): void {
    const v = clamp01(p.vowel + this.drift.process() * p.vowelDrift * 0.35) * (VOWELS.length - 1)
    const i = Math.min(VOWELS.length - 2, Math.floor(v))
    const t = v - i
    const a = VOWELS[i]
    const b = VOWELS[i + 1]
    for (let f = 0; f < FORMANTS; f++) {
      // Formants glide in log frequency, as a mouth changing shape does.
      const hz = a.hz[f] * Math.pow(b.hz[f] / a.hz[f], t)
      this.formants[f].set(hz, FORMANT_Q[f])
      // The bandpass peaks at Q; dividing it out leaves the vowel's own levels.
      this.formantGain[f] = lerp(a.gain[f], b.gain[f], t) / FORMANT_Q[f]
    }
  }

  process(out: Stereo, p: ChoirParams, breath: number): void {
    if (!this.amp.active) return
    this.age++
    if (this.age % FORMANT_EVERY === 0) this.shapeVowel(p)
    const settle = clamp01((this.age / this.sampleRate - 0.6) / 1.5)
    this.vibPhase += this.vibHz / this.sampleRate
    if (this.vibPhase >= 1) this.vibPhase -= 1
    const vib = Math.sin(this.vibPhase * 2 * Math.PI) * p.vibrato * settle + this.pitchDrift.process() * 4
    const cents = lerp(4, 20, clamp01(p.ensemble))
    let s = 0
    for (let i = 0; i < UNISON; i++) {
      const ph = this.phasors[i]
      ph.setHz(this.hz * (1 + (DETUNE[i] * cents + vib) * 0.000578))
      s += sawFrom(ph.step(), ph.increment)
    }
    s = s * (1 - p.breath * 0.5) / UNISON + breath
    let v = 0
    for (let f = 0; f < FORMANTS; f++) v += this.formants[f].bandpass(s) * this.formantGain[f]
    const a = this.amp.process() * this.velocity
    out[0] += v * a * this.panL
    out[1] += v * a * this.panR
  }
}

export class Choir {
  private voices: ChoirVoice[] = []
  private held: { voice: ChoirVoice; until: number }[] = []
  private params: ChoirParams
  private noise: Noise
  private sample = 0
  private acc: Stereo = [0, 0]

  constructor(private readonly sampleRate: number, private readonly rng: Rng, polyphony = 8) {
    for (let i = 0; i < polyphony; i++) this.voices.push(new ChoirVoice(sampleRate, rng))
    this.noise = new Noise(rng)
    this.params = {
      attack: 2, release: 3, vowel: 0.3, vowelDrift: 0.4, vibrato: 10,
      breath: 0.2, ensemble: 0.5, width: 0.7, level: 0.25,
    }
  }

  set(p: ChoirParams): void {
    this.params = p
  }

  retune(referenceHz: number): void {
    for (let i = 0; i < this.voices.length; i++) this.voices[i].retune(referenceHz)
  }

  noteOn(midi: number, velocity: number, durationSec: number, referenceHz: number): void {
    const until = this.sample + durationSec * this.sampleRate
    // Singers holding a note through the bar line keep holding it; a choir
    // that breathes on every downbeat is counting, not singing.
    for (let i = 0; i < this.held.length; i++) {
      const h = this.held[i]
      if (h.voice.midi === midi && h.voice.held) {
        h.until = Math.max(h.until, until)
        return
      }
    }
    const voice = this.voices.find((v) => !v.active) ?? this.held.shift()?.voice ?? this.voices[0]
    voice.start(midi, velocity, this.params, referenceHz, this.rng)
    this.held.push({ voice, until })
  }

  process(out: Stereo): void {
    this.sample++
    for (let i = this.held.length - 1; i >= 0; i--) {
      if (this.sample >= this.held[i].until) {
        this.held[i].voice.release()
        this.held.splice(i, 1)
      }
    }
    // One breath shared by the section: it is air in the room more than in
    // any one throat, and a noise source per voice would cost for nothing.
    const breath = this.noise.white() * this.params.breath * 0.8
    const acc = this.acc
    acc[0] = 0
    acc[1] = 0
    for (let i = 0; i < this.voices.length; i++) this.voices[i].process(acc, this.params, breath)
    out[0] += acc[0] * this.params.level
    out[1] += acc[1] * this.params.level
  }
}
