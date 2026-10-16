import { createRng, deriveSeed } from '@/core/rng.ts'
import { Reverb } from '@/dsp/reverb.ts'
import { WowFlutter, Saturator, Limiter } from '@/dsp/tape.ts'
import { Chorus, PingPong, Ducker } from '@/dsp/modfx.ts'
import { Svf } from '@/dsp/svf.ts'
import type { MasterChain } from '@/engine/types.ts'

/** The master chain, fresh. Seeded, so a rebuilt chain is the same chain. */
export function buildMasterChain(sr: number, seed: number): MasterChain {
  const rng = createRng(deriveSeed(seed, 'engine'))
  // Constructed in this order because the reverb, chorus and wow share one
  // stream: reordering them would change every render.
  const reverb = new Reverb(sr, rng)
  const echo = new PingPong(sr)
  const chorus = new Chorus(sr, rng)
  const wow = new WowFlutter(sr, rng)
  return {
    reverb, echo, chorus, wow,
    sat: new Saturator(),
    limiter: new Limiter(sr),
    ducker: new Ducker(sr),
    tiltL: new Svf(sr),
    tiltR: new Svf(sr),
    lowCutL: new Svf(sr),
    lowCutR: new Svf(sr),
  }
}
