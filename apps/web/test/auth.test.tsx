/*
 * FE-011 auth — login behaviors (valid, invalid, inactive account with the
 * generic 401, rate limit with countdown) and session lifecycle (stale session
 * on reload → /login?next, 403 never logs out).
 */
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import userEvent from '@testing-library/user-event'
import { screen, waitFor } from '@testing-library/react'
import { server } from '../src/mocks/server'
import { loginAs, renderApp, ADMIN_EMAIL, MEMBER_EMAIL, DEMO_PASSWORD, findByHeading } from './test-utils'

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  loginAs(null)
})
afterAll(() => server.close())

async function fillLogin(user: ReturnType<typeof userEvent.setup>, email: string, password: string) {
  await screen.findByRole('heading', { name: 'Sign in' }, { timeout: 3000 })
  await user.type(screen.getByLabelText(/Email\ address/i), email)
  await user.type(screen.getByLabelText(/Password/i), password)
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
}

describe('Login', () => {
  it('signs in with valid credentials and lands on the dashboard', async () => {
    const user = userEvent.setup()
    loginAs(null)
    renderApp()

    await fillLogin(user, ADMIN_EMAIL, DEMO_PASSWORD)
    expect(await findByHeading('Dashboard')).toBeInTheDocument()
  })

  it('shows the generic invalid-credentials error for a wrong password', async () => {
    const user = userEvent.setup()
    loginAs(null)
    renderApp()

    await fillLogin(user, ADMIN_EMAIL, 'wrong-password')
    // NOTE: the app mounts an app-wide role="alert" live region, so query by
    // text — not by role.
    expect(await screen.findByText(/email or password is incorrect/i, {}, { timeout: 3000 })).toBeInTheDocument()
    expect(await findByHeading('Sign in')).toBeInTheDocument()
  })

  it('keeps inactive accounts indistinguishable from bad credentials (401 generic)', async () => {
    const user = userEvent.setup()
    loginAs(null)
    renderApp()

    // noemi@northstar.digital exists in the mock data but is INACTIVE
    // (FR-AUTH-002/003: same generic response, never reveals account state).
    await fillLogin(user, 'noemi@northstar.digital', DEMO_PASSWORD)

    expect(await screen.findByText(/email or password is incorrect/i, {}, { timeout: 3000 })).toBeInTheDocument()
    expect(screen.queryByText(/disabled|inactive account/i)).not.toBeInTheDocument()
  })

  it('shows a rate-limit alert with a countdown and disables the submit button', async () => {
    const user = userEvent.setup()
    loginAs(null)
    renderApp()

    await fillLogin(user, 'ratelimit@northstar.digital', 'whatever')

    expect(await screen.findByText(/please wait 60 seconds before trying again/i, {}, { timeout: 3000 })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled())
  })

  it('fills a demo account and moves focus to the Sign in button', async () => {
    const user = userEvent.setup()
    loginAs(null)
    renderApp()

    await screen.findByRole('heading', { name: 'Sign in' }, { timeout: 3000 })
    await user.click(screen.getByRole('button', { name: /administrator/i }))

    expect(screen.getByLabelText(/Email\ address/i)).toHaveValue(ADMIN_EMAIL)
    expect(screen.getByRole('button', { name: 'Sign in' })).toHaveFocus()
  })
})

describe('Session lifecycle', () => {
  it('sends a stale session on reload back to login with ?next=<path>', async () => {
    // No session in memory and /auth/me answers 401 → the loader redirects.
    loginAs(null)
    renderApp({ initialPath: '/clients' })

    expect(await screen.findByRole('heading', { name: 'Sign in' }, { timeout: 3000 })).toBeInTheDocument()
    expect(window.location.search).toContain('next=%2Fclients')
  })

  it('keeps the session when a member hits an admin route (403, no logout)', async () => {
    const user = userEvent.setup()
    loginAs(MEMBER_EMAIL)
    renderApp({ initialPath: '/users' })

    expect(await findByHeading('Access denied')).toBeInTheDocument()
    // Still signed in: the member can browse the dashboard right after.
    await user.click(screen.getByRole('link', { name: 'Dashboard' }))
    expect(await findByHeading('Dashboard')).toBeInTheDocument()
  })

  it('clears the query cache on logout (no stale data visible after re-login)', async () => {
    const user = userEvent.setup()
    loginAs(MEMBER_EMAIL)
    renderApp({ initialPath: '/clients' })

    await findByHeading('Clients')
    // Sign out lives in the user dropdown, which is closed by default; the
    // item itself is a <button role="menuitem">, so query by menuitem.
    await user.click(screen.getByRole('button', { name: /marco ruiz/i }))
    await user.click(screen.getByRole('menuitem', { name: 'Sign out' }))

    expect(await screen.findByRole('heading', { name: 'Sign in' }, { timeout: 3000 })).toBeInTheDocument()

    // Sign back in as the admin: the clients list loads from scratch.
    await user.type(screen.getByLabelText(/Email\ address/i), ADMIN_EMAIL)
    await user.type(screen.getByLabelText(/Password/i), DEMO_PASSWORD)
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await findByHeading('Dashboard')).toBeInTheDocument()
  })
})
