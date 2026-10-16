import type { InstrumentDef } from '@/instruments/types.ts'
import { rhodes } from '@/instruments/defs/rhodes.ts'
import { pad } from '@/instruments/defs/pad.ts'
import { sub } from '@/instruments/defs/sub.ts'
import { kit } from '@/instruments/defs/kit.ts'
import { cymbals } from '@/instruments/defs/cymbals.ts'
import { dust } from '@/instruments/defs/dust.ts'
import { bed } from '@/instruments/defs/bed.ts'
import { glass } from '@/instruments/defs/glass.ts'
import { arp } from '@/instruments/defs/arp.ts'
import { strings } from '@/instruments/defs/strings.ts'
import { shimmer } from '@/instruments/defs/shimmer.ts'
import { drone } from '@/instruments/defs/drone.ts'
import { choir } from '@/instruments/defs/choir.ts'
import { field } from '@/instruments/defs/field.ts'

/*
 * The rule bases in defs/ are the design documents for these instruments. Each
 * reads as a sentence — IF motion IS high THEN tremoloHz IS high — and because
 * the fuzzy sets overlap, two half-firing rules blend rather than fight. Adding
 * an instrument means writing sentences, not tuning a hundred interpolations.
 */

/** In the order the picker lists them: the harmony and the room first. */
export const INSTRUMENTS: readonly InstrumentDef[] = [
  pad, strings, choir, drone, shimmer, bed, field, sub, glass, arp, rhodes, dust, kit, cymbals,
]

export function instrumentById(id: string): InstrumentDef | undefined {
  return INSTRUMENTS.find((i) => i.id === id)
}
