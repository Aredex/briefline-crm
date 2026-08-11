/*
 * FLOW-002/003 — member end-to-end journey (INT-003): dashboard restricted to
 * the member's own tasks, board filtering, a status change on an assigned
 * task, and the access boundary — no Users link and 403 on direct navigation.
 *
 * Fixture state is restored in beforeAll (idempotent seed, fixed IDs).
 * Member: Marco Díaz (member@briefline.demo) — 6 active tasks in the seed:
 * t201 (BACKLOG), t207 (PENDING, due today), t211 (PENDING), t215
 * (IN_PROGRESS, overdue), t219 (IN_PROGRESS), t223 (BLOCKED).
 */
import { test, expect } from '@playwright/test'
import { loginAs, reseedDatabase, MEMBER_EMAIL } from './helpers'

test.describe('FLOW-002/003 member journey', () => {
  test.beforeAll(async () => {
    reseedDatabase()
  })

  test.beforeEach(async ({ page }) => {
    await loginAs(page, MEMBER_EMAIL)
  })

  test('dashboard shows the member their own tasks (DASH-002)', async ({ page }) => {
    await page.goto('/dashboard')

    // KPIs are visible to members too (fixtures, pre-mutation).
    await expect(page.getByRole('link', { name: 'Open tasks: 17' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Blocked: 4' })).toBeVisible()

    // My Tasks only lists tasks assigned to the member.
    const myTasks = page.getByRole('region', { name: 'My tasks' })
    await expect(
      myTasks.getByRole('link', { name: 'Video: brand film script' }),
    ).toBeVisible()
    await expect(
      myTasks.getByRole('link', { name: 'Brand refresh: logo exploration' }),
    ).toBeVisible()

    // Recent activity renders for members too (DASH-003).
    const activity = page.getByRole('region', { name: 'Recent activity' })
    await expect(activity.locator('.recent-activity__line').first()).toBeVisible()
  })

  test('filters the board and changes the status of an assigned task', async ({ page }) => {
    await page.goto('/tasks')
    await expect(page.getByRole('heading', { name: 'Tasks' })).toBeVisible()

    /* ---------- Status change on an assigned task (t207, PENDING). ---------- */
    const card = page.getByRole('article', { name: 'Landing page copy: Q3 campaign' })
    await expect(card.getByText('Pending', { exact: true })).toBeVisible()
    await card.locator('.move-menu__trigger').click()
    await page.getByRole('menuitem', { name: 'In progress' }).click()
    await expect(
      page.getByText('Moved "Landing page copy: Q3 campaign" to In progress.'),
    ).toBeVisible()
    await expect(card.getByText('In progress', { exact: true })).toBeVisible()

    /* ---------- Board filter by status (single-value contract). ---------- */
    await page.getByLabel('Filter tasks by status').selectOption('PENDING')
    // Only PENDING tasks remain: t211 yes, t201 (BACKLOG) and t207 (now
    // IN_PROGRESS) no. 5 PENDING left in the fixture: t208, t209, t210, t211,
    // t212 (t236 is PENDING but archived; t207 left the column above).
    await expect(
      page.getByRole('article', { name: 'Email design: renewal series' }),
    ).toBeVisible()
    await expect(
      page.getByRole('article', { name: 'Brand refresh: logo exploration' }),
    ).toHaveCount(0)
    await expect(page.getByText('5 tasks', { exact: true })).toBeVisible()
  })

  test('members never see the Users link and get 403 on direct navigation', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Users' })).toHaveCount(0)

    await page.goto('/users')
    await expect(page.getByRole('heading', { name: 'Access denied' })).toBeVisible()
    await expect(page).toHaveURL(/\/403$/)
  })
})
