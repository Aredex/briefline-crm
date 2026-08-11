/*
 * E2E helpers (INT-002/003) — real-API login with CSRF double-submit and
 * seed reset. `loginAs` uses page.request so the session cookie lands in the
 * same jar the page uses.
 */
import { execSync } from 'node:child_process'
import type { Page } from '@playwright/test'

export const DEMO_PASSWORD = 'briefline-demo-2026'
export const ADMIN_EMAIL = 'admin@briefline.demo'
export const MEMBER_EMAIL = 'member@briefline.demo'

/** Alex Rivera's task (BLOCKED) — owned by the admin, used for the 403 probe. */
export const FOREIGN_TASK_ID = '00000000-0000-4000-8000-000000000220'

/** Log in through the real API (CSRF double-submit, cookie jar shared). */
export async function loginAs(page: Page, email: string): Promise<string> {
  const csrfResponse = await page.request.get('/api/v1/auth/csrf')
  if (!csrfResponse.ok()) {
    throw new Error(`GET /auth/csrf failed: ${csrfResponse.status()} ${await csrfResponse.text()}`)
  }
  const csrfToken = (await csrfResponse.json()).data.csrfToken

  const loginResponse = await page.request.post('/api/v1/auth/login', {
    headers: { 'X-CSRF-Token': csrfToken },
    data: { email, password: DEMO_PASSWORD },
  })
  if (!loginResponse.ok()) {
    throw new Error(
      `POST /auth/login failed: ${loginResponse.status()} ${await loginResponse.text()}`,
    )
  }
  return csrfToken
}

/**
 * Reset the database to the deterministic seed. Uses `prisma:reset`
 * (TRUNCATE CASCADE + re-seed, PH-03 DB-006), NOT `prisma:seed`: the journeys
 * create rows with runtime-generated IDs (clients, tasks, TaskChange events),
 * and the seed's deleteMany-by-fixture-id leaves those behind — the orphaned
 * TaskChange rows then blow up the FK on the next reseed.
 */
export function reseedDatabase(): void {
  // The spec runner's env does not carry the webServer env, so propagate the
  // database override explicitly (reset.ts reads DATABASE_URL / RESET_URL).
  const env = { ...process.env }
  if (process.env.E2E_DATABASE_URL) {
    env.DATABASE_URL = process.env.E2E_DATABASE_URL
    env.DIRECT_URL = process.env.E2E_DATABASE_URL
  }
  execSync('pnpm --filter @briefline/api prisma:reset', { stdio: 'pipe', env })
}

/** Fresh CSRF token for unsafe requests made outside the page. */
export async function fetchCsrfToken(page: Page): Promise<string> {
  const response = await page.request.get('/api/v1/auth/csrf')
  if (!response.ok()) {
    throw new Error(`GET /auth/csrf failed: ${response.status()}`)
  }
  return (await response.json()).data.csrfToken
}
