/** Character trigrams, for matching words the table has never seen. */
export function trigrams(word: string): Set<string> {
  const padded = `  ${word}  `
  const out = new Set<string>()
  for (let i = 0; i < padded.length - 2; i++) out.add(padded.slice(i, i + 3))
  return out
}
