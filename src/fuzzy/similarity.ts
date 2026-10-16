export function similarity(a: Set<string>, b: Set<string>): number {
  const shared = [...a].filter((t) => b.has(t)).length
  return shared / Math.max(1, Math.min(a.size, b.size))
}
