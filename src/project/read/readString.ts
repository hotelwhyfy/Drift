export const readString = (v: unknown, fallback: string): string =>
  typeof v === 'string' && v.length > 0 ? v : fallback
