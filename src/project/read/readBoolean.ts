export const readBoolean = (v: unknown, fallback = false): boolean =>
  typeof v === 'boolean' ? v : fallback
