/*
 * FLOW-004 — full user journey (login-throttle-friendly).
 *
 * Logs in ONCE per role and reuses the authenticated page across tests.
 * Rate limit: 5 logins/min → each describe block does exactly 1 login.
 */
import { test, expect } from '@playwright/test'
import { loginAs, reseedDatabase, ADMIN_EMAIL, MEMBER_EMAIL } from './helpers'

test.describe('FLOW-004 full user journey', () => {
  test.beforeAll(async () => {
    reseedDatabase()
  })

  test.describe('Login form', () => {
    test('logs in with correct credentials and lands on dashboard', async ({
      page,
    }) => {
      await page.goto('/login')
      await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()

      await page.getByLabel('Email address').fill('admin@briefline.demo')
      await page.getByLabel('Password').fill('briefline-demo-2026')
      await page.getByRole('button', { name: 'Sign in' }).click()

      await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 })
      await expect(
        page.getByRole('heading', { name: 'Dashboard' }),
      ).toBeVisible()
    })

    test('shows error with wrong credentials and stays on login', async ({
      page,
    }) => {
      await page.goto('/login')
      await page.getByLabel('Email address').fill('wrong@email.com')
      await page.getByLabel('Password').fill('wrong')
      await page.getByRole('button', { name: 'Sign in' }).click()

      await expect(
        page.getByText(/email or password is incorrect/i),
      ).toBeVisible()
      // Must NOT redirect to an API URL
      await expect(page).not.toHaveURL(/\/api\//)
      await expect(page).toHaveURL(/\/login/)
    })

    test('demo account buttons fill and login works', async ({ page }) => {
      await page.goto('/login')
      await page.getByRole('button', { name: /Admin/ }).click()

      await expect(page.getByLabel('Email address')).toHaveValue(
        'admin@briefline.demo',
      )
      await expect(page.getByLabel('Password')).toHaveValue(
        'briefline-demo-2026',
      )

      await page.getByRole('button', { name: 'Sign in' }).click()
      await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 })
    })
  })

  test.describe('Admin journey (single login)', () => {
    // One login for all admin tests — respects rate limit
    test.beforeAll(async ({ browser }) => {
      const page = await browser.newPage()
      await loginAs(page, ADMIN_EMAIL)
      await page.close()
    })

    test('dashboard shows KPIs', async ({ page }) => {
      await page.goto('/dashboard')
      await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
      await expect(page.getByText('Open')).toBeVisible()
      await expect(page.getByText('Blocked')).toBeVisible()
    })

    test('board renders task columns', async ({ page }) => {
      await page.goto('/tasks')
      await expect(page.getByRole('heading', { name: 'Tasks' })).toBeVisible()
      await expect(page.getByText('Backlog')).toBeVisible()
    })

    test('task list shows sortable table', async ({ page }) => {
      await page.goto('/tasks/list')
      await expect(page.getByRole('heading', { name: 'Tasks' })).toBeVisible()
      await expect(
        page.getByRole('columnheader', { name: 'Title' }),
      ).toBeVisible()
    })

    test('clients list renders', async ({ page }) => {
      await page.goto('/clients')
      await expect(
        page.getByRole('heading', { name: 'Clients' }),
      ).toBeVisible()
      await expect(page.getByRole('table', { name: 'Clients' })).toBeVisible()
    })

    test('contacts list renders', async ({ page }) => {
      await page.goto('/contacts')
      await expect(
        page.getByRole('heading', { name: 'Contacts' }),
      ).toBeVisible()
    })

    test('users page is accessible for admin', async ({ page }) => {
      await page.goto('/users')
      await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible()
    })

    test('profile page is accessible', async ({ page }) => {
      await page.goto('/profile')
      await expect(
        page.getByRole('heading', { name: 'Profile' }),
      ).toBeVisible()
    })
  })

  test.describe('Member journey (single login)', () => {
    test.beforeAll(async ({ browser }) => {
      const page = await browser.newPage()
      await loginAs(page, MEMBER_EMAIL)
      await page.close()
    })

    test('dashboard shows member tasks', async ({ page }) => {
      await page.goto('/dashboard')
      await expect(page.getByText('My Tasks')).toBeVisible()
    })

    test('member does NOT see Users link', async ({ page }) => {
      await page.goto('/dashboard')
      await expect(
        page.getByRole('link', { name: 'Users' }),
      ).not.toBeVisible()
    })

    test('member gets forbidden on /users', async ({ page }) => {
      await page.goto('/users')
      await expect(page.getByText(/access denied/i)).toBeVisible()
    })

    test('member can view board', async ({ page }) => {
      await page.goto('/tasks')
      await expect(page.getByRole('heading', { name: 'Tasks' })).toBeVisible()
    })

    test('member cannot edit clients', async ({ page }) => {
      await page.goto('/clients')
      await expect(
        page.getByRole('button', { name: 'Edit' }),
      ).not.toBeVisible()
    })
  })

  test.describe('SPA deep links', () => {
    test('unauthenticated /clients redirects to login with next param', async ({
      page,
    }) => {
      await page.goto('/clients')
      await expect(page).toHaveURL(/\/login\?next=%2Fclients/)

      // Login and verify we go to /clients, not an API route
      await page.getByLabel('Email address').fill('admin@briefline.demo')
      await page.getByLabel('Password').fill('briefline-demo-2026')
      await page.getByRole('button', { name: 'Sign in' }).click()

      await expect(page).toHaveURL(/\/clients/)
      await expect(
        page.getByRole('heading', { name: 'Clients' }),
      ).toBeVisible()
    })
  })
})
