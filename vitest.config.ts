import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// Unit tests cover the shared, pure logic (design/validation, formula, derive, timing).
// Aliases mirror tsconfig so tests can import via `@shared/*` / `@/*` if needed.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
