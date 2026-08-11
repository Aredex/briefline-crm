/*
 * FLOW-003 — forbidden mutations (INT-003): a member PATCHes another user's
 * task (t220 "Rebrand rollout: key visuals", owned by admin Alex Rivera)
 * through the real API and gets 403 — both via the status endpoint and the
 * field-level endpoint — while the task stays untouched (version unchanged).
 *
 * Fixture state is restored in beforeAll (idempotent seed, fixed IDs).
 */
import { test, expect } from '@playwright/test'
import { loginAs, reseedDatabase, MEMBER_EMAIL, FOREIGN_TASK_ID } from './helpers'

test.describe('FLOW-003 forbidden mutations', () => {
  test.beforeAll(async () => {
    reseedDatabase()
  })

  test('member PATCH of a foreign task is rejected with 403 and leaves no trace', async ({
    page,
  }) => {
    await loginAs(page, MEMBER_EMAIL)

    /* ---------- Baseline: version + status before the attempt. ---------- */
    const read = await page.request.get(`/api/v1/tasks/${FOREIGN_TASK_ID}`)
    expect(read.status()).toBe(200)
    const task = (await read.json()).data
    const version = task.version as number
    expect(task.status).toBe('BLOCKED')

    const csrfToken = (
      await (await page.request.get('/api/v1/auth/csrf')).json()
    ).data.csrfToken as string

    /* ---------- Status mutation on a foreign task → 403. ---------- */
    const statusPatch = await page.request.patch(`/api/v1/tasks/${FOREIGN_TASK_ID}/status`, {
      headers: { 'X-CSRF-Token': csrfToken },
      data: { status: 'IN_PROGRESS', expectedVersion: version },
    })
    expect(statusPatch.status()).toBe(403)

    /* ---------- Field mutation on a foreign task → 403. ---------- */
    const fieldPatch = await page.request.patch(`/api/v1/tasks/${FOREIGN_TASK_ID}`, {
      headers: { 'X-CSRF-Token': csrfToken },
      data: { title: 'E2E must not mutate foreign tasks', expectedVersion: version },
    })
    expect(fieldPatch.status()).toBe(403)

    /* ---------- The task is untouched: same version, same status. ---------- */
    const reRead = await page.request.get(`/api/v1/tasks/${FOREIGN_TASK_ID}`)
    expect(reRead.status()).toBe(200)
    const after = (await reRead.json()).data
    expect(after.version).toBe(version)
    expect(after.status).toBe('BLOCKED')
  })
})
