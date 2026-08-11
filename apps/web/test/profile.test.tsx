/*
 * FE-011 profile — PROF-FE-001: name is editable, email is read-only, the role
 * badge renders as read-only information, and a successful save announces
 * "Profile updated." and updates the session (shell header reacts).
 */
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import userEvent from '@testing-library/user-event'
import { screen } from '@testing-library/react'
import { server } from '../src/mocks/server'
import { loginAs, renderApp, ADMIN_EMAIL, findByHeading } from './test-utils'

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  loginAs(null)
})
afterAll(() => server.close())

describe('Profile', () => {
  it('renders the profile with the name editable and email/role read-only', async () => {
    loginAs(ADMIN_EMAIL)
    renderApp({ initialPath: '/profile' })

    expect(await findByHeading('Profile')).toBeInTheDocument()

    const name = screen.getByLabelText(/Name/i)
    expect(name).toHaveValue('Alicia Martin')
    expect(name).toBeEnabled()

    const email = screen.getByLabelText(/Email\ address/i)
    expect(email).toHaveValue(ADMIN_EMAIL)
    expect(email).toBeDisabled()

    expect(screen.getByText('Admin')).toBeInTheDocument()
  })

  it('updates the name and reflects it in the session (header + announcement)', async () => {
    const user = userEvent.setup()
    loginAs(ADMIN_EMAIL)
    renderApp({ initialPath: '/profile' })

    await findByHeading('Profile')
    await user.clear(screen.getByLabelText(/Name/i))
    await user.type(screen.getByLabelText(/Name/i), 'Alicia Martin Jr.')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Profile updated.')).toBeInTheDocument()
    // The shell header reads from the session store, which was refreshed.
    expect(await screen.findByText('Alicia Martin Jr.')).toBeInTheDocument()
  })

  it('blocks saving an empty name with an inline error', async () => {
    const user = userEvent.setup()
    loginAs(ADMIN_EMAIL)
    renderApp({ initialPath: '/profile' })

    await findByHeading('Profile')
    await user.clear(screen.getByLabelText(/Name/i))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    // NOTE: app-wide live region with role="alert" — assert by text.
    expect(await screen.findByText('Name is required.')).toBeInTheDocument()
    expect(await findByHeading('Profile')).toBeInTheDocument()
  })
})
