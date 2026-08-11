/*
 * FE-010 app shell — landmarks, skip link, role-based nav (admin sees Users,
 * member does not), and the user menu.
 */
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import userEvent from '@testing-library/user-event'
import { screen } from '@testing-library/react'
import { server } from '../src/mocks/server'
import { loginAs, renderApp, ADMIN_EMAIL, MEMBER_EMAIL, findByHeading } from './test-utils'

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  loginAs(null)
})
afterAll(() => server.close())

const NAV_LINKS = ['Dashboard', 'Tasks', 'Clients', 'Users', 'Profile']

describe('AppShell', () => {
  it('renders landmarks and the skip link', async () => {
    loginAs(ADMIN_EMAIL)
    renderApp({ initialPath: '/dashboard' })
    await findByHeading('Dashboard')

    expect(screen.getByRole('link', { name: 'Skip to main content' })).toBeInTheDocument()
    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()
    // App-wide live regions (a11y contract): loading skeletons also carry
    // role="status", so target the mounted live-region nodes directly.
    expect(document.querySelector('[data-live-region="status"]')).toBeInTheDocument()
    expect(document.querySelector('[data-live-region="alert"]')).toBeInTheDocument()
  })

  it('shows the full nav to an admin', async () => {
    loginAs(ADMIN_EMAIL)
    renderApp({ initialPath: '/dashboard' })
    await findByHeading('Dashboard')

    for (const label of NAV_LINKS) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument()
    }
  })

  it('hides the Users link for a member', async () => {
    loginAs(MEMBER_EMAIL)
    renderApp({ initialPath: '/dashboard' })
    await findByHeading('Dashboard')

    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Users' })).not.toBeInTheDocument()
  })

  it('marks the active nav link with aria-current', async () => {
    loginAs(ADMIN_EMAIL)
    renderApp({ initialPath: '/tasks' })
    await findByHeading('Tasks')

    const active = screen.getByRole('link', { name: 'Tasks' })
    expect(active).toHaveAttribute('aria-current', 'page')
  })

  it('signs out from the user menu and lands on /login', async () => {
    const user = userEvent.setup()
    loginAs(ADMIN_EMAIL)
    renderApp({ initialPath: '/dashboard' })
    await findByHeading('Dashboard')

    await user.click(screen.getByRole('button', { name: /alicia martin/i }))
    await user.click(screen.getByRole('menuitem', { name: /sign out/i }))

    expect(await screen.findByRole('heading', { name: 'Sign in' }, { timeout: 3000 })).toBeInTheDocument()
  })
})
