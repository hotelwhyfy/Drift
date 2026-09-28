import type { Macros } from '../macros/macros.ts'
import type { SlotDesc } from '../engine/rack.ts'
import type { EngineSnapshot } from '../engine/engine.ts'
import type { ToWorker, FromWorker } from './messages.ts'
import { encodeWav } from './wav.ts'
import type { Song } from '../song/song.ts'
import { DEFAULT_SONG } from '../song/song.ts'

/**
 * How far ahead of the speakers audio is rendered.
 *
 * This is also, exactly, how long a mute, solo or level change takes to be
 * heard: audio already handed to the AudioContext cannot be revised. It was
 * originally 1.6 s, which at 70 bpm is about half a bar — long enough that the
 * controls felt like they were waiting for the next bar rather than responding.
 *
 * The engine renders at roughly 14x realtime, so a 0.12 s chunk costs about
 * 9 ms of work. There is plenty of headroom to keep the queue short, and the
 * floor grows on its own if a machine turns out to disagree.
 */
const MIN_LOOKAHEAD = 0.36
const MAX_LOOKAHEAD = 1.8
/** Length of each rendered chunk. */
const CHUNK = 0.12
const VOLUME = 0.9
/** A song that has stopped is let ring for at most this long. */
const TAIL_SECONDS = 10

export interface PlayerEvents {
  onSnapshot?: (s: EngineSnapshot) => void
  onCaptureProgress?: (progress: number) => void
  onStateChange?: (playing: boolean) => void
}

/**
 * Owns the AudioContext and keeps the worker's output flowing into it.
 *
 * Chunks are scheduled back to back on the context's own clock rather than
 * played on a timer: `setTimeout` drifts by milliseconds, and a millisecond of
 * drift between consecutive buffers is an audible click at the seam. The timer
 * only decides *when to ask* for more audio; the AudioContext decides when it
 * plays.
 */
export class Player {
  private ctx: AudioContext | null = null
  private worker: Worker | null = null
  private gain: GainNode | null = null
  private analyser: AnalyserNode | null = null
  private timer: number | null = null
  private nextId = 1
  private inflight = 0
  /** Context time up to which audio is already scheduled. */
  private scheduledUntil = 0
  private playing = false
  private lookahead = MIN_LOOKAHEAD
  private underruns = 0
  private macros: Macros
  private slots: SlotDesc[] = []
  private seed: number
  private sources = new Set<AudioBufferSourceNode>()
  private captureResolve: ((blob: Blob) => void) | null = null
  private captureId = 0
  private song: Song = DEFAULT_SONG
  /** Bumped on every seek; audio from an older epoch is dropped. */
  private epoch = 0
  /** The next chunk is the first after a seek: fade it in rather than count an underrun. */
  private freshStart = false
  /**
   * Snapshots wait here until the audio they describe is actually playing. The
   * engine renders a lookahead in advance, so a snapshot shown on arrival
   * puts the playhead a third of a second ahead of the speakers.
   */
  private heard: { at: number; snapshot: EngineSnapshot }[] = []
  private endedAt: number | null = null

  constructor(macros: Macros, seed: number, private readonly events: PlayerEvents = {}) {
    this.macros = { ...macros }
    this.seed = seed
  }

  get isPlaying(): boolean {
    return this.playing
  }

  /**
   * Seconds of audio already committed to the output. This is the delay before
   * a control change can be heard, and it is worth being able to read.
   */
  get queuedSeconds(): number {
    if (!this.ctx) return 0
    return Math.max(0, this.scheduledUntil - this.ctx.currentTime)
  }

  /** How many times the queue has run dry. Non-zero means the lookahead grew. */
  get underrunCount(): number {
    return this.underruns
  }

  /** Needed by the visualiser to turn FFT bins into frequencies. */
  get sampleRate(): number {
    return this.ctx?.sampleRate ?? 48000
  }

  get frequencyData(): Uint8Array | null {
    if (!this.analyser) return null
    const data = new Uint8Array(this.analyser.frequencyBinCount)
    this.analyser.getByteFrequencyData(data)
    return data
  }

