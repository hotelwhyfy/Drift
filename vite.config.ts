import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [react()],
  worker: { format: 'es' },
  build: {
    rollupOptions: {
      input: {
        // The prototype, untouched.
        main: resolve(import.meta.dirname, 'index.html'),
        // The mood version: one question, then it plays. Shares the whole
        // engine; adds only src/mood and src/ui/mood.
        mood: resolve(import.meta.dirname, 'mood.html'),
      },
    },
  },
})
