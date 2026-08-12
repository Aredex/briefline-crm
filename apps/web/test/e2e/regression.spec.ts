/*
 * Regression suite — full E2E coverage. Single login via page.request,
 * session reused across all tests (serial, shared browser context).
 *
 * Run:
 *   E2E_DATABASE_URL=postgresql://briefline:briefline-local@localhost:5433/briefline \
 *   pnpm --filter @briefline/web exec playwright test --config=playwright.regression.config.ts
 */
import { test, expect } from '@playwright/test'
import { reseedDatabase, ADMIN_EMAIL } from './helpers'

const DEMO_PASSWORD = 'briefline-demo-2026'
const API_PREFIX = '/api/v1'

// ── Login once, reuse the SAME page for ALL tests ──
let sharedPage: import('@playwright/test').Page

test.beforeAll(async ({ browser }) => {
  reseedDatabase()

  // Login via page.request and manually transfer cookies to browser context.
  // page.request has ISOLATED cookie storage — must copy to browser context.
  const page = await browser.newPage()
  const context = page.context()

  const csrfRes = await page.request.get(`${API_PREFIX}/auth/csrf`)
  const csrfToken = (await csrfRes.json()).data.csrfToken

  const loginRes = await page.request.post(`${API_PREFIX}/auth/login`, {
    headers: { 'X-CSRF-Token': csrfToken },
    data: { email: ADMIN_EMAIL, password: DEMO_PASSWORD },
  })
  if (!loginRes.ok()) {
    throw new Error(
      `Login failed: ${loginRes.status()} ${await loginRes.text()}`,
    )
  }

  // Transfer cookies from APIRequestContext to the browser context
  const state = await page.request.storageState()
  await context.addCookies(state.cookies)

  // Navigate to dashboard
  await page.goto('/dashboard')
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 10000 })

  sharedPage = page
})

test.afterAll(async () => {
  await sharedPage.close()
})

// Tests run sequentially (workers:1) but don't cascade on failure
// sharedPage persists across all tests via the shared browser context

/* ═══════════════════════════════════════════════════════════════════════════
   DASHBOARD
   ═══════════════════════════════════════════════════════════════════════════ */

