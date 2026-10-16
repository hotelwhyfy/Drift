// Teaches plain Node the `@/` → `src/` mapping that Vite, Vitest and tsc get
// from their own config, so scripts can import from src the way src does.
import { register } from 'node:module'

register('./aliasHooks.mjs', import.meta.url)
