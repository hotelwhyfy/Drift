import type { Session } from '@/ui/types.ts'
import { generateDrift } from '@/generate/generateDrift.ts'
import { randomSeedName } from '@/ui/session/randomSeedName.ts'

/**
 * What a first launch opens on: a generated drift, like the generate button
 * makes, so it is a real drift with a real baseline like any other.
 */
export function firstSession(): Session {
  const name = randomSeedName()
  return { ...generateDrift(name), seedName: name, projectName: name }
}
