/*
 * Playwright e2e (INT-002/003) — full-stack journeys against the real API
 * (no MSW). The webServer array boots the Postgres-migrated API on :3000 and
 * Vite on :5173 (which proxies /api). The API has no /health endpoint, so the
 * CSRF route is the public readiness probe.
 *
 * Database: the default is the local compose Postgres on :5432
 * (docker/compose.yml). Override with E2E_DATABASE_URL when that port is
 * taken by another project's container (see the PH-10 report).
 *
 * The seed is idempotent (fixed IDs, deleteMany + createMany in one tx), so
 * every spec reseeds in beforeAll to restore the fixture state — the journeys
 * mutate the database (creating clients/tasks, moving statuses).
 *
 * workers:1 + fullyParallel:false because login is throttled to 5/min per IP
 * and every spec shares the same database.
 */
import { defineConfig } from '@playwright/test'

const API_URL = 'http://127.0.0.1:3000'
const WEB_URL = 'http://127.0.0.1:5173'

const databaseUrl =
  process.env.E2E_DATABASE_URL ??
  'postgresql://briefline:briefline-local@localhost:5432/briefline'

const apiEnv = {
  ...process.env,
  DATABASE_URL: databaseUrl,
  DIRECT_URL: databaseUrl,
  JWT_SECRET: 'briefline-e2e-jwt-secret-2026-local-0001',
  CSRF_SECRET: 'briefline-e2e-csrf-secret-2026-local-0001',
  NODE_ENV: 'development',
  PORT: '3000',
  CORS_ORIGINS: 'http://127.0.0.1:5173,http://localhost:5173',
}

export default defineConfig({
  testDir: './test/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: WEB_URL,
    trace: 'on-first-retry',
  },
  webServer: [
    {
      // Migrate + seed + build + boot the API. The repo's `pnpm dev` cannot
      // start under Node 24 (see test/e2e/start-api-for-e2e.sh).
      command: 'bash test/e2e/start-api-for-e2e.sh',
      url: `${API_URL}/api/v1/auth/csrf`,
      timeout: 180_000,
      reuseExistingServer: !process.env.CI,
      env: apiEnv,
    },
    {
      // Vite dev server; mocks must stay OFF in e2e (INT-001). --host
      // 127.0.0.1: by default Vite binds to `localhost` (IPv6 ::1 on macOS),
      // while the readiness probe and baseURL use 127.0.0.1.
      command: 'pnpm --filter @briefline/web dev --host 127.0.0.1',
      url: WEB_URL,
      timeout: 180_000,
      reuseExistingServer: !process.env.CI,
      env: { ...apiEnv, VITE_ENABLE_MOCKS: 'false' },
    },
  ],
})
