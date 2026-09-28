/// <reference lib="webworker" />
import { Engine } from '../engine/engine.ts'
import type { ToWorker, FromWorker } from './messages.ts'
import { songFrames } from '../song/songFrames.ts'
import type { Song } from '../song/song.ts'

/** How long a song capture keeps rendering after the last bar, for the tails. */
const SONG_TAIL_SECONDS = 8

/**
 * The engine lives here, off the main thread.
 *
 * Rendering ahead into a queue rather than inside an AudioWorklet is a
 * deliberate trade: a worklet has a hard 128-frame deadline, and this patch can
 * have forty voices plus an eight-line reverb running through it. Missing that
 * deadline is a click. Here a slow block just eats into the lookahead, which
 * nobody hears — and the same call renders a capture faster than real time.
 */
let engine: Engine | null = null
let sampleRate = 48000

const post = (m: FromWorker, transfer: Transferable[] = []): void => {
  ;(self as unknown as Worker).postMessage(m, transfer)
}

self.onmessage = (e: MessageEvent<ToWorker>): void => {
  const msg = e.data
  switch (msg.type) {
    case 'init':
      sampleRate = msg.sampleRate
      engine = new Engine(sampleRate, msg.macros, msg.seed)
      engine.snapMacros(msg.macros)
      break

    case 'macros':
      engine?.setMacros(msg.macros)
      break

    case 'rack':
      // Reconciled rather than rebuilt, so changing a level or drawing a curve
      // never interrupts a sounding voice.
      engine?.rack.sync(msg.slots)
      break

    case 'song':
      engine?.setSong(msg.song)
      break

    case 'seek':
      // One bar is rendered silently first, so the pads and the room are
      // already sounding when the jump is heard rather than fading up from
      // nothing.
      engine?.seek(msg.bar, { preroll: 1 })
      break

    case 'reseed':
      // Re-rolled in place: the music changes from the next bar, the reverb
      // tail and the sounding notes carry across, and the bar count keeps
      // counting. Rebuilding the engine here would just be a restart.
      engine?.reseed(msg.seed)
      break

    case 'render': {
      if (!engine) return
      const left = new Float32Array(msg.frames)
      const right = new Float32Array(msg.frames)
      engine.render(left, right, msg.frames)
      post(
        { type: 'chunk', id: msg.id, epoch: msg.epoch, left, right, snapshot: engine.snapshot() },
        [left.buffer, right.buffer],
      )
      break
    }

    case 'capture': {
      // A separate engine, so capturing never disturbs what is playing.
      const capture = new Engine(sampleRate, msg.macros, msg.seed)
      // A song capture plays the song once and then lets it ring out: forced
      // to stop, whatever the song's own ending, so nothing new starts in the
      // tail.
      const song: Song = msg.mode === 'song' ? { ...msg.song, end: 'stop' } : msg.song
      capture.setSong(song)
      capture.snapMacros(msg.macros)
      capture.rack.sync(msg.slots)
      // From the top, against the rack and song it was just given — exactly
      // what pressing play at bar one does.
      capture.seek(0)
      const frames = msg.mode === 'song'
        ? songFrames(song, msg.macros, sampleRate) + Math.floor(SONG_TAIL_SECONDS * sampleRate)
        : Math.floor(msg.seconds * sampleRate)
      const left = new Float32Array(frames)
      const right = new Float32Array(frames)
      // Rendered in slices so progress can be reported; the engine is
      // indifferent to where the boundaries fall.
      const slice = Math.floor(sampleRate * 2)
      let done = 0
      while (done < frames) {
        const n = Math.min(slice, frames - done)
        capture.render(left.subarray(done, done + n), right.subarray(done, done + n), n)
        done += n
        post({ type: 'captureProgress', id: msg.id, progress: done / frames })
      }
      applyFades(left, right, sampleRate, msg.mode === 'song' ? SONG_TAIL_SECONDS * 0.6 : 4)
      post({ type: 'capture', id: msg.id, left, right, sampleRate }, [left.buffer, right.buffer])
      break
    }
  }
}

/**
 * Endless music has no ending, so a capture has to be given one. A long fade
 * out and a short fade in: starting abruptly is fine because the first thing
 * heard is an attack, but stopping abruptly on a reverb tail is not.
 */
function applyFades(left: Float32Array, right: Float32Array, sr: number, outSeconds: number): void {
  const inFrames = Math.min(Math.floor(sr * 0.35), left.length)
  const outFrames = Math.min(Math.floor(sr * outSeconds), left.length)
  for (let i = 0; i < inFrames; i++) {
    const g = i / inFrames
    left[i] *= g
    right[i] *= g
  }
  const start = left.length - outFrames
  for (let i = 0; i < outFrames; i++) {
    // Equal-power rather than linear, so the tail does not appear to duck in
    // the middle of the fade.
    const g = Math.cos((i / outFrames) * Math.PI * 0.5)
    left[start + i] *= g
    right[start + i] *= g
  }
}
