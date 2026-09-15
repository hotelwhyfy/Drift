import type { InstrumentDef, InstrumentVoice } from '../instruments/types.ts'
import { instrumentById } from '../instruments/registry.ts'
import { FuzzyEngine } from '../fuzzy/inference.ts'
import type { Expression } from '../fuzzy/expression.ts'
import { EXPRESSION_KEYS, NEUTRAL, clampExpression } from '../fuzzy/expression.ts'
import { LaneEvaluator } from '../automation/lane.ts'
import type { Lane, LaneContext } from '../automation/lane.ts'
import { Resolver } from '../harmony/resolver.ts'
import type { HarmonicContext, Role } from '../harmony/resolver.ts'
import { createRng, deriveSeed, rngAt, centred } from '../core/rng.ts'
import type { Stereo } from '../voices/types.ts'
import type { DrumHit } from '../voices/drums.ts'
import { clamp01 } from '../core/curves.ts'

/**
 * A serialisable description of one slot. The interface owns this; the rack
 * reconciles itself to it.
 *
 * Mirroring state between a worker and the UI is a reliable source of bugs, so
 * there is only one authority: the UI sends what the rack should be, and the
 * rack works out the difference. Adding an instrument and dragging its level
 * go through the same path, which means there is one path to get right.
 */
export interface SlotDesc {
  readonly id: string
  readonly defId: string
  readonly name: string
  readonly level: number
  readonly muted: boolean
  readonly soloed: boolean
  readonly expression: Expression
  readonly follow: number
  readonly lanes: Lane[]
}

export interface SlotState {
  readonly id: string
  readonly defId: string
  name: string
  level: number
  muted: boolean
  soloed: boolean
  /** The instrument's own expression, before automation. */
  expression: Expression
  /** 0 = entirely its own expression, 1 = entirely the global one. */
  follow: number
  lanes: Lane[]
}

interface Slot extends SlotState {
  readonly def: InstrumentDef
  readonly voice: InstrumentVoice
  readonly fuzzy: FuzzyEngine
  /** Expression after automation, what the rules actually saw. */
  resolved: Expression
  params: Record<string, number>
}

export interface ScheduledEvent {
  /** Samples from the start of the bar. */
  offset: number
  slotId: string
  midi?: number
  hit?: DrumHit
  velocity: number
  durationSec: number
}

/** Resolution order. Low parts claim their pitches before high ones, because
 *  a bass note moved to avoid a bell is a worse outcome than the reverse. */
const ROLE_ORDER: Record<Role, number> = { bass: 0, chordal: 1, melodic: 2, colour: 3 }

/**
 * The rack: every instrument currently in the piece.
 *
 * It owns three things instruments are deliberately not trusted with — pitch
 * (via the shared Resolver), relative level, and the order in which they get to
 * claim notes. That is what makes the set extensible: a new instrument can be
 * written without knowing anything about the others, because the decisions that
 * require knowing about the others are not its to make.
 */
export class Rack {
  private slots: Slot[] = []
  private lanes = new LaneEvaluator()
  private resolver: Resolver
  private counter = 0
  private acc: Stereo = [0, 0]

  constructor(
    private readonly sampleRate: number,
    private seed: number,
  ) {
    this.resolver = new Resolver(deriveSeed(seed, 'resolver'))
  }

  get states(): readonly SlotState[] {
    return this.slots
  }

  /**
   * Re-roll the composition seed. Voices are deliberately left alone: they hold
   * the sounding notes, and rebuilding them would cut the music off — which is
   * exactly what "a new world" should not do.
   */
  setSeed(seed: number): void {
    this.seed = seed
    this.resolver.setSeed(deriveSeed(seed, 'resolver'))
  }

  add(defId: string, at?: number): string | null {
    const def = instrumentById(defId)
    if (!def) return null
    const id = `${defId}-${++this.counter}`
    const slot: Slot = {
      id,
      defId,
      def,
      name: def.name,
      level: 0.8,
      muted: false,
      soloed: false,
      expression: { ...NEUTRAL },
      follow: 1,
      lanes: [],
      voice: def.create(this.sampleRate, createRng(deriveSeed(this.seed, defId, this.counter))),
      fuzzy: new FuzzyEngine(def.rules),
      resolved: { ...NEUTRAL },
      params: {},
    }
    if (at === undefined) this.slots.push(slot)
    else this.slots.splice(at, 0, slot)
    return id
  }

