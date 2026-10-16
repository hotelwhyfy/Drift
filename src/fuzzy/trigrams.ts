/** Character trigrams, for matching words the table has never seen. */
export function trigrams(word: string): Set<string> {
  const padded = `  ${word}  `
  return new Set(Array.from({ length: padded.length - 2 }, (_, i) => padded.slice(i, i + 3)))
}
