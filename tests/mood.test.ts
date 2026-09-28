import { describe, it, expect } from 'vitest'
import { interpret, restingPlace } from '../src/mood/interpret.ts'
import { arrangementFor, macrosFor, rackFor } from '../src/mood/arrange.ts'
import { Journey, journeyEase, blendMacros } from '../src/mood/journey.ts'
import { PROMPTS } from '../src/mood/prompts.ts'
import { MOOD_WORDS, MOOD_PHRASES } from '../src/mood/moodLexicon.ts'
import { Engine } from '../src/engine/engine.ts'
import { MACRO_KEYS } from '../src/macros/macros.ts'

describe('reading an answer', () => {
  it('hears intensity, diminishment and negation', () => {
    const plain = interpret('tired')
    const lots = interpret('very tired')
    const little = interpret('a bit tired')
    const not = interpret('not tired')

    expect(lots.arousal).toBeLessThanOrEqual(plain.arousal)
    expect(lots.expression.weight).toBeGreaterThan(plain.expression.weight)
    expect(little.expression.weight).toBeLessThan(plain.expression.weight)
    // Negation reflects through neutral rather than merely damping.
    expect(not.expression.motion).toBeGreaterThan(plain.expression.motion)
    expect(not.valence).toBeGreaterThan(plain.valence)
  })

  it('leans on what follows a "but"', () => {
    // The commonest shape of an honest answer is a complaint with a
    // qualification. A plain average would land between them and describe
    // neither.
    const both = interpret('tired but hopeful')
    const tired = interpret('tired')
    const hopeful = interpret('hopeful')
    const midpoint = (tired.valence + hopeful.valence) / 2
    expect(both.valence).toBeGreaterThan(midpoint)
    expect(both.valence).toBeLessThan(hopeful.valence)
  })

  it('reads phrases that do not mean the sum of their words', () => {
    const tooMuch = interpret('too much')
    const notMuch = interpret('not much')
    expect(tooMuch.expression.density).toBeGreaterThan(0.75)
    expect(tooMuch.arousal).toBeGreaterThan(0.7)
    expect(notMuch.expression.density).toBeLessThan(0.3)
    expect(notMuch.arousal).toBeLessThan(0.3)
  })

  it('forgives typos', () => {
    expect(interpret('exausted').heard).toEqual(['exausted'])
    expect(interpret('exausted').expression.weight)
      .toBeCloseTo(interpret('exhausted').expression.weight, 1)
  })

  it('still makes something of an answer it does not understand', () => {
    // Refusing, or falling back to a fixed default, would make the question
    // feel like a quiz with right answers.
    const nonsense = interpret('qwertyuiop zxcvb')
    expect(nonsense.conviction).toBe(0)
    expect(Number.isFinite(nonsense.seed)).toBe(true)
    expect(interpret('qwertyuiop zxcvb').seed).toBe(nonsense.seed)
    expect(interpret('qwertyuiop zxcvc').seed).not.toBe(nonsense.seed)
  })

  it('makes the exact words the seed', () => {
    expect(interpret('tired').seed).toBe(interpret('  Tired  ').seed)
    expect(interpret('tired').seed).not.toBe(interpret('tired today').seed)
  })

  it('rates a shrug as less convinced than a statement', () => {
    expect(interpret('meh').conviction).toBeLessThan(interpret('completely exhausted').conviction)
  })
})

describe('where it takes you', () => {
  const agitated = ['anxious', 'angry', 'panicky', 'too much', 'stressed out', 'wired']
  const settled = ['content', 'calm', 'peaceful', 'grateful']

  it.each(agitated)('moves %s toward calm', (answer) => {
    const reading = interpret(answer)
    const rest = restingPlace(reading)
    expect(rest.tension).toBeLessThan(reading.expression.tension)
    expect(rest.motion).toBeLessThan(reading.expression.motion)
  })

  it.each(settled)('leaves %s roughly where it is', (answer) => {
    const reading = interpret(answer)
    const rest = restingPlace(reading)
    // Someone who says they are content does not need to be taken anywhere.
    expect(Math.abs(rest.tension - reading.expression.tension)).toBeLessThan(0.25)
  })

  it('never ends somewhere more agitated than it began', () => {
    for (const word of Object.keys(MOOD_WORDS)) {
      const reading = interpret(word)
      const rest = restingPlace(reading)
      expect(rest.tension).toBeLessThanOrEqual(reading.expression.tension + 1e-9)
      expect(rest.motion).toBeLessThanOrEqual(reading.expression.motion + 1e-9)
    }
  })

  it('takes longer when there is further to go', () => {
    expect(arrangementFor(interpret('panicky')).minutes)
      .toBeGreaterThan(arrangementFor(interpret('calm')).minutes)
  })
})

