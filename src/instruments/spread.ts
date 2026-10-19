const PHI = 0.6180339887498949
/** How far a draw may pull a value off the sequence, as a fraction of 0..1. */
const JITTER = 0.15

/**
 * A uniform value in [0, 1) for slot `index`, for use where a pattern would
 * write `rng() < chance`.
 *
 * Independent coin flips cluster: at a chance of 0.5, one run in four is three
 * or more in a row, and the silence after them is as long as the streak was.
 * That is not a flaw in the generator, it is what independence means, and on a
 * part that plays "now and then" it sounds like bursts followed by absences.
 *
 * Stepping by the golden ratio keeps consecutive values as far apart as a
 * sequence can, so a hit is followed by a rest far more often than chance
 * alone would say. A little of the caller's own draw is mixed in so the
 * pattern is not a metronome. The marginal is still uniform, so the long-run
 * rate is exactly `chance`.
 *
 * It is a pure function of the coordinate: `phase` is fixed per instrument,
 * `index` is where the slot sits in musical time. There is no state to
 * replay, so a seek lands on the same decision playback would have made.
 *
 * @param phase   constant per instrument, uniform in [0, 1)
 * @param index   the slot's musical coordinate — a window, a bar, a step
 * @param jitter  a uniform draw the caller was taking anyway
 */
export function spread(phase: number, index: number, jitter: number): number {
  const v = phase + index * PHI + (jitter - 0.5) * JITTER
  return v - Math.floor(v)
}
