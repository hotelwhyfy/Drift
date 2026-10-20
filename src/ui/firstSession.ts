import type { Session } from '@/ui/types.ts'
import { generateDrift } from '@/generate/generateDrift.ts'
import { randomSeedName } from '@/ui/randomSeedName.ts'

/**
 * What a first launch opens on: a generated drift, like the generate button
 * makes. One name, one drift — typing the name shown brings this back, which
 * a fixed default rack under a random name would not.
 */
export function firstSession(): Session {
  const name = randomSeedName()
  return { ...generateDrift(name), seedName: name, projectName: name }
}
