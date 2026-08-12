/*
 * PC-01 contacts — list (search + client filter + primary filter + result
 * count), role-based actions (admin vs member), create with validation,
 * edit prefill + update, the primary transition, member 403 gating and the
 * network-error state.
 */
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import userEvent from '@testing-library/user-event'
import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '../src/mocks/server'
import { API_PREFIX } from '../src/api/client'
import { loginAs, renderApp, ADMIN_EMAIL, MEMBER_EMAIL, findByHeading } from './test-utils'

const SOFIA_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const JONAS_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const BLUEBIRD_ID = '33333333-3333-4333-8333-333333333333'

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  loginAs(null)
})
afterAll(() => server.close())

async function openContacts(user: ReturnType<typeof userEvent.setup>, email = ADMIN_EMAIL) {
  loginAs(email)
  renderApp({ initialPath: '/contacts' })
  await findByHeading('Contacts')
  // The <h1> paints with the skeleton row; the data table arrives with the
  // query, so wait for it before any synchronous row lookup.
  await screen.findByRole('table', { name: 'Contacts' })
  return user
}

describe('Contact list', () => {
  it('lists contacts with the primary badge and the result count', async () => {
    const user = userEvent.setup()
    await openContacts(user)

    const table = screen.getByRole('table', { name: 'Contacts' })
    expect(within(table).getByText('Sofia Lindqvist')).toBeInTheDocument()
    expect(within(table).getByText('Jonas Berg')).toBeInTheDocument()
    expect(within(table).getByText('Daniel Okafor')).toBeInTheDocument()
    // Both Bluebird rows show the client column (Sofia + Jonas).
    expect(within(table).getAllByText('Bluebird Coffee Co.')).toHaveLength(2)
    // Sofia (Bluebird) and Daniel (Vela) are primary — Jonas is not (the
    // "Primary" column header is excluded via the badge selector).
    // 2 contacts are primary (Sofia, Daniel) — query tbody to exclude header
    const tbody = table.querySelector('tbody')!
    expect(within(tbody as HTMLElement).getAllByText('Primary')).toHaveLength(2)
    expect(screen.getByText('Showing 1–3 of 3 contacts')).toBeInTheDocument()

    expect(screen.getByRole('button', { name: 'New contact' })).toBeInTheDocument()
  })

  it('renders the list read-only for a member (no create button)', async () => {
    const user = userEvent.setup()
    await openContacts(user, MEMBER_EMAIL)

    const table = screen.getByRole('table', { name: 'Contacts' })
    expect(within(table).getByText('Sofia Lindqvist')).toBeInTheDocument()
    expect(screen.getByText('Showing 1–3 of 3 contacts')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'New contact' })).not.toBeInTheDocument()
  })

  it('filters by client', async () => {
    const user = userEvent.setup()
    await openContacts(user)

    // The client options load in a parallel query — wait for the option node.
    await screen.findByRole('option', { name: 'Bluebird Coffee Co.' })
    await user.selectOptions(screen.getByLabelText(/Client filter/i), BLUEBIRD_ID)

    expect(await screen.findByText('Showing 1–2 of 2 contacts')).toBeInTheDocument()
    const table = screen.getByRole('table', { name: 'Contacts' })
    expect(within(table).getByText('Sofia Lindqvist')).toBeInTheDocument()
    expect(within(table).getByText('Jonas Berg')).toBeInTheDocument()
    expect(within(table).queryByText('Daniel Okafor')).not.toBeInTheDocument()
  })

  it('filters by primary status', async () => {
    const user = userEvent.setup()
    await openContacts(user)

    await user.selectOptions(screen.getByLabelText(/Primary filter/i), 'true')

    expect(await screen.findByText('Showing 1–2 of 2 contacts')).toBeInTheDocument()
    const table = screen.getByRole('table', { name: 'Contacts' })
    expect(within(table).getByText('Sofia Lindqvist')).toBeInTheDocument()
    expect(within(table).getByText('Daniel Okafor')).toBeInTheDocument()
    expect(within(table).queryByText('Jonas Berg')).not.toBeInTheDocument()
  })

  it('shows an empty state when the search matches nothing', async () => {
    const user = userEvent.setup()
    await openContacts(user)

    await user.type(screen.getByLabelText(/Search contacts/i), 'zzz-nothing')

    expect(await screen.findByText('No contacts match your filters')).toBeInTheDocument()
    expect(screen.getByText('No contacts match your search.')).toBeInTheDocument()
  })

  it('surfaces a network error with a retry action', async () => {
    server.use(
      http.get(`${API_PREFIX}/contacts`, () => HttpResponse.json(null, { status: 500 })),
    )
    loginAs(ADMIN_EMAIL)
    renderApp({ initialPath: '/contacts' })

    expect(await findByHeading('Could not load contacts')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })
})

