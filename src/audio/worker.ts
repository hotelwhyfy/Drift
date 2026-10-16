/// <reference lib="webworker" />
import { Engine } from '@/engine/engine.ts'
import type { ToWorker, FromWorker } from '@/audio/messages.ts'
import { captureWav } from '@/audio/captureWav.ts'

/**
 * The engine lives here, off the main thread.
 *
 * Rendering ahead into a queue rather than inside an AudioWorklet is a
 * deliberate trade: a worklet has a hard 128-frame deadline, and this patch can
 * have forty voices plus an eight-line reverb running through it. Missing that
 * deadline is a click. Here a slow block just eats into the lookahead, which
 * nobody hears — and the same call renders a capture faster than real time.
 */
// With the DOM lib also loaded, `self` is typed as a Window; this file only
// ever runs as a worker, so say so rather than casting at each use.
declare const self: DedicatedWorkerGlobalScope

let engine: Engine | null = null
let sampleRate = 48000

const post = (m: FromWorker, transfer: Transferable[] = []): void => {
  self.postMessage(m, transfer)
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
      // Runs in a worker of its own, started for this capture and closed when
      // it is done, so playback never waits behind an export. Each piece is
      // transferred, not copied, and goes straight on to the file.
      captureWav(
        msg,
        (bytes) => post({ type: 'captureChunk', id: msg.id, bytes }, [bytes.buffer]),
        (progress) => post({ type: 'captureProgress', id: msg.id, progress }),
      )
      post({ type: 'capture', id: msg.id })
      break
    }
  }
}
