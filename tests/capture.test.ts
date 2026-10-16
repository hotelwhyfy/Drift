import { describe, it, expect } from 'vitest'
import { captureWav } from '@/audio/captureWav.ts'
import { wavHeader } from '@/audio/wav.ts'
import type { CaptureRequest } from '@/audio/captureWav.ts'
import { Engine } from '@/engine/engine.ts'
import { songFrames } from '@/song/songFrames.ts'
import type { Song } from '@/song/types.ts'
import { DEFAULT_MACROS } from '@/macros/macros.ts'
import { DEFAULT_SONG } from '@/song/song.ts'
import { generateDrift } from '@/generate/generateDrift.ts'
import { deriveSeed } from '@/core/rng.ts'

const SR = 48000

/**
 * The capture as it was before it streamed: the whole render held in memory,
 * faded, then encoded in one pass. Kept here verbatim so the streaming path is
 * held to producing exactly the same file.
 */
function legacyCapture(r: CaptureRequest): Uint8Array {
  const engine = new Engine(r.sampleRate, r.macros, r.seed)
  const song: Song = r.mode === 'song' ? { ...r.song, end: 'stop' } : r.song
  engine.setSong(song)
  engine.snapMacros(r.macros)
  engine.rack.sync(r.slots)
  engine.seek(0)
  const frames = r.mode === 'song'
    ? songFrames(song, r.macros, r.sampleRate) + Math.floor(8 * r.sampleRate)
    : Math.floor(r.seconds * r.sampleRate)
  const left = new Float32Array(frames)
  const right = new Float32Array(frames)
  const slice = Math.floor(r.sampleRate * 2)
  for (let done = 0; done < frames; done += slice) {
    const n = Math.min(slice, frames - done)
    engine.render(left.subarray(done, done + n), right.subarray(done, done + n), n)
  }
  const inFrames = Math.min(Math.floor(r.sampleRate * 0.35), frames)
  const outFrames = Math.min(Math.floor(r.sampleRate * (r.mode === 'song' ? 8 * 0.6 : 4)), frames)
  for (let i = 0; i < inFrames; i++) {
    left[i] *= i / inFrames
    right[i] *= i / inFrames
  }
  const start = frames - outFrames
  for (let i = 0; i < outFrames; i++) {
    const g = Math.cos((i / outFrames) * Math.PI * 0.5)
    left[start + i] *= g
    right[start + i] *= g
  }
  const out = new DataView(new ArrayBuffer(frames * 4))
  let dither = 0
  for (let i = 0; i < frames; i++) {
    dither = (dither * 1103515245 + 12345) & 0x7fffffff
    const d1 = (dither / 0x7fffffff - 0.5) / 32768
    dither = (dither * 1103515245 + 12345) & 0x7fffffff
    const d2 = (dither / 0x7fffffff - 0.5) / 32768
    out.setInt16(i * 4, Math.round(Math.max(-1, Math.min(1, left[i] + d1 + d2)) * 32767), true)
    out.setInt16(i * 4 + 2, Math.round(Math.max(-1, Math.min(1, right[i] + d1 + d2)) * 32767), true)
  }
  return new Uint8Array(out.buffer)
}

/** The pieces a capture emits, joined back into one file. */
function capture(request: CaptureRequest, onProgress?: (p: number) => void): { wav: ArrayBuffer, pieces: number } {
  const pieces: Uint8Array[] = []
  captureWav(request, (bytes) => pieces.push(bytes), onProgress)
  const out = new Uint8Array(pieces.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of pieces) {
    out.set(p, at)
    at += p.length
  }
  return { wav: out.buffer, pieces: pieces.length }
}

function samplesOf(wav: ArrayBuffer): Uint8Array {
  return new Uint8Array(wav, 44)
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

const base: CaptureRequest = {
  mode: 'minutes', seconds: 5, sampleRate: SR, macros: DEFAULT_MACROS, seed: 7, slots: [], song: DEFAULT_SONG,
}

describe('captureWav', () => {
  it('writes exactly what the whole-buffer capture did', () => {
    const { wav, pieces } = capture(base)
    // A header and three slices: streamed, not built whole.
    expect(pieces).toBe(4)
    expect(sameBytes(samplesOf(wav), legacyCapture(base))).toBe(true)
  })

  it('does so for a song capture with a generated rack, across several slices', () => {
    const drift = generateDrift('amber-moss-42')
    const request: CaptureRequest = {
      ...base, mode: 'song', seed: deriveSeed('amber-moss-42'), macros: drift.macros, slots: drift.slots,
      song: { ...drift.song, lengthBars: 2 },
    }
    expect(sameBytes(samplesOf(capture(request).wav), legacyCapture(request))).toBe(true)
  }, 20_000)

  it('does so when the fade in and fade out overlap', () => {
    const request: CaptureRequest = { ...base, seconds: 0.3 }
    expect(sameBytes(samplesOf(capture(request).wav), legacyCapture(request))).toBe(true)
  })

  it('writes a header that agrees with its length, and reports progress to the end', () => {
    const progress: number[] = []
    const { wav } = capture({ ...base, seconds: 5 }, (p) => progress.push(p))
    const view = new DataView(wav)
    expect(view.getUint32(40, true)).toBe(5 * SR * 4)
    expect(view.getUint32(4, true)).toBe(wav.byteLength - 8)
    expect(progress.at(-1)).toBe(1)
  })

  it('refuses a length a WAV header cannot describe, rather than writing a corrupt one', () => {
    const sixHours = 6 * 3600 * SR
    expect(() => wavHeader(sixHours, SR)).not.toThrow()
    expect(() => wavHeader(sixHours * 1.1, SR)).toThrow(/Too long/)
  })
})
