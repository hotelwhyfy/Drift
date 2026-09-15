/**
 * Render each scene to a WAV and print what came out. Run with:
 *   npm run audition            all scenes, 30s each
 *   npm run audition -- Rain 60 one scene, 60s
 *
 * The numbers matter as much as the files: a scene that peaks at 0.999 is
 * limiting hard, and one whose RMS sits below -30 dBFS is barely there.
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { Engine } from '../src/engine/engine.ts'
import { encodeWav } from '../src/audio/wav.ts'
import { SCENES, DEFAULT_MACROS } from '../src/macros/macros.ts'
import { deriveSeed } from '../src/core/rng.ts'
import { buildPatch, modeNameAt } from '../src/macros/patch.ts'

const SAMPLE_RATE = 44100
const args = process.argv.slice(2)
const only = args[0]
const seconds = Number(args[1] ?? 30)

mkdirSync('out', { recursive: true })

const scenes = only
  ? SCENES.filter((s) => s.name.toLowerCase() === only.toLowerCase())
  : SCENES
const list = scenes.length > 0 ? scenes : [{ name: 'Default', macros: DEFAULT_MACROS }]

for (const scene of list) {
  const frames = Math.floor(seconds * SAMPLE_RATE)
  const left = new Float32Array(frames)
  const right = new Float32Array(frames)
  const engine = new Engine(SAMPLE_RATE, scene.macros, deriveSeed(scene.name))
  engine.snapMacros(scene.macros)

  const t0 = Date.now()
  engine.render(left, right, frames)
  const elapsed = (Date.now() - t0) / 1000

  let peak = 0
  let sum = 0
  let bad = 0
  for (let i = 0; i < frames; i++) {
    const a = Math.abs(left[i])
    const b = Math.abs(right[i])
    if (!Number.isFinite(left[i]) || !Number.isFinite(right[i])) bad++
    if (a > peak) peak = a
    if (b > peak) peak = b
    sum += left[i] * left[i] + right[i] * right[i]
  }
  const rms = Math.sqrt(sum / (frames * 2))
  const db = (x: number) => (x > 0 ? (20 * Math.log10(x)).toFixed(1) : '-inf')
  const patch = buildPatch(scene.macros)

  writeFileSync(`out/${scene.name.toLowerCase()}.wav`,
    Buffer.from(encodeWav(left, right, SAMPLE_RATE)))

  console.log(
    `${scene.name.padEnd(8)} peak ${db(peak).padStart(6)} dB   rms ${db(rms).padStart(6)} dB   ` +
    `${patch.compose.tempo.toFixed(0)} bpm  ${modeNameAt(scene.macros.colour).padEnd(11)} ` +
    `${(seconds / elapsed).toFixed(0)}x realtime` + (bad > 0 ? `  ** ${bad} NON-FINITE **` : ''),
  )
}