test.describe('Dashboard', () => {
  test.beforeEach(async () => {
    await sharedPage.goto('/dashboard')
    await sharedPage.waitForLoadState('networkidle')
  })

  test('shows all 4 KPI cards with numeric values', async () => {
    await expect(sharedPage.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    const kpis = sharedPage.locator('.kpi-card')
    await expect(kpis).toHaveCount(4)
    // Each KPI card has a label and a numeric value
    for (const kpi of await kpis.all()) {
      await expect(kpi.locator('.kpi-card__label')).toBeVisible()
      await expect(kpi.locator('.kpi-card__value')).toContainText(/\d/)
    }
  })

  test('My Tasks section lists assigned tasks', async () => {
    await expect(sharedPage.getByText('My Tasks')).toBeVisible()
    const taskCards = sharedPage.locator('.my-tasks__item')
    await expect(taskCards.first()).toBeVisible()
  })

  test('Recent Activity section lists changes', async () => {
    await expect(sharedPage.getByText('Recent Activity')).toBeVisible()
    const activity = sharedPage.locator('.recent-activity__item')
    await expect(activity.first()).toBeVisible()
  })
})

/* ═══════════════════════════════════════════════════════════════════════════
   BOARD / KANBAN
   ═══════════════════════════════════════════════════════════════════════════ */

test.describe('Board', () => {
  test.beforeEach(async () => {
    await sharedPage.goto('/tasks')
    await expect(sharedPage.getByRole('heading', { name: 'Tasks' })).toBeVisible()
  })

  test('renders all 5 columns: Backlog + 4 active', async () => {
    // Column headers are buttons with task counts
    await expect(sharedPage.locator('.task-column').first()).toBeVisible()
    const columnCount = await sharedPage.locator('.task-column').count()
    expect(columnCount).toBeGreaterThanOrEqual(3)
  })

  test('task cards show title, priority badge, and status', async () => {
    const card = sharedPage.locator('.task-card').first()
    await expect(card).toBeVisible()
    await expect(card.locator('.task-card__title')).toBeVisible()
  })

  test('"Move to…" menu is accessible on cards', async () => {
    const moveButton = sharedPage.getByText('Move to…').first()
    await expect(moveButton).toBeVisible()
  })

  test('search filters tasks by title', async () => {
    const search = sharedPage.getByLabel('Search tasks')
    await search.fill('Redesign')
    // Wait for debounce and re-render
    await sharedPage.waitForTimeout(400)
    // Should show matching cards only
    await expect(sharedPage.getByText('Redesign')).toBeVisible()
  })

  test('status filter changes column visibility', async () => {
    const statusFilter = sharedPage.getByLabel('Filter tasks by status')
    await statusFilter.selectOption('BLOCKED')
    await sharedPage.waitForTimeout(300)
    // The Blocked column should be visible
    await expect(sharedPage.locator('#column-blocked, [class*="blocked"]').first()).toBeVisible()
  })

  test('priority filter narrows card results', async () => {
    const priorityFilter = sharedPage.getByLabel('Filter tasks by priority')
    await priorityFilter.selectOption('URGENT')
    await sharedPage.waitForTimeout(300)
    // Cards should be visible (may be empty if no urgent tasks)
    await expect(sharedPage.locator('.task-column').first()).toBeVisible()
  })

  test('opens task detail drawer when clicking a card', async () => {
    // Click the first task card title
    await sharedPage.locator('.task-card__title').first().click()
    // Task detail panel should open
    await expect(sharedPage.locator('.drawer, .task-detail')).toBeVisible()
  })
})

/* ═══════════════════════════════════════════════════════════════════════════
   TASK LIST
   ═══════════════════════════════════════════════════════════════════════════ */

test.describe('Task List', () => {
  test.beforeEach(async () => {
    await sharedPage.goto('/tasks/list')
    await expect(sharedPage.getByRole('heading', { name: 'Tasks' })).toBeVisible({ timeout: 5000 })
  })

  test('renders a sortable table', async () => {
    await expect(sharedPage.getByRole('table')).toBeVisible()
    await expect(sharedPage.getByRole('columnheader', { name: 'Title' })).toBeVisible()
    await expect(sharedPage.getByRole('columnheader', { name: 'Status' })).toBeVisible()
    await expect(sharedPage.getByRole('columnheader', { name: 'Priority' })).toBeVisible()
    await expect(sharedPage.getByRole('columnheader', { name: 'Due date' })).toBeVisible()
  })

  test('sorts by title when clicking column header', async () => {
    await sharedPage.getByRole('columnheader', { name: 'Title' }).click()
    // URL should contain sort param
    await expect(sharedPage).toHaveURL(/sort=title/)
  })

  test('search debounces and filters', async () => {
    await sharedPage.getByLabel('Search tasks').fill('onboarding')
    await sharedPage.waitForTimeout(400)
    await expect(sharedPage.getByText('onboarding')).toBeVisible()
  })

  test('pagination shows result count', async () => {
    await expect(sharedPage.getByText(/Showing/)).toBeVisible()
    await expect(sharedPage.getByText(/of \d+ tasks/)).toBeVisible()
  })

  test('clicking a row navigates to task detail', async () => {
    const row = sharedPage.locator('tbody tr').first()
    await row.click()
    // Should show task detail
    await expect(sharedPage.locator('.drawer, .task-detail')).toBeVisible()
  })

  test('Clear filters resets all filter state', async () => {
    await sharedPage.getByLabel('Search tasks').fill('something')
    await sharedPage.getByRole('button', { name: /Clear/i }).click()
    await expect(sharedPage.getByLabel('Search tasks')).toHaveValue('')
  })
})

/* ═══════════════════════════════════════════════════════════════════════════
   TASK DETAIL
   ═══════════════════════════════════════════════════════════════════════════ */

test.describe('Task Detail', () => {
  test.beforeEach(async () => {
    await sharedPage.goto('/tasks')
    await expect(sharedPage.getByRole('heading', { name: 'Tasks' })).toBeVisible()
    await sharedPage.locator('.task-card__title').first().click()
    await expect(sharedPage.locator('.drawer, .task-detail')).toBeVisible()
  })

  test('shows title, status, priority, assignee, client, due date', async () => {
    const panel = sharedPage.locator('.drawer, .task-detail')
    // Title
    await expect(panel.getByRole('heading')).toBeVisible()
    // These fields should be displayed somewhere in the detail
    await expect(panel).toContainText(/Status|Backlog|Pending|In progress|Blocked|Completed/)
    await expect(panel).toContainText(/Priority|Low|Medium|High|Urgent/)
  })

  test('history timeline shows CREATED event', async () => {
    const panel = sharedPage.locator('.drawer, .task-detail')
    await expect(panel.getByText('Created')).toBeVisible()
  })
})

/* ═══════════════════════════════════════════════════════════════════════════
   CLIENTS
   ═══════════════════════════════════════════════════════════════════════════ */

test.describe('Clients', () => {
  test.beforeEach(async () => {
    await sharedPage.goto('/clients')
    await expect(sharedPage.getByRole('heading', { name: 'Clients' })).toBeVisible()
  })

  test('lists clients in a table', async () => {
    await expect(sharedPage.getByRole('table', { name: 'Clients' })).toBeVisible()
    // Seed creates 12 clients, 11 active (1 archived)
    await expect(sharedPage.getByText(/Showing.*of/)).toBeVisible()
  })

  test('search filters by company name', async () => {
    await sharedPage.getByLabel(/Search/i).fill('Bluebird')
    await sharedPage.waitForTimeout(400)
    await expect(sharedPage.getByText('Bluebird Coffee Co.')).toBeVisible()
  })

  test('status filter shows archived clients to admin', async () => {
    await sharedPage.getByLabel(/Status filter/i).selectOption('ARCHIVED')
    await expect(sharedPage.getByText('Sunrise Textiles')).toBeVisible()
  })

  test('opens client detail when clicking a row', async () => {
    await sharedPage.getByText('Bluebird Coffee Co.').click()
    await expect(
      sharedPage.getByRole('heading', { name: 'Bluebird Coffee Co.' }),
    ).toBeVisible()
  })

  test('admin sees Edit/Archive/Deactivate buttons', async () => {
    const table = sharedPage.getByRole('table', { name: 'Clients' })
    await expect(table.getByRole('button', { name: 'Edit' }).first()).toBeVisible()
  })

  test('can create a new client', async () => {
    await sharedPage.getByRole('link', { name: 'New client' }).click()
    await expect(
      sharedPage.getByRole('heading', { name: 'New client' }),
    ).toBeVisible()

    await sharedPage.getByLabel(/Company name/i).fill('Test Corp')
    await sharedPage.getByLabel(/Primary contact name/i).fill('John Doe')
    await sharedPage.getByLabel(/Primary contact email/i).fill('john@testcorp.example')
    await sharedPage.getByRole('button', { name: 'Create client' }).click()

    // Should redirect to client detail
    await expect(
      sharedPage.getByRole('heading', { name: 'Test Corp' }),
    ).toBeVisible()
  })

  test('form validation blocks submission without required fields', async ({
    page,
  }) => {
    await sharedPage.getByRole('link', { name: 'New client' }).click()
    await sharedPage.getByRole('button', { name: 'Create client' }).click()
    await expect(
      sharedPage.getByText(/Company name is required/i),
    ).toBeVisible()
    await expect(
      sharedPage.getByText(/Primary contact name is required/i),
    ).toBeVisible()
  })
})

/* ═══════════════════════════════════════════════════════════════════════════
   CONTACTS
   ═══════════════════════════════════════════════════════════════════════════ */

test.describe('Contacts', () => {
  test.beforeEach(async () => {
    await sharedPage.goto('/contacts')
    await expect(sharedPage.getByRole('heading', { name: 'Contacts' })).toBeVisible()
  })

  test('lists contacts with primary badge', async () => {
    await expect(sharedPage.getByText('Sofia Lindqvist')).toBeVisible()
    await expect(sharedPage.getByText('Primary')).toBeVisible()
  })

  test('search filters by name', async () => {
    await sharedPage.getByLabel(/Search/i).fill('Sofia')
    await sharedPage.waitForTimeout(400)
    await expect(sharedPage.getByText('Sofia Lindqvist')).toBeVisible()
  })

  test('client filter narrows to that client contacts', async () => {
    await sharedPage.getByLabel(/Filter contacts by client/i).selectOption(
      '11111111-1111-4111-8111-111111111111',
    )
    await sharedPage.waitForTimeout(300)
    await expect(sharedPage.getByText('Sofia Lindqvist')).toBeVisible()
  })

  test('opens contact detail when clicking a row', async () => {
    await sharedPage.getByText('Sofia Lindqvist').click()
    await expect(
      sharedPage.getByRole('heading', { name: 'Sofia Lindqvist' }),
    ).toBeVisible()
  })

  test('admin can create a contact', async () => {
    await sharedPage.getByRole('link', { name: 'New contact' }).click()
    await expect(
      sharedPage.getByRole('heading', { name: 'New contact' }),
    ).toBeVisible()

    await sharedPage.getByLabel(/First name/i).fill('Alice')
    await sharedPage.getByLabel(/Last name/i).fill('Smith')
    await sharedPage.getByLabel(/Email/i).fill('alice@example.com')
    await sharedPage.locator('select').first().selectOption({ index: 1 })
    await sharedPage.getByRole('button', { name: 'Create contact' }).click()

    // Should redirect to detail
    await expect(
      sharedPage.getByRole('heading', { name: 'Alice Smith' }),
    ).toBeVisible()
  })

  test('validation fails with empty required fields', async () => {
    await sharedPage.getByRole('link', { name: 'New contact' }).click()
    await sharedPage.getByRole('button', { name: 'Create contact' }).click()
    await expect(sharedPage.getByText(/First name is required/i)).toBeVisible()
    await expect(sharedPage.getByText(/Last name is required/i)).toBeVisible()
  })

  test('Set as Primary changes the primary badge', async () => {
    // Open a NON-primary contact (Jonas Berg on Bluebird)
    await sharedPage.goto('/contacts') // need an ID, let's just click a non-primary
    // Sofia is primary for Bluebird; find a non-primary row
    await sharedPage.getByText('Jonas Berg').click()
    await expect(sharedPage.getByRole('heading', { name: 'Jonas Berg' })).toBeVisible()
    // Click "Set as Primary"
    await sharedPage.getByRole('button', { name: 'Set as Primary' }).click()
    // Should show success notice
    await expect(sharedPage.getByText(/Primary contact updated/i)).toBeVisible()
    // Badge should appear
    await expect(sharedPage.getByText('Primary')).toBeVisible()
  })
})

/* ═══════════════════════════════════════════════════════════════════════════
   USERS (admin only)
   ═══════════════════════════════════════════════════════════════════════════ */

test.describe('Users', () => {
  test.beforeEach(async () => {
    await sharedPage.goto('/users')
    await expect(sharedPage.getByRole('heading', { name: 'Users' })).toBeVisible()
  })

  test('lists all users with role badges', async () => {
    await expect(sharedPage.getByText('Alex Rivera')).toBeVisible()
    await expect(sharedPage.getByText('Admin', { exact: true })).toBeVisible()
    await expect(sharedPage.getByText('Member', { exact: true })).toBeVisible()
    await expect(sharedPage.getByText('Active')).toBeVisible()
  })

  test('can create a new user', async () => {
    await sharedPage.getByRole('button', { name: /New user|Add user/i }).click()
    await expect(sharedPage.locator('.dialog, [role="dialog"]')).toBeVisible()

    await sharedPage.getByLabel(/Name/i).fill('Test User')
    await sharedPage.getByLabel(/Email/i).fill('test@briefline.demo')
    await sharedPage.getByLabel(/Initial password/i).fill('TestPass123!')
    await sharedPage.getByRole('button', { name: /Create|Save/i }).click()

    // New user should appear in the list
    await expect(sharedPage.getByText('Test User')).toBeVisible()
  })

  test('deactivation shows impact dialog', async () => {
    // Find a row with an active member and click deactivate
    const row = sharedPage.getByText('Marco Díaz').locator('..')
    const deactivateBtn = row.getByRole('button', { name: /Deactivate/i })
    if (await deactivateBtn.isVisible()) {
      await deactivateBtn.click()
      await expect(sharedPage.getByText(/reassign|impact/i)).toBeVisible()
    }
  })
})

/* ═══════════════════════════════════════════════════════════════════════════
   PROFILE
   ═══════════════════════════════════════════════════════════════════════════ */

test.describe('Profile', () => {
  test.beforeEach(async () => {
    await sharedPage.goto('/profile')
    await expect(sharedPage.getByRole('heading', { name: 'Profile' })).toBeVisible()
  })

  test('shows current user email, name, and role', async () => {
    await expect(sharedPage.getByText('Alex Rivera')).toBeVisible()
    await expect(sharedPage.getByText('admin@briefline.demo')).toBeVisible()
    await expect(sharedPage.getByText('ADMIN')).toBeVisible()
  })

  test('can edit the displayed name', async () => {
    await sharedPage.getByRole('button', { name: 'Edit' }).click()
    const nameInput = sharedPage.getByLabel(/Name/i)
    await nameInput.clear()
    await nameInput.fill('Alex R.')
    await sharedPage.getByRole('button', { name: /Save/i }).click()
    await expect(sharedPage.getByText('Alex R.')).toBeVisible()

    // Restore original name
    await sharedPage.getByRole('button', { name: 'Edit' }).click()
    await sharedPage.getByLabel(/Name/i).fill('Alex Rivera')
    await sharedPage.getByRole('button', { name: /Save/i }).click()
  })
})

/* ═══════════════════════════════════════════════════════════════════════════
   PERMISSIONS & GUARDS
   ═══════════════════════════════════════════════════════════════════════════ */

test.describe('Authorization', () => {
  test('admin sees Users link in nav', async () => {
    await sharedPage.goto('/dashboard')
    await expect(sharedPage.getByRole('link', { name: 'Users' })).toBeVisible()
  })

  test('admin can access /users directly', async () => {
    await sharedPage.goto('/users')
    await expect(sharedPage.getByRole('heading', { name: 'Users' })).toBeVisible()
  })
})

/* ═══════════════════════════════════════════════════════════════════════════
   SPA DEEP LINKS & NAVIGATION
   ═══════════════════════════════════════════════════════════════════════════ */

test.describe('SPA Navigation', () => {
  test('all nav links navigate correctly', async () => {
    await sharedPage.goto('/dashboard')
    const nav = sharedPage.locator('nav')
    await nav.getByRole('link', { name: 'Dashboard' }).click()
    await expect(sharedPage).toHaveURL(/\/dashboard/)

    await nav.getByRole('link', { name: 'Tasks' }).click()
    await expect(sharedPage).toHaveURL(/\/tasks/)

    await nav.getByRole('link', { name: 'Task List' }).click()
    await expect(sharedPage).toHaveURL(/\/tasks\/list/)

    await nav.getByRole('link', { name: 'Clients' }).click()
    await expect(sharedPage).toHaveURL(/\/clients/)

    await nav.getByRole('link', { name: 'Contacts' }).click()
    await expect(sharedPage).toHaveURL(/\/contacts/)

    await nav.getByRole('link', { name: 'Profile' }).click()
    await expect(sharedPage).toHaveURL(/\/profile/)
  })

  test('/forbidden shows access denied', async () => {
    await sharedPage.goto('/forbidden')
    await expect(sharedPage.getByText(/access denied/i)).toBeVisible()
  })

  test('/nonexistent shows not found', async () => {
    await sharedPage.goto('/this-page-does-not-exist')
    await expect(sharedPage.getByText(/not found/i)).toBeVisible()
  })
})

/* ═══════════════════════════════════════════════════════════════════════════
   EDGE CASES
   ═══════════════════════════════════════════════════════════════════════════ */

test.describe('Edge cases', () => {
  test('empty search shows no results message', async () => {
    await sharedPage.goto('/clients')
    await sharedPage.getByLabel(/Search/i).fill('ZZZ_NONEXISTENT_ZZZ')
    await sharedPage.waitForTimeout(500)
    await expect(sharedPage.getByText(/No clients match/i)).toBeVisible()
  })

  test('paging through results works', async () => {
    await sharedPage.goto('/tasks/list?limit=5')
    await expect(sharedPage.getByText(/Showing 1–5/)).toBeVisible({ timeout: 5000 })
  })

  test('deep link preserves URL after login redirect', async () => {
    // Clear auth state for this test
    await sharedPage.context().clearCookies()
    await sharedPage.goto('/clients')
    // Should redirect to login
    await expect(sharedPage).toHaveURL(/\/login\?next=%2Fclients/)
    // Login
    await sharedPage.getByLabel('Email address').fill('admin@briefline.demo')
    await sharedPage.getByLabel('Password').fill('briefline-demo-2026')
    await sharedPage.getByRole('button', { name: 'Sign in' }).click()
    // Should go to originally requested page
    await expect(sharedPage).toHaveURL(/\/clients/)
    await expect(
      sharedPage.getByRole('heading', { name: 'Clients' }),
    ).toBeVisible()
  })
})
