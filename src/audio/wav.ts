/** 16-bit PCM WAV. Dithered, because a 24-bit render truncated to 16 without
 *  dither adds correlated distortion to exactly the quiet tails this music is
 *  mostly made of. */
export function encodeWav(left: Float32Array, right: Float32Array, sampleRate: number): ArrayBuffer {
  const frames = Math.min(left.length, right.length)
  const dataBytes = frames * 4
  const buffer = new ArrayBuffer(44 + dataBytes)
  const view = new DataView(buffer)

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

  let offset = 44
  let dither = 0
  for (let i = 0; i < frames; i++) {
    // TPDF dither at one LSB, generated from the sample index so an export is
    // still bit-identical between runs.
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
  return buffer
}