  private ensureContext(): AudioContext {
    if (this.ctx) return this.ctx
    // 'interactive' rather than 'playback': the worker already buffers, and
    // 'playback' adds output latency on top of the queue, which the dials feel.
    const ctx = new AudioContext({ latencyHint: 'interactive' })
    const gain = ctx.createGain()
    gain.gain.value = VOLUME
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 2048
    analyser.smoothingTimeConstant = 0.82
    // The default -100..-30 dB window spends most of its range on noise floor.
    // This music lives between about -70 and -20.
    analyser.minDecibels = -72
    analyser.maxDecibels = -20
    gain.connect(analyser)
    analyser.connect(ctx.destination)
    this.ctx = ctx
    this.gain = gain
    this.analyser = analyser

    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<FromWorker>) => this.onWorkerMessage(e.data)
    this.send(worker, { type: 'init', sampleRate: ctx.sampleRate, macros: this.macros, seed: this.seed })
    if (this.slots.length > 0) this.send(worker, { type: 'rack', slots: this.slots })
    this.send(worker, { type: 'song', song: this.song })
    this.worker = worker
    return ctx
  }

  private send(worker: Worker, msg: ToWorker): void {
    worker.postMessage(msg)
  }

  private onWorkerMessage(msg: FromWorker): void {
    switch (msg.type) {
      case 'chunk': {
        // Rendered for a position that has since been left behind.
        if (msg.epoch !== this.epoch) return
        this.inflight--
        if (!this.playing || !this.ctx || !this.gain) return
        const ctx = this.ctx
        if (this.freshStart) {
          // First audio after a seek or a start: begin just ahead of now, and
          // fade in over it so the jump does not click.
          this.freshStart = false
          this.scheduledUntil = ctx.currentTime + 0.03
          this.gain.gain.cancelScheduledValues(ctx.currentTime)
          this.gain.gain.setValueAtTime(0, this.scheduledUntil)
          this.gain.gain.linearRampToValueAtTime(VOLUME, this.scheduledUntil + 0.04)
        }
        const buffer = ctx.createBuffer(2, msg.left.length, ctx.sampleRate)
        buffer.copyToChannel(msg.left, 0)
        buffer.copyToChannel(msg.right, 1)
        const source = ctx.createBufferSource()
        source.buffer = buffer
        source.connect(this.gain)
        // If the queue ran dry (a slow tab, a sleeping machine) restart just
        // ahead of now rather than scheduling in the past, which would drop
        // the buffer silently.
        if (this.scheduledUntil < ctx.currentTime + 0.02) {
          // The queue ran dry — a slow tab, a sleeping machine, a heavy rack.
          // Restart just ahead of now rather than scheduling into the past,
          // and give this machine more headroom next time. Responsiveness is
          // worth a lot, but not a gap in the audio.
          this.scheduledUntil = ctx.currentTime + 0.08
          this.underruns++
          this.lookahead = Math.min(MAX_LOOKAHEAD, this.lookahead * 1.5)
        }
        source.start(this.scheduledUntil)
        this.scheduledUntil += buffer.duration
        this.sources.add(source)
        source.onended = () => this.sources.delete(source)
        this.heard.push({ at: this.scheduledUntil, snapshot: msg.snapshot })
        break
      }
      case 'captureProgress':
        if (msg.id === this.captureId) this.events.onCaptureProgress?.(msg.progress)
        break
      case 'capture': {
        if (msg.id !== this.captureId || !this.captureResolve) return
        const wav = encodeWav(msg.left, msg.right, msg.sampleRate)
        this.captureResolve(new Blob([wav], { type: 'audio/wav' }))
        this.captureResolve = null
        break
      }
    }
  }

  /** Hand the interface the newest snapshot whose audio has now been heard. */
  private release(): void {
    if (!this.ctx) return
    const now = this.ctx.currentTime
    let latest: EngineSnapshot | null = null
    while (this.heard.length > 0 && this.heard[0].at <= now) {
      const next = this.heard.shift()
      if (next) latest = next.snapshot
    }
    if (!latest) return
    this.events.onSnapshot?.(latest)
    // A song that stops is let ring out, then the transport stops by itself.
    if (latest.ended) {
      this.endedAt ??= now
      if (latest.rms < 0.0008 || now - this.endedAt > TAIL_SECONDS) this.stop()
    } else {
      this.endedAt = null
    }
  }

  private pump = (): void => {
    this.release()
    if (!this.playing || !this.ctx || !this.worker) return
    const frames = Math.floor(CHUNK * this.ctx.sampleRate)
    // Ask for enough chunks to refill the lookahead, counting the ones already
    // being rendered so a slow render does not cause a stampede of requests.
    while (
      this.scheduledUntil - this.ctx.currentTime + this.inflight * CHUNK < this.lookahead
    ) {
      this.inflight++
      this.send(this.worker, { type: 'render', frames, id: this.nextId++, epoch: this.epoch })
    }
  }

  /**
   * Start playback. Given a bar, starts from there — from the top of it, with
   * the room already sounding. Without one, carries on from wherever the
   * engine is, which is what an endless stream wants.
   */
  async play(fromBar?: number): Promise<void> {
    const ctx = this.ensureContext()
    if (ctx.state === 'suspended') await ctx.resume()
    if (this.playing) return
    this.playing = true
    if (fromBar !== undefined) this.jump(fromBar)
    this.scheduledUntil = ctx.currentTime + 0.12
    this.freshStart = true
    this.endedAt = null
    this.pump()
    this.timer = window.setInterval(this.pump, 40)
    this.events.onStateChange?.(true)
  }

  stop(): void {
    if (!this.playing) return
    this.playing = false
    if (this.timer !== null) {
      window.clearInterval(this.timer)
      this.timer = null
    }
    // Fade rather than cut: stopping a reverb tail dead is a click.
    if (this.gain && this.ctx) {
      const now = this.ctx.currentTime
      this.gain.gain.cancelScheduledValues(now)
      this.gain.gain.setValueAtTime(this.gain.gain.value, now)
      this.gain.gain.linearRampToValueAtTime(0, now + 0.12)
      const sources = [...this.sources]
      window.setTimeout(() => {
        sources.forEach((s) => {
          try { s.stop() } catch { /* already ended */ }
        })
        this.sources.clear()
        if (this.gain && this.ctx) this.gain.gain.setValueAtTime(VOLUME, this.ctx.currentTime)
      }, 140)
    }
    this.inflight = 0
    this.heard = []
    this.endedAt = null
    this.events.onStateChange?.(false)
  }

  /** Move the engine, and forget everything rendered for the old position. */
  private jump(bar: number): void {
    this.epoch++
    this.inflight = 0
    this.heard = []
    this.endedAt = null
    if (this.worker) this.send(this.worker, { type: 'seek', bar, epoch: this.epoch })
  }

  /**
   * Jump to a bar. While playing, what is queued is faded out over 30 ms and
   * dropped, and the new position fades in as soon as it arrives; stopped,
   * the engine simply waits there.
   */
  seek(bar: number): void {
    this.ensureContext()
    this.jump(bar)
    if (!this.playing || !this.ctx || !this.gain) return
    const now = this.ctx.currentTime
    this.gain.gain.cancelScheduledValues(now)
    this.gain.gain.setValueAtTime(this.gain.gain.value, now)
    this.gain.gain.linearRampToValueAtTime(0, now + 0.03)
    const old = [...this.sources]
    this.sources.clear()
    window.setTimeout(() => {
      old.forEach((s) => {
        try { s.stop() } catch { /* already ended */ }
      })
    }, 40)
    this.freshStart = true
    this.pump()
  }

  setSong(song: Song): void {
    this.song = song
    if (this.worker) this.send(this.worker, { type: 'song', song })
  }

  setMacros(m: Macros): void {
    this.macros = { ...m }
    if (this.worker) this.send(this.worker, { type: 'macros', macros: this.macros })
  }

  setRack(slots: SlotDesc[]): void {
    this.slots = slots
    if (this.worker) this.send(this.worker, { type: 'rack', slots })
  }

  reseed(seed: number): void {
    this.seed = seed
    if (this.worker) this.send(this.worker, { type: 'reseed', seed, macros: this.macros })
  }

  get currentSeed(): number {
    return this.seed
  }

  /**
   * Renders the piece from the top at the current settings, faster than real
   * time: the song once through plus its tail, or a fixed number of seconds.
   */
  capture(mode: 'song' | 'minutes', seconds = 0): Promise<Blob> {
    const ctx = this.ensureContext()
    void ctx
    return new Promise((resolve) => {
      this.captureResolve = resolve
      this.captureId = this.nextId++
      if (this.worker) {
        this.send(this.worker, {
          type: 'capture', mode, seconds, macros: this.macros, seed: this.seed,
          slots: this.slots, song: this.song, id: this.captureId,
        })
      }
    })
  }

  setVolume(v: number): void {
    if (this.gain && this.ctx) {
      this.gain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02)
    }
  }

  dispose(): void {
    this.stop()
    this.worker?.terminate()
    this.worker = null
    void this.ctx?.close()
    this.ctx = null
  }
}
