/*
 * FE-011 users — member is blocked (403), admin CRUD flows: list, create with
 * a one-time password (never redisplayed), duplicate email as a field error,
 * deactivation impact + reassignment, and the last-active-administrator guard
 * (client-side banner + disabled confirm; API keeps the 409 as backstop).
 *
 * NOTE: mock mutations persist inside this file, so the tests run in order and
 * the last-admin scenario runs before any test creates an extra ADMIN.
 */
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import userEvent from '@testing-library/user-event'
import { screen, waitFor, within } from '@testing-library/react'
import { server } from '../src/mocks/server'
import { loginAs, renderApp, ADMIN_EMAIL, MEMBER_EMAIL, findByHeading } from './test-utils'

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  loginAs(null)
})
afterAll(() => server.close())

async function openUsers(user: ReturnType<typeof userEvent.setup>, email = ADMIN_EMAIL) {
  loginAs(email)
  renderApp({ initialPath: '/users' })
  await findByHeading('Users')
  // The <h1> paints with the skeleton rows; the data table arrives with the
  // query, so wait for it before any synchronous row lookup.
  await screen.findByRole('table', { name: 'Users' })
  return user
}

function rowOf(table: HTMLElement, text: string): HTMLElement {
  const row = within(table)
    .getAllByRole('row')
    .find((candidate) => within(candidate).queryByText(text))
  if (!row) throw new Error(`Row with "${text}" not found`)
  return row
}

