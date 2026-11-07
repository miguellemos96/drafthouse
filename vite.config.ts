import { defineConfig } from 'vitest/config'

export default defineConfig({
  server: { proxy: { '/api': 'http://localhost:8787' } },
  build: { chunkSizeWarningLimit: 1000 }, // three.js alone is ~550 kB
  test: { include: ['src/**/*.test.ts', 'server/**/*.test.ts'], passWithNoTests: true },
})
