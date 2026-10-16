export function similarity(a: Set<string>, b: Set<string>): number {
  let shared = 0
  for (const t of a) if (b.has(t)) shared++
  return shared / Math.max(1, Math.min(a.size, b.size))
}
