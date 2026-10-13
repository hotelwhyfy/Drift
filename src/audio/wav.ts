/** The most audio a WAV can describe: its sizes are unsigned 32-bit. */
export const MAX_WAV_DATA_BYTES = 0xffffffff - 36

/**
 * 16-bit PCM WAV, produced as a header and then a slice at a time.
 *
 * Streaming so a capture never has to be held whole: each slice is encoded,
 * handed to wherever the file is going, and forgotten. The header carries the
 * total length, which is known before the first sample is rendered.
 *
 * Dithered, because a 24-bit render truncated to 16 without dither adds
 * correlated distortion to exactly the quiet tails this music is mostly made
 * of.
 */
export function wavHeader(frames: number, sampleRate: number): Uint8Array<ArrayBuffer> {
  const dataBytes = frames * 4
  if (dataBytes > MAX_WAV_DATA_BYTES) {
    const hours = MAX_WAV_DATA_BYTES / 4 / sampleRate / 3600
    throw new Error(`Too long for a WAV file: at this sample rate the format stops at ${hours.toFixed(1)} hours.`)
  }
  const header = new Uint8Array(44)
  const view = new DataView(header.buffer)

  const ascii = (offset: number, s: string): void => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i))
  }

  ascii(0, 'RIFF')
  view.setUint32(4, 36 + dataBytes, true)
  ascii(8, 'WAVE')
  ascii(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 2, true) // stereo
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 4, true)
  view.setUint16(32, 4, true)
  view.setUint16(34, 16, true)
  ascii(36, 'data')
  view.setUint32(40, dataBytes, true)
  return header
}

/** Turns float slices into 16-bit sample data, one slice at a time. */
export class WavEncoder {
  /** TPDF dither state, carried across slices so where they fall changes nothing. */
  private dither = 0

  /** A fresh buffer each time, so it can be transferred away and not copied. */
  encode(left: Float32Array, right: Float32Array, frames: number): Uint8Array<ArrayBuffer> {
    const n = Math.min(frames, left.length, right.length)
    const bytes = new Uint8Array(n * 4)
    const view = new DataView(bytes.buffer)
    let dither = this.dither
    let offset = 0
    for (let i = 0; i < n; i++) {
      // TPDF dither at one LSB, generated from the sample index so an export
      // is still bit-identical between runs.
      dither = (dither * 1103515245 + 12345) & 0x7fffffff
      const d1 = (dither / 0x7fffffff - 0.5) / 32768
      dither = (dither * 1103515245 + 12345) & 0x7fffffff
      const d2 = (dither / 0x7fffffff - 0.5) / 32768
      const l = Math.max(-1, Math.min(1, left[i] + d1 + d2))
      const r = Math.max(-1, Math.min(1, right[i] + d1 + d2))
      view.setInt16(offset, Math.round(l * 32767), true)
      view.setInt16(offset + 2, Math.round(r * 32767), true)
      offset += 4
    }
    this.dither = dither
    return bytes
  }
}

/** A whole WAV at once, for scripts that already hold the render. */
export function encodeWav(left: Float32Array, right: Float32Array, sampleRate: number): ArrayBuffer {
  const frames = Math.min(left.length, right.length)
  const header = wavHeader(frames, sampleRate)
  const data = new WavEncoder().encode(left, right, frames)
  const out = new Uint8Array(header.length + data.length)
  out.set(header, 0)
  out.set(data, header.length)
  return out.buffer
}
