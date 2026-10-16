import type { Lane } from '@/automation/lane.ts'

/**
 * The lane value that takes `base` to `target` under the lane's mode and
 * depth — `LaneEvaluator.apply` run backwards, for recording a control's move
 * into its lane. Clamped to 0..1, so a target the lane cannot reach at its
 * depth lands as close as it can.
 */
export function invertLane(lane: Pick<Lane, 'mode' | 'depth'>, base: number, target: number): number {
  const d = lane.depth
  let v: number
  if (d <= 0) return 0.5
  switch (lane.mode) {
    case 'set':
      // At full depth the lane is the value; storing it directly keeps the
      // saved point exactly what the control was turned to.
      v = d === 1 ? target : base + (target - base) / d
      break
    case 'add':
      v = 0.5 + (target - base) / (2 * d)
      break
    case 'scale':
      // Scaling silence gives silence whatever the lane says.
      v = base > 0 ? (target / base - 1 + d) / d : 1
      break
  }
  return Math.min(1, Math.max(0, v))
}
