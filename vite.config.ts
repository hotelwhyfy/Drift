import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { fileDialogs } from './scripts/fileDialogs.ts'

export default defineConfig({
  plugins: [react(), fileDialogs()],
  resolve: { alias: { '@': resolve(import.meta.dirname, 'src') } },
  worker: { format: 'es' },
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
      },
    },
  },
})