describe('the arrangement', () => {
  it('gives an exhausted answer no drum kit', () => {
    // The loudest decision this feature makes. A kit here has not listened,
    // however quiet it is.
    for (const answer of ['exhausted', 'drained', 'numb', 'wiped out', 'very tired']) {
      const ids = rackFor(interpret(answer)).map((s) => s.defId)
      expect(ids).not.toContain('kit')
    }
  })

  it('gives an activated answer one', () => {
    for (const answer of ['wired', 'excited', 'angry', 'energised']) {
      expect(rackFor(interpret(answer)).map((s) => s.defId)).toContain('kit')
    }
  })

  it('always leaves something holding the harmony and the room', () => {
    for (const word of Object.keys(MOOD_WORDS)) {
      const ids = rackFor(interpret(word)).map((s) => s.defId)
      expect(ids).toContain('pad')
      expect(ids).toContain('bed')
    }
  })

  it('keeps every dial in range for every word and phrase it knows', () => {
    const answers = [...Object.keys(MOOD_WORDS), ...Object.keys(MOOD_PHRASES)]
    for (const answer of answers) {
      const macros = macrosFor(interpret(answer))
      for (const key of MACRO_KEYS) {
        expect(macros[key]).toBeGreaterThanOrEqual(0)
        expect(macros[key]).toBeLessThanOrEqual(1)
      }
    }
  })

  it('never loops a drawn curve — automation here must not repeat', () => {
    // A loop would carry the music back to where it started every few minutes,
    // which is the opposite of a journey.
    for (const word of ['anxious', 'tired', 'content', 'angry']) {
      for (const slot of rackFor(interpret(word))) {
        for (const lane of slot.lanes) {
          expect(lane.source.kind).not.toBe('curve')
        }
      }
    }
  })

  it('offers only answers it can actually read', () => {
    // Every one-tap offer must land somewhere deliberate, or the shortcut is
    // worse than typing.
    for (const prompt of PROMPTS) {
      for (const offer of prompt.offers) {
        expect(interpret(offer).conviction).toBeGreaterThan(0.15)
      }
    }
  })
})

describe('the journey', () => {
  it('holds at the start before moving', () => {
    // Arriving and immediately being moved somewhere else reads as not having
    // been heard.
    expect(journeyEase(0)).toBe(0)
    expect(journeyEase(0.1)).toBe(0)
    expect(journeyEase(0.5)).toBeGreaterThan(0)
    expect(journeyEase(1)).toBeCloseTo(1, 5)
  })

  it('never goes backwards', () => {
    let previous = -1
    for (let i = 0; i <= 50; i++) {
      const v = journeyEase(i / 50)
      expect(v).toBeGreaterThanOrEqual(previous)
      previous = v
    }
  })

  it('arrives at the destination and stops steering', () => {
    const plan = arrangementFor(interpret('anxious'))
    const journey = new Journey(plan.macros, plan.resting, 10)
    journey.start(0)
    expect(journey.at(0).macros.pulse).toBeCloseTo(plan.macros.pulse, 5)
    const end = journey.at(10 * 60_000)
    expect(end.arrived).toBe(true)
    for (const key of MACRO_KEYS) {
      expect(end.macros[key]).toBeCloseTo(plan.resting[key], 4)
    }
  })

  it('stops the moment someone takes the controls', () => {
    const plan = arrangementFor(interpret('anxious'))
    const journey = new Journey(plan.macros, plan.resting, 10)
    journey.start(0)
    expect(journey.isSteering).toBe(true)
    journey.release()
    expect(journey.isSteering).toBe(false)
    // And stays released — it must not resume behind their back.
    expect(journey.at(5 * 60_000).macros).toEqual(plan.macros)
  })

  it('blends every dial, not just the ones that moved', () => {
    const from = blendMacros(
      { warmth: 0, colour: 0, space: 0, pulse: 0, density: 0, drift: 0 },
      { warmth: 1, colour: 1, space: 1, pulse: 1, density: 1, drift: 1 },
      1,
    )
    for (const key of MACRO_KEYS) expect(from[key]).toBeCloseTo(1, 5)
  })
})

describe('what it actually sounds like', () => {
  const SR = 24000
  it.each(['exhausted', 'anxious and wired', 'content', 'too much', 'nothing much'])(
    'renders %s as usable audio',
    (answer) => {
      const plan = arrangementFor(interpret(answer))
      const engine = new Engine(SR, plan.macros, plan.seed)
      engine.snapMacros(plan.macros)
      engine.rack.sync(plan.slots)
      const frames = SR * 3
      const left = new Float32Array(frames)
      const right = new Float32Array(frames)
      engine.render(left, right, frames)

      let peak = 0
      let energy = 0
      for (let i = 0; i < frames; i++) {
        expect(Number.isFinite(left[i])).toBe(true)
        peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]))
        energy += left[i] * left[i] + right[i] * right[i]
      }
      expect(peak).toBeLessThanOrEqual(0.8913)
      expect(Math.sqrt(energy / (frames * 2))).toBeGreaterThan(0.01)
    },
  )
})
