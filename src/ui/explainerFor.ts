import { instrumentById } from '@/instruments/registry.ts'
import { FuzzyEngine } from '@/fuzzy/inference.ts'

/** Cached per instrument definition, purely to render the firing rules. */
const explainers = new Map<string, FuzzyEngine>()
export function explainerFor(defId: string): FuzzyEngine | null {
  const cached = explainers.get(defId)
  if (cached) return cached
  const def = instrumentById(defId)
  if (!def) return null
  const engine = new FuzzyEngine(def.rules)
  explainers.set(defId, engine)
  return engine
}
