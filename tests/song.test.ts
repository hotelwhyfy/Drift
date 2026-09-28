import { describe, it, expect } from 'vitest'
import { Engine } from '../src/engine/engine.ts'
import type { ScheduledEvent } from '../src/engine/rack.ts'
import { sampleEnvelope } from '../src/song/sampleEnvelope.ts'
import { macrosAt } from '../src/song/macrosAt.ts'
import { songFrames } from '../src/song/songFrames.ts'
import { DEFAULT_SONG } from '../src/song/song.ts'
import type { Song, Breakpoint } from '../src/song/song.ts'
import { DEFAULT_MACROS } from '../src/macros/macros.ts'

const SR = 24000

const pt = (bar: number, value: number, shape: Breakpoint['shape'] = 'linear'): Breakpoint => ({ bar, value, shape })

/** A song that moves the tempo and the timbre, so bar lengths vary. */
const moving: Song = {
  ...DEFAULT_SONG,
  lengthBars: 12,
  macros: {
    pulse: { enabled: true, envelope: { points: [pt(0, 0), pt(6, 1, 'smooth'), pt(12, 0.2)] } },
    warmth: { enabled: true, envelope: { points: [pt(0, 0.9), pt(3, 0.1, 'step'), pt(8, 0.6)] } },
    drift: { enabled: true, envelope: { points: [pt(0, 0.1), pt(12, 0.95)] } },
  },
}

function engineFor(song: Song, seed = 3): Engine {
  const e = new Engine(SR, DEFAULT_MACROS, seed)
  e.setSong(song)
  e.snapMacros(DEFAULT_MACROS)
  // Start clean against the song: bar 0 was scheduled before it was set.
  e.seek(0)
  return e
}

function finishBar(e: Engine): void {
  const start = e.snapshot().bar
  const l = new Float32Array(512)
  const r = new Float32Array(512)
  while (e.snapshot().bar === start) e.render(l, r, l.length)
}

function barsOfEvents(e: Engine, count: number): ScheduledEvent[][] {
  const out: ScheduledEvent[][] = []
  for (let i = 0; i < count; i++) {
    out.push(e.barEvents.map((ev) => ({ ...ev })))
    finishBar(e)
  }
  return out
}

describe('envelopes', () => {
  const env = { points: [pt(2, 0.2), pt(4, 1, 'smooth'), pt(8, 0, 'step'), pt(10, 0.5)] }

  it('holds its ends', () => {
    expect(sampleEnvelope(env, -5)).toBe(0.2)
    expect(sampleEnvelope(env, 0)).toBe(0.2)
    expect(sampleEnvelope(env, 10)).toBe(0.5)
    expect(sampleEnvelope(env, 400)).toBe(0.5)
    expect(sampleEnvelope({ points: [] }, 3)).toBe(0.5)
    expect(sampleEnvelope({ points: [pt(5, 0.7)] }, 0)).toBe(0.7)
  })

  it('shapes each segment by the point that starts it', () => {
    expect(sampleEnvelope(env, 3)).toBeCloseTo(0.6, 6) // linear
    expect(sampleEnvelope(env, 6)).toBeCloseTo(0.5, 6) // smooth, midpoint
    // Smooth eases out of the point: a quarter of the way along it has moved
    // less than a quarter of the distance.
    expect(sampleEnvelope(env, 5)).toBeGreaterThan(0.75)
    expect(sampleEnvelope(env, 5)).toBeLessThan(1)
    expect(sampleEnvelope(env, 9.9)).toBe(0) // step holds until the next point
  })

  it('reads a long envelope quickly', () => {
    const points = Array.from({ length: 5000 }, (_, i) => pt(i * 2, (i % 7) / 7))
    const long = { points }
    let sum = 0
    const t0 = performance.now()
    for (let i = 0; i < 200_000; i++) sum += sampleEnvelope(long, (i * 0.05) % 10_000)
    expect(performance.now() - t0).toBeLessThan(500)
    expect(sum).toBeGreaterThan(0)
  })
})

describe('the song', () => {
  it('drives only the dials it has enabled tracks for', () => {
    const song: Song = {
      ...DEFAULT_SONG,
      macros: {
        space: { enabled: true, envelope: { points: [pt(0, 1)] } },
        colour: { enabled: false, envelope: { points: [pt(0, 0)] } },
      },
    }
    const { macros, driven } = macrosAt(song, DEFAULT_MACROS, 5)
    expect(driven).toEqual(['space'])
    expect(macros.space).toBe(1)
    expect(macros.colour).toBe(DEFAULT_MACROS.colour)
  })

  it('is indifferent to buffer sizes while the song moves', () => {
    const frames = SR * 4
    const whole = new Float32Array(frames)
    engineFor(moving).render(whole, new Float32Array(frames), frames)

    const e = engineFor(moving)
    const pieces = new Float32Array(frames)
    const sizes = [1, 333, 4096, 77, 9000]
    for (let done = 0, i = 0; done < frames; i++) {
      const n = Math.min(sizes[i % sizes.length], frames - done)
      e.render(pieces.subarray(done, done + n), new Float32Array(n), n)
      done += n
    }
    expect(Array.from(pieces)).toEqual(Array.from(whole))
  })

  it('schedules the same bars whether played to or seeked to, as the tempo changes', () => {
    const N = 5
    const played = engineFor(moving)
    for (let i = 0; i < N; i++) finishBar(played)
    const seeked = engineFor(moving)
    seeked.seek(N)
    expect(seeked.snapshot().tempo).toBeCloseTo(played.snapshot().tempo, 6)
    expect(barsOfEvents(seeked, 4)).toEqual(barsOfEvents(played, 4))
  })

  it('knows exactly how long it is', () => {
    const song: Song = { ...moving, end: 'stop' }
    const frames = songFrames(song, DEFAULT_MACROS, SR)
    const e = engineFor(song)
    e.render(new Float32Array(frames - 1), new Float32Array(frames - 1), frames - 1)
    expect(e.snapshot().bar).toBe(song.lengthBars - 1)
    expect(e.snapshot().ended).toBe(false)
    e.render(new Float32Array(1), new Float32Array(1), 1)
    expect(e.snapshot().bar).toBe(song.lengthBars)
    expect(e.snapshot().ended).toBe(true)
    expect(e.barEvents).toEqual([])
  })

  it('plays the same music on every pass of a loop', () => {
    const song: Song = { ...moving, lengthBars: 3, end: 'loop' }
    const e = engineFor(song)
    const first = barsOfEvents(e, 3)
    expect(e.snapshot().bar).toBe(0)
    const second = barsOfEvents(e, 3)
    expect(second).toEqual(first)
  })

  it('carries on past the end of a held song with the last values', () => {
    const song: Song = { ...moving, lengthBars: 2, end: 'hold' }
    const e = engineFor(song)
    for (let i = 0; i < 3; i++) finishBar(e)
    const s = e.snapshot()
    expect(s.bar).toBe(3)
    expect(s.ended).toBe(false)
    // The drift track runs to bar 12, but the song ends at 2: it holds there.
    const drift = moving.macros.drift
    if (!drift) throw new Error('expected a drift track')
    expect(s.macros.drift).toBeCloseTo(sampleEnvelope(drift.envelope, 2), 6)
    expect(e.barEvents.length).toBeGreaterThan(0)
  })
})