describe('User management', () => {
  it('keeps /users out of reach for a member (403, still signed in)', async () => {
    loginAs(MEMBER_EMAIL)
    renderApp({ initialPath: '/users' })

    expect(await findByHeading('Access denied')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument()
  })

  it('lists all users with role/status badges for an admin', async () => {
    const user = userEvent.setup()
    await openUsers(user)

    const table = screen.getByRole('table', { name: 'Users' })
    expect(within(table).getByText('Alicia Martin')).toBeInTheDocument()
    expect(within(table).getByText('Marco Ruiz')).toBeInTheDocument()
    expect(within(table).getByText('Maria Kim')).toBeInTheDocument()
    expect(within(table).getByText('Noemi Torres')).toBeInTheDocument()
    expect(screen.getByText('Showing 1–4 of 4 users')).toBeInTheDocument()

    expect(within(table).getAllByRole('button', { name: 'Edit' })).toHaveLength(4)
    // Only the INACTIVE user gets Activate.
    expect(within(table).getAllByRole('button', { name: 'Activate' })).toHaveLength(1)
    expect(within(table).getAllByRole('button', { name: 'Deactivate' })).toHaveLength(3)
    expect(within(rowOf(table, 'Noemi Torres')).getByText('Inactive')).toBeInTheDocument()
  })

  it('blocks deactivating the last active administrator (banner + disabled confirm)', async () => {
    const user = userEvent.setup()
    await openUsers(user)

    const table = screen.getByRole('table', { name: 'Users' })
    await user.click(within(rowOf(table, 'Alicia Martin')).getByRole('button', { name: 'Deactivate' }))

    const dialog = screen.getByRole('dialog', { name: 'Deactivate Alicia Martin?' })
    expect(
      within(dialog).getByText("You can't deactivate the last active administrator."),
    ).toBeInTheDocument()
    // Alicia has active assigned tasks, so the confirm label is the reassign
    // variant — it must still be disabled while she is the last admin.
    expect(within(dialog).getByRole('button', { name: 'Deactivate & reassign' })).toBeDisabled()

    // The edit dialog also disables the role select for the last admin.
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await user.click(within(rowOf(table, 'Alicia Martin')).getByRole('button', { name: 'Edit' }))

    const editDialog = screen.getByRole('dialog', { name: 'Edit Alicia Martin' })
    expect(within(editDialog).getByText('Last active administrator')).toBeInTheDocument()
    expect(within(editDialog).getByLabelText(/Role/i)).toBeDisabled()
  })

  it('creates a user without ever redisplaying the initial password', async () => {
    const user = userEvent.setup()
    await openUsers(user)

    await user.click(screen.getByRole('button', { name: 'New user' }))
    const dialog = screen.getByRole('dialog', { name: 'New user' })

    await user.type(within(dialog).getByLabelText(/Name/i), 'Jordan Lee')
    await user.type(within(dialog).getByLabelText(/Email\ address/i), 'jordan.lee@northstar.digital')
    await user.type(within(dialog).getByLabelText(/Initial\ password/i), 'S3curePass123!')
    await user.click(within(dialog).getByRole('button', { name: 'Create user' }))

    expect(await screen.findByText('Jordan Lee created.')).toBeInTheDocument()
    // The desktop table and the mobile cards both render (CSS picks which is
    // visible), so scope to the table.
    const table = screen.getByRole('table', { name: 'Users' })
    expect(await within(table).findByText('Jordan Lee')).toBeInTheDocument()
    // The one-time password is never shown again anywhere in the UI.
    expect(screen.queryByText('S3curePass123!')).not.toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New user' })).not.toBeInTheDocument())
  })

  it('shows a duplicate email as an inline field error and keeps the dialog open', async () => {
    const user = userEvent.setup()
    await openUsers(user)

    await user.click(screen.getByRole('button', { name: 'New user' }))
    const dialog = screen.getByRole('dialog', { name: 'New user' })

    await user.type(within(dialog).getByLabelText(/Name/i), 'Duplicate Person')
    await user.type(within(dialog).getByLabelText(/Email\ address/i), 'maria.kim@northstar.digital')
    await user.type(within(dialog).getByLabelText(/Initial\ password/i), 'S3curePass123!')
    await user.click(within(dialog).getByRole('button', { name: 'Create user' }))

    expect(
      await screen.findByText('A user with this email already exists.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'New user' })).toBeInTheDocument()
  })

  it('deactivates a user with active tasks only after reassignment', async () => {
    const user = userEvent.setup()
    await openUsers(user)

    const table = screen.getByRole('table', { name: 'Users' })
    await user.click(within(rowOf(table, 'Marco Ruiz')).getByRole('button', { name: 'Deactivate' }))

    const dialog = screen.getByRole('dialog', { name: 'Deactivate Marco Ruiz?' })
    expect(await within(dialog).findByText('Active tasks need reassignment')).toBeInTheDocument()
    // The fixture assigns Marco two active tasks.
    expect(within(dialog).getByText('Renew hosting certificate')).toBeInTheDocument()
    expect(within(dialog).getByText('Q3 email campaign')).toBeInTheDocument()
    // A reassignment select is prefilled per task.
    expect(within(dialog).getAllByRole('combobox')).toHaveLength(2)

    await user.click(within(dialog).getByRole('button', { name: 'Deactivate & reassign' }))

    expect(await screen.findByText('Marco Ruiz deactivated.')).toBeInTheDocument()
    expect(within(rowOf(table, 'Marco Ruiz')).getByText('Inactive')).toBeInTheDocument()
  })

  it('requires explicit confirmation when demoting an administrator to member', async () => {
    const user = userEvent.setup()
    await openUsers(user)

    // First: promote a second admin so the demotion is allowed.
    await user.click(screen.getByRole('button', { name: 'New user' }))
    let dialog = screen.getByRole('dialog', { name: 'New user' })
    await user.type(within(dialog).getByLabelText(/Name/i), 'Ravi Patel')
    await user.type(within(dialog).getByLabelText(/Email\ address/i), 'ravi@northstar.digital')
    await user.type(within(dialog).getByLabelText(/Initial\ password/i), 'S3curePass123!')
    await user.selectOptions(within(dialog).getByLabelText(/Role/i), 'ADMIN')
    await user.click(within(dialog).getByRole('button', { name: 'Create user' }))
    expect(await screen.findByText('Ravi Patel created.')).toBeInTheDocument()

    // Now demote them: the save is parked behind a confirmation dialog.
    const table = screen.getByRole('table', { name: 'Users' })
    await user.click(within(rowOf(table, 'Ravi Patel')).getByRole('button', { name: 'Edit' }))
    dialog = screen.getByRole('dialog', { name: 'Edit Ravi Patel' })
    await user.selectOptions(within(dialog).getByLabelText(/Role/i), 'MEMBER')
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))

    const confirm = screen.getByRole('dialog', { name: 'Demote Ravi Patel?' })
    expect(confirm).toBeInTheDocument()
    await user.click(within(confirm).getByRole('button', { name: 'Demote' }))

    expect(await screen.findByText('Ravi Patel demoted to member.')).toBeInTheDocument()
    expect(within(rowOf(table, 'Ravi Patel')).getByText('Member')).toBeInTheDocument()
  })
})
