/*
 * FLOW-001 — admin end-to-end journey (INT-002): dashboard KPIs against the
 * seed fixtures (asserted BEFORE any mutation), client creation, the full
 * task lifecycle (create backlog → assign via the BR-009 gate → PENDING →
 * IN_PROGRESS → BLOCKED with reason → COMPLETED), task history, and the
 * admin-only Users section. One continuous journey → one login.
 *
 * Fixture state is restored in beforeAll (idempotent seed, fixed IDs).
 */
import { test, expect } from '@playwright/test'
import { loginAs, reseedDatabase, ADMIN_EMAIL } from './helpers'

const TITLE = 'E2E Journey Task'
const CLIENT = 'E2E Journey Client'

test.describe('FLOW-001 admin journey', () => {
  test.beforeAll(async () => {
    reseedDatabase()
  })

  test.beforeEach(async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL)
  })

  test('dashboard → client → full task lifecycle → history → users', async ({ page }) => {
    /* ---------- Dashboard (DASH-001): KPIs must match the seed. ---------- */
    await page.goto('/dashboard')
    await expect(page.getByRole('link', { name: 'Open tasks: 17' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Overdue: 5' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Blocked: 4' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Recently completed: 7' })).toBeVisible()

    // DASH-004 deep links.
    await expect(page.getByRole('link', { name: 'Overdue: 5' })).toHaveAttribute(
      'href',
      '/tasks?due=OVERDUE',
    )
    await expect(page.getByRole('link', { name: 'Blocked: 4' })).toHaveAttribute(
      'href',
      '/tasks?status=BLOCKED',
    )

    // DASH-002/003: my tasks (admin's) and recent activity render.
    const myTasks = page.getByRole('region', { name: 'My tasks' })
    await expect(myTasks.getByRole('link', { name: 'Rebrand rollout: key visuals' })).toBeVisible()
    await expect(myTasks.getByRole('link', { name: 'Product launch: asset kit' })).toBeVisible()
    const activity = page.getByRole('region', { name: 'Recent activity' })
    await expect(activity.locator('.recent-activity__line').first()).toBeVisible()

    /* ---------- Clients: create a client. ---------- */
    await page.getByRole('link', { name: 'Clients' }).click()
    await expect(page.getByRole('heading', { name: 'Clients' })).toBeVisible()
    await page.getByRole('button', { name: 'New client' }).click()
    await expect(page.getByRole('heading', { name: 'New client' })).toBeVisible()

    const clientForm = page.getByRole('form', { name: 'Client form' })
    await clientForm.getByLabel('Company name').fill(CLIENT)
    await clientForm.getByLabel('Primary contact name').fill('E2E Contact')
    await clientForm.getByLabel('Primary contact email').fill('e2e@example.com')
    await clientForm.getByRole('button', { name: 'Create client' }).click()
    await expect(page.getByRole('heading', { name: CLIENT })).toBeVisible()
    await expect(page).toHaveURL(/\/clients\/[0-9a-f-]+$/)

    /* ---------- Tasks: create a backlog task with no assignee. ---------- */
    await page.getByRole('link', { name: 'Tasks' }).click()
    await expect(page.getByRole('heading', { name: 'Tasks' })).toBeVisible()
    await page.getByRole('button', { name: 'New task' }).click()
    const createDialog = page.getByRole('dialog', { name: 'New task' })
    await createDialog.getByLabel('Title').fill(TITLE)
    await createDialog.getByRole('button', { name: 'Create task' }).click()
    await expect(page.getByText('Task created.')).toBeVisible()

    const card = page.getByRole('article', { name: TITLE })
    await expect(card.getByText('Backlog', { exact: true })).toBeVisible()

    /* ---------- BR-009: assign before leaving the backlog. ---------- */
    await card.locator('.move-menu__trigger').click()
    const menu = page.getByRole('menu', { name: `Move ${TITLE} to` })
    await expect(menu.getByText('Assign someone first')).toBeVisible()
    await menu.getByRole('menuitem', { name: 'Pending' }).click()

    // The edit drawer opens focused on the Assignee field instead of moving.
    const editForm = page.getByRole('form', { name: 'Edit task form' })
    await expect(editForm).toBeVisible()
    await editForm.getByLabel('Assignee').selectOption({ label: 'Alex Rivera' })
    await editForm.getByRole('button', { name: 'Save changes' }).click()
    await expect(editForm).not.toBeVisible()

    // Second attempt: the task actually moves to PENDING.
    await card.locator('.move-menu__trigger').click()
    await page.getByRole('menuitem', { name: 'Pending' }).click()
    await expect(page.getByText(`Moved "${TITLE}" to Pending.`)).toBeVisible()
    await expect(card.getByText('Pending', { exact: true })).toBeVisible()

    /* ---------- PENDING → IN_PROGRESS. ---------- */
    await card.locator('.move-menu__trigger').click()
    await page.getByRole('menuitem', { name: 'In progress' }).click()
    await expect(card.getByText('In progress', { exact: true })).toBeVisible()

    /* ---------- IN_PROGRESS → BLOCKED with a reason (BR-010). ---------- */
    await card.locator('.move-menu__trigger').click()
    await page.getByRole('menuitem', { name: 'Blocked' }).click()
    const blockDialog = page.getByRole('dialog', { name: `Block ${TITLE}` })
    await blockDialog.locator('#blocked-reason-input').fill('Waiting for e2e fixture input')
    await blockDialog.getByRole('button', { name: 'Block task' }).click()
    await expect(card.getByText('Blocked', { exact: true })).toBeVisible()

    /* ---------- BLOCKED → COMPLETED. ---------- */
    await card.locator('.move-menu__trigger').click()
    await page.getByRole('menuitem', { name: 'Completed' }).click()
    await expect(card.getByText('Completed', { exact: true })).toBeVisible()

    /* ---------- History: every event of the journey is recorded. ---------- */
    await card.getByRole('link', { name: TITLE }).click()
    await expect(page.getByRole('complementary', { name: 'Task details' })).toBeVisible()
    const history = page.getByRole('region', { name: 'History' })
    // exact: true — "Created by" (detail list) would substring-match "Created".
    await expect(history.getByText('Created', { exact: true })).toBeVisible()
    await expect(history.getByText('Status changed', { exact: true }).first()).toBeVisible()

    /* ---------- Users: visible to admins. ---------- */
    // "Back to tasks" is a mobile-only affordance (display:none on desktop);
    // the drawer's close button is the accessible way out here.
    await page.getByRole('button', { name: 'Close Task details' }).click()
    await page.getByRole('link', { name: 'Users' }).click()
    await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible()
  })
})
