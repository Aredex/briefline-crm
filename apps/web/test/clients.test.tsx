/*
 * FE-011 clients — list (search + status filter + result count), role-based
 * actions (admin vs member), create with validation, edit drawer, archive
 * flow (incl. the 409 already-archived race), and archived-invisible-to-member.
 */
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import userEvent from '@testing-library/user-event'
import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '../src/mocks/server'
import { API_PREFIX } from '../src/api/client'
import { loginAs, renderApp, ADMIN_EMAIL, MEMBER_EMAIL, findByHeading } from './test-utils'

const BLUEBIRD_ID = '33333333-3333-4333-8333-333333333333'
const ARCHIVED_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  loginAs(null)
})
afterAll(() => server.close())

async function openClients(user: ReturnType<typeof userEvent.setup>, email = ADMIN_EMAIL) {
  loginAs(email)
  renderApp({ initialPath: '/clients' })
  await findByHeading('Clients')
  // The <h1> paints with the skeleton row; the data table arrives with the
  // query, so wait for it before any synchronous row lookup.
  await screen.findByRole('table', { name: 'Clients' })
  return user
}

describe('Client list', () => {
  it('lists clients for an admin with actions and the result count', async () => {
    const user = userEvent.setup()
    await openClients(user)

    const table = screen.getByRole('table', { name: 'Clients' })
    expect(within(table).getByText('Bluebird Coffee Co.')).toBeInTheDocument()
    expect(within(table).getByText('Vela Analytics')).toBeInTheDocument()
    expect(within(table).getByText('Nimbus Hosting')).toBeInTheDocument()
    // Archived clients are excluded by default.
    expect(within(table).queryByText('Sunrise Textiles')).not.toBeInTheDocument()
    expect(screen.getByText('Showing 1–3 of 3 clients')).toBeInTheDocument()

    // Admin sees Edit/Archive/Deactivate per row.
    expect(within(table).getAllByRole('button', { name: 'Edit' })).toHaveLength(3)
    expect(within(table).getAllByRole('button', { name: 'Archive' })).toHaveLength(3)
    expect(within(table).getAllByRole('button', { name: 'Deactivate' })).toHaveLength(2)
  })

  it('renders clients read-only for a member (no actions, no archived filter)', async () => {
    const user = userEvent.setup()
    await openClients(user, MEMBER_EMAIL)

    const table = screen.getByRole('table', { name: 'Clients' })
    expect(within(table).getByText('Bluebird Coffee Co.')).toBeInTheDocument()
    expect(screen.getByText('Showing 1–3 of 3 clients')).toBeInTheDocument()

    expect(within(table).queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    expect(within(table).queryByRole('button', { name: 'Archive' })).not.toBeInTheDocument()
    // Members never receive the Archived filter option.
    expect(screen.queryByRole('option', { name: 'Archived' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New client' })).toBeInTheDocument()
  })

  it('filters by search after the debounce', async () => {
    const user = userEvent.setup()
    await openClients(user)

    await user.type(screen.getByLabelText(/Search\ clients/i), 'bluebird')

    expect(await screen.findByText('Showing 1–1 of 1 clients')).toBeInTheDocument()
    const table = screen.getByRole('table', { name: 'Clients' })
    expect(within(table).getByText('Bluebird Coffee Co.')).toBeInTheDocument()
    expect(within(table).queryByText('Vela Analytics')).not.toBeInTheDocument()
  })

  it('shows an empty state when the search matches nothing', async () => {
    const user = userEvent.setup()
    await openClients(user)

    await user.type(screen.getByLabelText(/Search\ clients/i), 'zzz-nothing')

    expect(await screen.findByText('No clients match your filters')).toBeInTheDocument()
    expect(screen.getByText('No clients match your search.')).toBeInTheDocument()
  })

  it('lets an admin filter by status, including archived', async () => {
    const user = userEvent.setup()
    await openClients(user)

    await user.selectOptions(screen.getByLabelText(/Status\ filter/i), 'ARCHIVED')

    // The desktop table and the mobile cards both render (CSS picks which is
    // visible), so Sunrise appears twice — scope to the table.
    const table = screen.getByRole('table', { name: 'Clients' })
    expect(await within(table).findByText('Sunrise Textiles')).toBeInTheDocument()
    expect(screen.getByText('Showing 1–1 of 1 clients')).toBeInTheDocument()
  })
})

describe('Client create', () => {
  it('creates a client as a member and redirects to its detail with a success announcement', async () => {
    const user = userEvent.setup()
    loginAs(MEMBER_EMAIL)
    renderApp({ initialPath: '/clients/new' })

    await findByHeading('New client')
    await user.type(screen.getByLabelText(/Company\ name/i), 'Acme Widgets')
    await user.type(screen.getByLabelText(/Primary\ contact\ name/i), 'Jane Doe')
    await user.type(screen.getByLabelText(/Primary\ contact\ email/i), 'jane@acme.example')
    await user.click(screen.getByRole('button', { name: 'Create client' }))

    expect(await findByHeading('Acme Widgets')).toBeInTheDocument()
    expect(await screen.findByText('Client created.')).toBeInTheDocument()
  })

  it('blocks submission when required fields are missing (inline errors)', async () => {
    const user = userEvent.setup()
    loginAs(MEMBER_EMAIL)
    renderApp({ initialPath: '/clients/new' })

    await findByHeading('New client')
    await user.click(screen.getByRole('button', { name: 'Create client' }))

    // NOTE: app-wide live region with role="alert" — assert by text.
    expect(await screen.findByText('Company name is required.')).toBeInTheDocument()
    expect(screen.getByText('Primary contact name is required.')).toBeInTheDocument()
    expect(screen.getByText('Primary contact email is required.')).toBeInTheDocument()
    expect(await findByHeading('New client')).toBeInTheDocument()
  })
})

describe('Client edit (admin)', () => {
  it('updates a client from the edit drawer and announces the change', async () => {
    const user = userEvent.setup()
    await openClients(user)

    const bluebirdRow = within(screen.getByRole('table', { name: 'Clients' }))
      .getAllByRole('row')
      .find((row) => within(row).queryByText('Bluebird Coffee Co.'))
    expect(bluebirdRow).toBeTruthy()
    await user.click(within(bluebirdRow as HTMLElement).getByRole('button', { name: 'Edit' }))

    const drawer = screen.getByRole('complementary', { name: 'Edit Bluebird Coffee Co.' })
    const phone = within(drawer).getByLabelText(/Phone/i)
    await user.clear(phone)
    await user.type(phone, '+34 600 999 999')
    await user.click(within(drawer).getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Client updated.')).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.queryByRole('complementary', { name: 'Edit Bluebird Coffee Co.' })).not.toBeInTheDocument(),
    )
  })

  it('archives a client after confirmation (409 already-archived surfaces as a banner)', async () => {
    const user = userEvent.setup()
    await openClients(user)

    // Archive Bluebird.
    const bluebirdRow = within(screen.getByRole('table', { name: 'Clients' }))
      .getAllByRole('row')
      .find((row) => within(row).queryByText('Bluebird Coffee Co.'))
    await user.click(within(bluebirdRow as HTMLElement).getByRole('button', { name: 'Archive' }))

    const archiveDialog = screen.getByRole('dialog', { name: 'Archive Bluebird Coffee Co.?' })
    expect(archiveDialog).toBeInTheDocument()
    expect(screen.getByText('No new tasks can be linked to an archived client.')).toBeInTheDocument()
    // The row action and the dialog confirm share the name "Archive" — scope it.
    await user.click(within(archiveDialog).getByRole('button', { name: 'Archive' }))

    expect(await screen.findByText('Client archived.')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('Bluebird Coffee Co.')).not.toBeInTheDocument())
    // The list refetch (invalidation) is async — wait for the new count.
    expect(await screen.findByText('Showing 1–2 of 2 clients')).toBeInTheDocument()

    // Race: the client is already archived server-side → 409 CLIENT_ARCHIVED.
    server.use(
      http.post(`${API_PREFIX}/clients/:clientId/archive`, () =>
        HttpResponse.json(
          {
            type: 'https://api.briefline.example/problems/client_archived',
            title: 'Client archived',
            status: 409,
            detail: 'This client is already archived.',
            code: 'CLIENT_ARCHIVED',
          },
          { status: 409, headers: { 'Content-Type': 'application/problem+json' } },
        ),
      ),
    )
    const velaRow = within(screen.getByRole('table', { name: 'Clients' }))
      .getAllByRole('row')
      .find((row) => within(row).queryByText('Vela Analytics'))
    await user.click(within(velaRow as HTMLElement).getByRole('button', { name: 'Archive' }))
    const velaDialog = screen.getByRole('dialog', { name: 'Archive Vela Analytics?' })
    await user.click(within(velaDialog).getByRole('button', { name: 'Archive' }))

    expect(await screen.findByText(/already archived/i)).toBeInTheDocument()
  })
})

describe('Client detail', () => {
  it('hides archived clients from members (404)', async () => {
    loginAs(MEMBER_EMAIL)
    renderApp({ initialPath: `/clients/${ARCHIVED_ID}` })

    expect(await findByHeading('Client not found')).toBeInTheDocument()
  })

  it('renders read-only for a member and shows the archived banner to admins', async () => {
    const user = userEvent.setup()
    loginAs(MEMBER_EMAIL)
    renderApp({ initialPath: `/clients/${BLUEBIRD_ID}` })

    expect(await findByHeading('Bluebird Coffee Co.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Archive' })).not.toBeInTheDocument()
    expect(screen.getByText('Sofia Lindqvist')).toBeInTheDocument()
    expect(screen.getByText('Redesign onboarding flow')).toBeInTheDocument()

    // Now as admin: actions + archived banner on an archived client.
    loginAs(ADMIN_EMAIL)
    renderApp({ initialPath: `/clients/${ARCHIVED_ID}` })

    expect(await findByHeading('Sunrise Textiles')).toBeInTheDocument()
    expect(screen.getByText('This client is archived and read-only.')).toBeInTheDocument()
    expect(screen.getByText("It can't be linked to new tasks.")).toBeInTheDocument()
    // No edit actions on an archived client.
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Archive' })).not.toBeInTheDocument()
  })
})
