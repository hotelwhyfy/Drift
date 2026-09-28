/**
 * Accent colour from the Colour macro.
 *
 * Deliberately a copy of the private helper in the prototype's App rather than
 * a refactor of it: the prototype is frozen, and one duplicated colour function
 * is a much smaller cost than reaching into a working app to extract it.
 */
export function accentFor(colour: number): string {
  // Around the warm side of the wheel — indigo, violet, rose, amber. The direct
  // route from indigo to amber runs through green, which reads as clinical.
  const c = colour < 0 ? 0 : colour > 1 ? 1 : colour
  return hslToHex((248 + c * 152) % 360, 40 + c * 28, 58 + c * 7)
}

function hslToHex(h: number, s: number, l: number): string {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100)
  const f = (n: number): string => {
    const k = (n + h / 30) % 12
    const v = l / 100 - a * Math.max(-1, Math.min(Math.min(k - 3, 9 - k), 1))
    return Math.round(255 * v).toString(16).padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}
