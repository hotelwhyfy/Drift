/**
 * Type-to-jump: the index of the option a typed search lands on, or -1.
 *
 * Letters typed in quick succession search by prefix; one letter repeated
 * steps through the options starting with it, as a native select does. The
 * search runs one lap of the list from where it starts, wrapping round, so the
 * first match at or after `from` wins.
 */
export function findTypeahead(labels: readonly string[], typed: string, from: number): number {
  const repeating = [...typed].every((c) => c === typed[0])
  const needle = repeating ? typed[0] : typed
  const start = repeating ? from + 1 : Math.max(0, from)
  const lap = Array.from({ length: labels.length }, (_, k) => (start + k) % labels.length)
  return lap.find((i) => labels[i].toLowerCase().startsWith(needle)) ?? -1
}