describe('Contact create', () => {
  it('creates a contact as an admin and redirects to its detail with a success announcement', async () => {
    const user = userEvent.setup()
    loginAs(ADMIN_EMAIL)
    renderApp({ initialPath: '/contacts/new' })

    await findByHeading('New contact')
    // The client select only renders once the clients query resolves.
    await screen.findByRole('option', { name: 'Bluebird Coffee Co.' })

    await user.selectOptions(screen.getByLabelText(/Client/i), BLUEBIRD_ID)
    await user.type(screen.getByLabelText(/First name/i), 'Alex')
    await user.type(screen.getByLabelText(/Last name/i), 'Rivera')
    await user.type(screen.getByLabelText(/Email/i), 'alex@acme.example')
    await user.type(screen.getByLabelText(/Phone/i), '+34 611 222 333')
    await user.type(screen.getByLabelText(/Role/i), 'CEO')
    await user.click(screen.getByRole('button', { name: 'Create contact' }))

    expect(await findByHeading('Alex Rivera')).toBeInTheDocument()
    expect(await screen.findByText('Contact created.')).toBeInTheDocument()
  })

  it('blocks submission when required fields are missing (inline errors)', async () => {
    const user = userEvent.setup()
    loginAs(ADMIN_EMAIL)
    renderApp({ initialPath: '/contacts/new' })

    await findByHeading('New contact')
    await screen.findByRole('option', { name: 'Bluebird Coffee Co.' })

    await user.click(screen.getByRole('button', { name: 'Create contact' }))

    // NOTE: app-wide live region with role="alert" — assert by text.
    expect(await screen.findByText('Select a client.')).toBeInTheDocument()
    expect(screen.getByText('First name is required.')).toBeInTheDocument()
    expect(screen.getByText('Last name is required.')).toBeInTheDocument()
  })

  it('keeps /contacts/new out of reach for a member (403)', async () => {
    loginAs(MEMBER_EMAIL)
    renderApp({ initialPath: '/contacts/new' })

    expect(await findByHeading('Access denied')).toBeInTheDocument()
  })
})

describe('Contact detail', () => {
  it('navigates from the list to the contact detail', async () => {
    const user = userEvent.setup()
    await openContacts(user)

    // The name link renders in both the desktop table and the mobile cards —
    // scope to the table.
    await user.click(
      within(screen.getByRole('table', { name: 'Contacts' })).getByRole('link', { name: 'Sofia Lindqvist' }),
    )

    expect(await findByHeading('Sofia Lindqvist')).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'sofia@bluebirdcoffee.example' })).toBeInTheDocument()
  })

  it('lets an admin set a non-primary contact as primary', async () => {
    const user = userEvent.setup()
    loginAs(ADMIN_EMAIL)
    renderApp({ initialPath: `/contacts/${JONAS_ID}` })

    expect(await findByHeading('Jonas Berg')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit contact' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Set as Primary' })).toBeInTheDocument()
    // Jonas is not primary — no badge anywhere yet.
    expect(screen.queryByText('Primary')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Set as Primary' }))

    expect(await screen.findByText('Primary contact updated.')).toBeInTheDocument()
    // The badge now renders in the header AND in the details card.
    await waitFor(() => expect(screen.getAllByText('Primary')).toHaveLength(2))
    expect(screen.queryByRole('button', { name: 'Set as Primary' })).not.toBeInTheDocument()
  })

  it('renders the detail read-only for a member', async () => {
    loginAs(MEMBER_EMAIL)
    renderApp({ initialPath: `/contacts/${JONAS_ID}` })

    expect(await findByHeading('Jonas Berg')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'jonas@bluebirdcoffee.example' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Bluebird Coffee Co.' })).toBeInTheDocument()
    // Role renders in the header subtitle and the details card.
    expect(screen.getAllByText('Head of Operations').length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: 'Edit contact' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Set as Primary' })).not.toBeInTheDocument()
  })
})

describe('Contact edit (admin)', () => {
  it('prefills the loaded contact and announces the update after saving', async () => {
    const user = userEvent.setup()
    loginAs(ADMIN_EMAIL)
    renderApp({ initialPath: `/contacts/${SOFIA_ID}/edit` })

    await findByHeading('Edit contact')
    const firstName = screen.getByLabelText(/First name/i)
    await waitFor(() => expect(firstName).toHaveValue('Sofia'))
    // Edit is immutable on clientId — no client select is rendered.
    expect(screen.queryByLabelText(/Client/i)).not.toBeInTheDocument()

    const lastName = screen.getByLabelText(/Last name/i)
    await user.clear(lastName)
    await user.type(lastName, 'Kowalski')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await findByHeading('Sofia Kowalski')).toBeInTheDocument()
    expect(await screen.findByText('Contact updated.')).toBeInTheDocument()
  })
})
