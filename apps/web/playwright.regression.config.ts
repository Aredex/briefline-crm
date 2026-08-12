/*
 * Full regression suite — reuses EXISTING servers (reuseExistingServer: true).
 * Start API + Vite manually before running:
 *   pnpm dev  (or start them separately)
 *
 * Storage state is saved once in global setup to avoid the 5/min login throttle.
 * All 40+ tests share the same authenticated session.
 */
import { defineConfig } from '@playwright/test'

const WEB_URL = 'http://127.0.0.1:5173'

export default defineConfig({
  testDir: './test/e2e',
  testMatch: 'regression.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: WEB_URL,
    trace: 'on-first-retry',
  },
  webServer: [], // No webServer — reuse manually started servers
})
