import type { InstrumentDef } from '@/instruments/types.ts'
import type { NoteIntent } from '@/harmony/types.ts'
import { beatStrength } from '@/harmony/resolver.ts'
import { Pluck } from '@/voices/pluck.ts'
import { lerp, clamp01 } from '@/core/curves.ts'
import { spread } from '@/instruments/spread.ts'

const ARP_DIRECTIONS = ['Up', 'Down', 'Up-down', 'Random']
const ARP_RATES = ['Quarters', 'Eighths', 'Sixteenths']
const ARP_STRIDES = [4, 2, 1]
const ARP_EVERY = [1, 2, 4, 8]

/** Where step `k` of the arp sits among `n` rising slots, for each direction. */
function arpSlot(direction: number, k: number, n: number, shuffle: readonly number[]): number {
  switch (ARP_DIRECTIONS[direction]) {
    case 'Down':
      return n - 1 - (k % n)
    case 'Up-down': {
      // A ping-pong that does not repeat its ends: 0 1 2 3 2 1 0 1 …
      const cycle = Math.max(1, 2 * n - 2)
      const i = k % cycle
      return i < n ? i : cycle - i
    }
    case 'Random':
      return shuffle[k % n]
    default:
      return k % n
  }
}

export const arp: InstrumentDef = {
  id: 'arp',
  name: 'Arp',
  role: 'chordal',
  blurb: 'A plucked synth that now and then runs up or down the chord, then leaves space.',
  create: (sr, rng) => new Pluck(sr, rng),
  rules: {
    outputs: {
      cutoff: { min: 350, max: 2800, scale: 'exp' },
      envAmt: { min: 1, max: 9, scale: 'exp' },
      decay: { min: 0.12, max: 0.9, scale: 'exp' },
      shape: { min: 0, max: 1 },
      resonance: { min: 0.6, max: 2.6, scale: 'exp' },
      spread: { min: 0.1, max: 0.8 },
      rest: { min: 0, max: 0.5 },
      rate: { min: 0, max: ARP_RATES.length - 0.01 },
      chance: { min: 0.1, max: 0.9 },
      length: { min: 0.2, max: 0.9 },
      wander: { min: 0, max: 0.8 },
    },
    rules: [
      { when: { brightness: 'high' }, then: { cutoff: 'high', envAmt: 'high' } },
      { when: { brightness: 'mid' }, then: { cutoff: 'mid', envAmt: 'mid' } },
      { when: { brightness: 'low' }, then: { cutoff: 'low', envAmt: 'low' } },
      // Weight is body: a heavy arp rings longer and leans to the square.
      { when: { weight: 'high' }, then: { decay: 'high', shape: 'high' } },
      { when: { weight: 'mid' }, then: { decay: 'mid', shape: 'mid' } },
      { when: { weight: 'low' }, then: { decay: 'low', shape: 'low' } },
      { when: { motion: 'high' }, then: { rate: 'high', decay: 'low' } },
      { when: { motion: 'mid' }, then: { rate: 'mid' } },
      { when: { motion: 'low' }, then: { rate: 'low', decay: 'high' } },
      // Density is how much of the time the arp is playing at all: a sparse
      // piece hears an occasional short run, a dense one longer and more often.
      { when: { density: 'high' }, then: { chance: 'high', length: 'high', rest: 'low', spread: 'high' } },
      { when: { density: 'mid' }, then: { chance: 'mid', length: 'mid', rest: 'mid', spread: 'mid' } },
      { when: { density: 'low' }, then: { chance: 'low', length: 'low', rest: 'high', spread: 'low' } },
      // Tension unsettles the walk: runs start anywhere and turn back.
      { when: { tension: 'high' }, then: { resonance: 'high', envAmt: 'high', wander: 'high' } },
      { when: { tension: 'mid' }, then: { resonance: 'mid', wander: 'mid' } },
      { when: { tension: 'low' }, then: { resonance: 'low', wander: 'low' } },
    ],
  },
  fixed: {
    direction: { min: 0, max: ARP_DIRECTIONS.length - 0.01, default: 0.5 / ARP_DIRECTIONS.length },
    octaves: { min: 1, max: 3, default: 0.5 },
    gate: { min: 0.2, max: 1.5, default: 0.5 },
    register: { min: -12, max: 12, default: 0.5 },
    every: { min: 0, max: ARP_EVERY.length - 0.01, default: 1.5 / ARP_EVERY.length },
    swell: { min: 0, max: 1, default: 0.6 },
  },
  // The bottom of the arp sits just above the middle of the pad and the range
  // grows upwards, so more octaves climb into the air rather than into the
  // pad, whose notes would otherwise push the arp's out of order.
  register: (p, base) => {
    const octaves = Math.round(p.octaves ?? 1)
    const bottom = base.centre + 6 + Math.round(p.register ?? 0)
    return { centre: bottom + 6 * octaves, span: 6 * octaves }
  },
  apply: (voice, p, level) => {
    if (voice instanceof Pluck) {
      voice.set({
        shape: p.shape, cutoff: p.cutoff, envAmt: p.envAmt, decay: p.decay,
        resonance: p.resonance, spread: p.spread, level: level * 0.5,
      })
    }
  },
  notes: (ctx) => {
    const stride = ARP_STRIDES[Math.floor(ctx.params.rate ?? 1)] ?? 2
    const octaves = Math.round(ctx.params.octaves ?? 1)
    const rest = clamp01(ctx.params.rest ?? 0.2)
    const gate = ctx.params.gate ?? 0.85
    const wander = clamp01(ctx.params.wander ?? 0.3)
    const swell = clamp01(ctx.params.swell ?? 0.6)

    // An arp that never stops is a ringtone. Time is cut into windows of a
    // few bars, and each window may hold one run, somewhere inside it. The
    // window, not the bar, owns that decision, so the run is the same one
    // whichever of its bars playback starts on.
    const bars = ARP_EVERY[Math.floor(ctx.params.every ?? 1)] ?? 2
    const window = Math.floor(ctx.bar / bars)
    const run = ctx.phraseRng('run', bars, window)
    // Every value is drawn whether or not it is used, so turning one knob
    // never reshuffles the decisions the others lead to.
    // Spread rather than flipped, so a run is followed by a rest more often
    // than independent coins would manage; the rate is still `chance`.
    const plays = spread(ctx.phraseRng('spread-phase')(), window, run()) < clamp01(ctx.params.chance ?? 0.5)
    const startRoll = run()
    const turnRoll = run()
    const turnTo = Math.floor(run() * ARP_DIRECTIONS.length)
    const offsetRoll = run()
    if (!plays) return []

    const total = bars * 16
    const count = Math.max(3, Math.min(total / stride, Math.round((clamp01(ctx.params.length ?? 0.5) * total) / stride)))
    const start = Math.floor(startRoll * (total / stride - count + 1)) * stride
    const direction = turnRoll < wander * 0.6 ? turnTo : Math.floor(ctx.params.direction ?? 0)

    // About a chord tone per slot: the resolver snaps each to the nearest one.
    const n = 3 * octaves + 1
    // A calm run starts at the bottom of its direction; a wandering one
    // anywhere in it.
    const offset = Math.floor(offsetRoll * n * wander)
    const shuffle = Array.from({ length: n }, (_, i) => i)
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(run() * (i + 1))
      const t = shuffle[i]
      shuffle[i] = shuffle[j]
      shuffle[j] = t
    }

    const out: NoteIntent[] = []
    const barStart = (ctx.bar - window * bars) * 16
    for (let step = 0; step < 16; step += stride) {
      const skip = ctx.rng() < rest
      const slip = ctx.rng()
      const i = (barStart + step - start) / stride
      if (i < 0 || i >= count || skip) continue
      let slot = arpSlot(direction, i + offset, n, shuffle)
      // Wandering also lets a note slip a slot either way, so a run is not a
      // perfect staircase.
      if (slip < wander * 0.25) slot = Math.max(0, Math.min(n - 1, slot + (slip < wander * 0.125 ? -1 : 1)))
      // The run fades in and away rather than starting and stopping like a
      // sequencer being switched on.
      const arc = lerp(1, Math.sin((Math.PI * (i + 0.5)) / count), swell)
      out.push({
        role: 'chordal',
        contour: -1 + (2 * slot) / (n - 1),
        weight: Math.max(0.12, lerp(0.5, 0.95, beatStrength(step)) * arc),
        step,
        lengthSteps: stride * gate,
      })
    }
    return out
  },
  controls: [
    { param: 'chance', label: 'Chance', group: 'runs' },
    { param: 'every', label: 'Every', group: 'runs', options: ARP_EVERY.map((n) => (n === 1 ? '1 bar' : `${n} bars`)) },
    { param: 'length', label: 'Length', group: 'runs' },
    { param: 'swell', label: 'Swell', group: 'runs' },
    { param: 'wander', label: 'Wander', group: 'runs' },
    { param: 'rate', label: 'Rate', group: 'pattern', options: ARP_RATES },
    { param: 'direction', label: 'Direction', group: 'pattern', options: ARP_DIRECTIONS },
    { param: 'octaves', label: 'Octaves', group: 'pattern' },
    { param: 'gate', label: 'Gate', group: 'pattern' },
    { param: 'rest', label: 'Rests', group: 'pattern' },
    { param: 'register', label: 'Register', group: 'pattern' },
    { param: 'cutoff', label: 'Cutoff', group: 'sound' },
    { param: 'envAmt', label: 'Pluck', group: 'sound' },
    { param: 'resonance', label: 'Reso', group: 'sound' },
    { param: 'decay', label: 'Decay', group: 'sound' },
    { param: 'shape', label: 'Shape', group: 'sound' },
    { param: 'spread', label: 'Width', group: 'sound' },
  ],
}
