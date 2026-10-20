import type { Lane } from '@/automation/lane.ts'

/**
 * Whether a lane changes anything: enabled, with some depth, and — for a
 * timeline lane — with at least one point drawn. An empty envelope samples as
 * 0.5, so without this a freshly added level lane would pull its instrument to
 * half volume before anything was drawn in it. The six dials' tracks follow
 * the same rule.
 */
export function laneActs(lane: Lane): boolean {
  return lane.enabled && lane.depth > 0 && (lane.source.kind !== 'song' || lane.source.envelope.points.length > 0)
}
