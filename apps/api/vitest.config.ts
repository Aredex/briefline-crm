// Unit test config — `pnpm test` (vitest run).
// Unit specs live in test/; integration specs (Testcontainers + Postgres) run
// ONLY under vitest.e2e.config.ts (`pnpm test:e2e`) so the plain unit run
// stays fast and Docker-free.
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.spec.ts'],
    exclude: ['test/integration/**', 'node_modules/**'],
  },
})
