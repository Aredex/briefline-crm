/*
 * FE-010 accessibility — axe scans of the shell (authenticated) and the login
 * page. Only serious/critical violations fail the suite; jsdom cannot measure
 * layout-dependent checks (color-contrast etc.), which axe reports as
 * "incomplete", never as violations.
 */
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import { screen } from '@testing-library/react'
import axe from 'axe-core'
import { server } from '../src/mocks/server'
import { loginAs, renderApp, ADMIN_EMAIL, findByHeading } from './test-utils'

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  loginAs(null)
})
afterAll(() => server.close())

async function expectNoSeriousViolations(container: HTMLElement) {
  const results = await axe.run(container)
  // a11y-exclusion color-contrast: layout-dependent, jsdom reports incomplete
  const violations = results.violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical',
  )
  expect(violations).toEqual([])
}

describe('Accessibility', () => {
  it('passes the axe scan on the signed-in app shell (dashboard)', async () => {
    loginAs(ADMIN_EMAIL)
    const { container } = renderApp({ initialPath: '/dashboard' })
    await findByHeading('Dashboard')

    await expectNoSeriousViolations(container)
  })

  it('passes the axe scan on the login page', async () => {
    loginAs(null)
    const { container } = renderApp({ initialPath: '/login' })
    await screen.findByRole('heading', { name: 'Sign in' }, { timeout: 3000 })

    await expectNoSeriousViolations(container)
  })
})
