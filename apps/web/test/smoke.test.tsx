/*
 * FE-010 smoke — the full App mounts without crashing, boots the session, and
 * renders the login screen for an unauthenticated user hitting a protected
 * route (signed out /dashboard redirects to /login); the sign-in flow lands on
 * the dashboard.
 */
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import userEvent from '@testing-library/user-event'
import { screen, waitFor } from '@testing-library/react'
import { server } from '../src/mocks/server'
import { loginAs, renderApp, ADMIN_EMAIL, DEMO_PASSWORD } from './test-utils'

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  loginAs(null)
})
afterAll(() => server.close())

describe('App smoke', () => {
  it('renders without crashing and shows the login screen when signed out', async () => {
    loginAs(null)
    // / is the public Landing; the login screen is reached via a protected
    // route (signed out /dashboard redirects to /login?next=%2Fdashboard).
    renderApp({ initialPath: '/dashboard' })

    expect(await screen.findByRole('heading', { name: 'Sign in' }, { timeout: 3000 })).toBeInTheDocument()
    expect(screen.getByLabelText(/Email\ address/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Password/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('redirects a signed-in user from /login to the dashboard', async () => {
    loginAs(ADMIN_EMAIL)
    renderApp({ initialPath: '/login' })

    expect(await screen.findByRole('heading', { name: 'Dashboard' }, { timeout: 3000 })).toBeInTheDocument()
  })

  it('signs in with demo credentials and reaches the dashboard', async () => {
    const user = userEvent.setup()
    loginAs(null)
    renderApp({ initialPath: '/dashboard' })

    await screen.findByRole('heading', { name: 'Sign in' }, { timeout: 3000 })
    await user.type(screen.getByLabelText(/Email\ address/i), ADMIN_EMAIL)
    await user.type(screen.getByLabelText(/Password/i), DEMO_PASSWORD)
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('heading', { name: 'Dashboard' }, { timeout: 3000 })).toBeInTheDocument()
  })

  it('shows a generic error for invalid credentials', async () => {
    const user = userEvent.setup()
    loginAs(null)
    renderApp({ initialPath: '/dashboard' })

    await screen.findByRole('heading', { name: 'Sign in' }, { timeout: 3000 })
    await user.type(screen.getByLabelText(/Email\ address/i), 'nobody@northstar.digital')
    await user.type(screen.getByLabelText(/Password/i), 'wrong-password')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    // NOTE: the app mounts an app-wide role="alert" live region, so query by
    // text — not by role.
    expect(
      await screen.findByText(/email or password is incorrect/i, {}, { timeout: 3000 }),
    ).toBeInTheDocument()
  })

  it('shows a rate-limit alert with a countdown', async () => {
    const user = userEvent.setup()
    loginAs(null)
    renderApp({ initialPath: '/dashboard' })

    await screen.findByRole('heading', { name: 'Sign in' }, { timeout: 3000 })
    await user.type(screen.getByLabelText(/Email\ address/i), 'ratelimit@northstar.digital')
    await user.type(screen.getByLabelText(/Password/i), 'whatever')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText(/too many attempts/i, {}, { timeout: 3000 })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled())
  })
})
