/** The meter's floor. Quieter than this, an instrument reads as silent. */
const METER_FLOOR_DB = -60

/** Linear amplitude → 0..1 along the meter, on a decibel scale. */
export function meterPosition(amplitude: number): number {
  if (amplitude <= 0) return 0
  const db = 20 * Math.log10(amplitude)
  return Math.max(0, Math.min(1, 1 - db / METER_FLOOR_DB))
}
