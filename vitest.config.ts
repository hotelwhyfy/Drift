import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  resolve: { alias: { '@': resolve(import.meta.dirname, 'src') } },
  // Component tests opt in to a DOM with `// @vitest-environment jsdom`; the
  // engine tests stay in plain Node, as the worker runs them.
  test: { include: ['tests/**/*.test.{ts,tsx}'] },
})