  remove(id: string): void {
    this.slots = this.slots.filter((s) => s.id !== id)
  }

  move(id: string, to: number): void {
    const from = this.slots.findIndex((s) => s.id === id)
    if (from < 0) return
    const [slot] = this.slots.splice(from, 1)
    this.slots.splice(Math.max(0, Math.min(this.slots.length, to)), 0, slot)
  }

  update(id: string, patch: Partial<Pick<SlotState, 'level' | 'muted' | 'soloed' | 'expression' | 'follow' | 'name' | 'lanes'>>): void {
    const slot = this.slots.find((s) => s.id === id)
    if (!slot) return
    Object.assign(slot, patch)
  }

  has(defId: string): boolean {
    return this.slots.some((s) => s.defId === defId)
  }

  /**
   * Reconcile to a description: create what is new, drop what is gone, update
   * the rest, and put them in the given order. Voices for surviving slots are
   * kept, so changing a level never restarts a sound.
   */
  sync(desc: readonly SlotDesc[]): void {
    const wanted = new Set(desc.map((d) => d.id))
    this.slots = this.slots.filter((s) => wanted.has(s.id))
    const byId = new Map(this.slots.map((s) => [s.id, s] as const))

    const next: Slot[] = []
    for (const d of desc) {
      let slot = byId.get(d.id)
      if (!slot) {
        const def = instrumentById(d.defId)
        if (!def) continue
        slot = {
          id: d.id,
          defId: d.defId,
          def,
          name: d.name,
          level: d.level,
          muted: d.muted,
          soloed: d.soloed,
          expression: { ...d.expression },
          follow: d.follow,
          lanes: d.lanes,
          voice: def.create(this.sampleRate, createRng(deriveSeed(this.seed, d.id))),
          fuzzy: new FuzzyEngine(def.rules),
          resolved: { ...d.expression },
          params: {},
        }
      } else {
        slot.name = d.name
        slot.level = d.level
        slot.muted = d.muted
        slot.soloed = d.soloed
        slot.expression = { ...d.expression }
        slot.follow = d.follow
        slot.lanes = d.lanes
      }
      next.push(slot)
    }
    this.slots = next
  }

  /** The current rack as a description, for seeding the interface. */
  describe(): SlotDesc[] {
    return this.slots.map((s) => ({
      id: s.id, defId: s.defId, name: s.name, level: s.level, muted: s.muted,
      soloed: s.soloed, expression: { ...s.expression }, follow: s.follow, lanes: s.lanes,
    }))
  }

  /**
   * Control-rate update: run each slot's automation, blend with the global
   * expression, infer parameters, and push them into the voice.
   */
  control(global: Expression, ctx: LaneContext): void {
    for (const slot of this.slots) {
      // The instrument's own expression, pulled towards the global one by
      // however much it is set to follow. This is how six master dials steer a
      // rack of instruments that each also have their own character.
      const base: Expression = { ...NEUTRAL }
      for (const k of EXPRESSION_KEYS) {
        base[k] = slot.expression[k] + (global[k] - slot.expression[k]) * slot.follow
      }
      // Automation lands on top, so a drawn curve overrides both.
      for (const lane of slot.lanes) {
        if (!lane.enabled || lane.target.kind !== 'expression') continue
        const v = this.lanes.value(lane, ctx)
        const key = lane.target.key
        base[key] = this.lanes.apply(base[key], v, lane)
      }
      slot.resolved = clampExpression(base)
      slot.params = { ...slot.fuzzy.evaluate(slot.resolved) }

      // Parameter-targeted lanes bypass the rules entirely, for when someone
      // wants to move one thing and not the twelve it is normally tied to.
      for (const lane of slot.lanes) {
        if (!lane.enabled || lane.target.kind !== 'param') continue
        const spec = slot.def.rules.outputs[lane.target.param]
        if (!spec) continue
        const v = this.lanes.value(lane, ctx)
        const norm = spec.scale === 'exp'
          ? Math.log(slot.params[lane.target.param] / spec.min) / Math.log(spec.max / spec.min)
          : (slot.params[lane.target.param] - spec.min) / (spec.max - spec.min)
        const next = clamp01(this.lanes.apply(norm, v, lane))
        slot.params[lane.target.param] = spec.scale === 'exp'
          ? spec.min * Math.pow(spec.max / spec.min, next)
          : spec.min + (spec.max - spec.min) * next
      }

      let level = slot.level
      for (const lane of slot.lanes) {
        if (!lane.enabled || lane.target.kind !== 'level') continue
        level = clamp01(this.lanes.apply(level, this.lanes.value(lane, ctx), lane))
      }
      const anySolo = this.slots.some((s) => s.soloed)
      const audible = slot.muted || (anySolo && !slot.soloed) ? 0 : level
      slot.def.apply(slot.voice, slot.params, audible)
    }
  }

