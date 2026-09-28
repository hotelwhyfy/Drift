import type { Mode } from '../core/theory.ts'
import { degreeToSemitone } from '../core/theory.ts'

const NUMERALS = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii']

/**
 * A degree as a Roman numeral in the given mode: upper case for a major
 * triad, lower for minor, and a degree sign for diminished — so a custom
 * progression reads the way a musician would write it down.
 */
export function romanNumeral(mode: Mode, degree: number): string {
  const third = degreeToSemitone(mode, degree + 2) - degreeToSemitone(mode, degree)
  const fifth = degreeToSemitone(mode, degree + 4) - degreeToSemitone(mode, degree)
  const name = NUMERALS[((degree % 7) + 7) % 7]
  if (fifth === 6) return `${name}°`
  return third === 4 ? name.toUpperCase() : name
}