  /**
   * Build one bar of events for every instrument, resolving intents to pitches
   * in role order so collisions are settled by musical priority.
   */
  bar(
    bar: number,
    harmonic: HarmonicContext,
    tempo: number,
    swing: number,
    humanise: number,
  ): ScheduledEvent[] {
    this.resolver.beginBar(bar)
    const beatSec = 60 / tempo
    const barSec = beatSec * 4
    const stepSamples = (barSec / 16) * this.sampleRate
    const events: ScheduledEvent[] = []

    const ordered = [...this.slots].sort((a, b) => ROLE_ORDER[a.def.role] - ROLE_ORDER[b.def.role])

    for (const slot of ordered) {
      if (slot.def.continuous) continue
      const rng = rngAt(this.seed, slot.id, bar)
      const jitter = (scale: number): number => centred(rng, humanise * 0.02 * scale) * this.sampleRate
      const at = (step: number, scale = 1): number =>
        Math.max(0, (step + (step % 2 === 1 ? swing * 0.5 : 0)) * stepSamples + jitter(scale))

      const patternCtx = {
        bar, expression: slot.resolved, params: slot.params, rng, tempo,
      }

      if (slot.def.notes) {
        const register = Resolver.registerFor(slot.def.role, harmonic.rootMidi)
        for (const intent of slot.def.notes(patternCtx)) {
          const midi = this.resolver.resolve(intent, harmonic, register, slot.id)
          if (midi === null) continue
          events.push({
            offset: at(intent.step),
            slotId: slot.id,
            midi,
            velocity: intent.weight,
            durationSec: (intent.lengthSteps / 16) * barSec,
          })
        }
      }

      if (slot.def.hits) {
        for (const hit of slot.def.hits(patternCtx)) {
          events.push({
            offset: at(hit.step, 0.6),
            slotId: slot.id,
            hit: hit.kind,
            velocity: hit.velocity,
            durationSec: 0,
          })
        }
      }
    }

    return events.sort((a, b) => a.offset - b.offset)
  }

  fire(event: ScheduledEvent, referenceHz: number): number {
    const slot = this.slots.find((s) => s.id === event.slotId)
    if (!slot) return 0
    if (event.midi !== undefined && slot.voice.noteOn) {
      slot.voice.noteOn(event.midi, event.velocity, event.durationSec, referenceHz)
    } else if (event.hit && slot.voice.hit) {
      slot.voice.hit(event.hit, event.velocity)
      // The kick's level is reported back so the master ducker can use it
      // without the rack knowing what ducking is.
      if (event.hit === 'kick') return event.velocity
    }
    return 0
  }

  /** Sums every instrument. Ducked instruments are marked by role, not by id. */
  process(duckable: Stereo, unducked: Stereo): void {
    for (const slot of this.slots) {
      const acc = this.acc
      acc[0] = 0
      acc[1] = 0
      slot.voice.process(acc)
      // Percussion and surface noise sit outside the sidechain: a kick cannot
      // duck itself, and crackle that pumps on every beat is instantly wrong.
      const target = slot.def.hits || slot.defId === 'dust' ? unducked : duckable
      target[0] += acc[0]
      target[1] += acc[1]
    }
  }

  resetAutomation(): void {
    this.lanes.reset()
  }
}
