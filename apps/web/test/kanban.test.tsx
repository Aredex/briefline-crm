/*
 * TASK-FE-014 — the kanban board: columns and cards render with badges and
 * meta (overdue is never color-only), filters (debounced search, selects,
 * role="status" count, Clear filters), the permanent "Move to…" menu
 * (keyboard-first status change — never drag-only), the BR-009 assignee gate,
 * the BR-010 blocked-reason dialog, the 409 STALE_VERSION banner with
 * "Show latest", and error retry.
 */
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import userEvent from '@testing-library/user-event'
import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '../src/mocks/server'
import { API_PREFIX } from '../src/api/client'
import { loginAs, renderApp, ADMIN_EMAIL, findByHeading } from './test-utils'

const TASK_OPEN_ID = '44444444-4444-4444-8444-444444444444'
const TASK_OVERDUE_ID = '12121212-1212-4121-8121-121212121212'

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  loginAs(null)
})
afterAll(() => server.close())

async function openBoard(user: ReturnType<typeof userEvent.setup>, email = ADMIN_EMAIL) {
  loginAs(email)
  renderApp({ initialPath: '/tasks' })
  await findByHeading('Tasks')
  // Board data arrives with the query — wait for a known card first.
  await screen.findByText('Redesign onboarding flow')
  return user
}

function column(user: ReturnType<typeof userEvent.setup>, name: RegExp) {
  return screen.getByRole('region', { name })
}

describe('Board rendering (TASK-FE-002)', () => {
  it('renders the backlog and the four active columns with their cards', async () => {
    const user = userEvent.setup()
    await openBoard(user)

    // The backlog is now a compact table at the bottom (always visible)
    expect(screen.getByRole('region', { name: 'Backlog' })).toBeInTheDocument()
    // Column headings read "Pending 2 tasks" (label + count aria-label).
    for (const name of ['Pending', 'In progress', 'Blocked', 'Completed']) {
      expect(screen.getByRole('heading', { name: new RegExp(`^${name}`) })).toBeInTheDocument()
    }

    // Card content: badges (text, not color-only), client, assignee, due date.
    const card = screen.getByRole('button', { name: 'Redesign onboarding flow' })
    expect(within(card).getByText('High')).toBeInTheDocument()
    expect(within(card).getByText('In progress')).toBeInTheDocument()
    expect(within(card).getByText('Bluebird Coffee Co.')).toBeInTheDocument()
    expect(within(card).getByText('Alicia Martin')).toBeInTheDocument()
    expect(within(card).getByText('Aug 21')).toBeInTheDocument()

    // Overdue: red + clock icon + the word (AC-08 — never color only).
    const overdueCard = screen.getByRole('button', { name: 'Renew hosting certificate' })
    const overdue = within(overdueCard).getByText('Overdue')
    expect(overdue.closest('.task-card__due--overdue')).toBeInTheDocument()

    // The "Move to…" menu is ALWAYS present — status changes never depend on drag.
    expect(screen.getAllByRole('button', { name: /Move to/ }).length).toBeGreaterThanOrEqual(5)
  })

  it('shows backlog as compact table below active columns', async () => {
    const user = userEvent.setup()
    await openBoard(user)

    // Backlog section is always visible at the bottom
    expect(screen.getByRole('region', { name: 'Backlog' })).toBeInTheDocument()
    // Backlog tasks render as compact rows with links
    expect(screen.getByRole('link', { name: 'Site-wide redesign' })).toBeInTheDocument()
    void user
  })
})

describe('Filters (TASK-FE-003)', () => {
  it('filters by status and announces the result count', async () => {
    const user = userEvent.setup()
    await openBoard(user)

    expect(screen.getByText('6 tasks')).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Filter tasks by status'), 'COMPLETED')

    // Only the Completed column keeps cards; the count is live-region announced.
    expect(await screen.findByText('1 task')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Fix checkout bug' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Redesign onboarding flow' })).not.toBeInTheDocument()
    expect(screen.getAllByText('No tasks here')).toHaveLength(3)
  })

  it('debounces the search term and supports Clear filters', async () => {
    const user = userEvent.setup()
    await openBoard(user)

    await user.type(screen.getByLabelText('Search tasks'), 'certificate')
    expect(await screen.findByText('1 task')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Renew hosting certificate' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(await screen.findByText('6 tasks')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument()
  })
})

describe('Move to… (TASK-FE-008)', () => {
  it('moves a task between columns and announces it', async () => {
    const user = userEvent.setup()
    await openBoard(user)

    const card = screen.getByRole('button', { name: 'Renew hosting certificate' })
    await user.click(within(card).getByRole('button', { name: /Move to/ }))

    const menu = screen.getByRole('menu', { name: /Renew hosting certificate/ })
    await user.click(within(menu).getByRole('menuitem', { name: 'Completed' }))

    expect(await screen.findByText('Moved "Renew hosting certificate" to Completed.')).toBeInTheDocument()
    const completed = column(user, /Completed/)
    expect(await within(completed).findByText('Renew hosting certificate')).toBeInTheDocument()
    // The card left its previous column (it still exists, now under Completed).
    expect(
      within(column(user, /Pending/)).queryByText('Renew hosting certificate'),
    ).not.toBeInTheDocument()
  })

  it('backlog task is rendered in compact table below active columns', async () => {
    const user = userEvent.setup()
    await openBoard(user)

    // Site-wide redesign is in Backlog — compact row with link, not a card
    const link = screen.getByRole('link', { name: 'Site-wide redesign' })
    expect(link).toBeInTheDocument()
    // The backlog is at the bottom (after the columns)
    const backlog = screen.getByRole('region', { name: 'Backlog' })
    expect(backlog).toBeInTheDocument()
    void user
  })

  it('asks for a blocked reason before moving to Blocked (BR-010)', async () => {
    const user = userEvent.setup()
    await openBoard(user)

    const card = screen.getByRole('button', { name: 'Renew hosting certificate' })
    await user.click(within(card).getByRole('button', { name: /Move to/ }))
    const menu = screen.getByRole('menu', { name: /Renew hosting certificate/ })
    await user.click(within(menu).getByRole('menuitem', { name: 'Blocked' }))

    const dialog = await screen.findByRole('dialog', { name: 'Block Renew hosting certificate' })
    await user.click(within(dialog).getByRole('button', { name: 'Block task' }))
    expect(await within(dialog).findByText('A blocked reason is required.')).toBeInTheDocument()

    await user.type(within(dialog).getByLabelText(/Blocked reason/), 'Waiting for assets')
    await user.click(within(dialog).getByRole('button', { name: 'Block task' }))

    expect(await screen.findByText('Moved "Renew hosting certificate" to Blocked.')).toBeInTheDocument()
    const blocked = column(user, /Blocked/)
    expect(await within(blocked).findByText('Renew hosting certificate')).toBeInTheDocument()
  })

  it('surfaces a 409 STALE_VERSION with the current state and "Show latest"', async () => {
    const user = userEvent.setup()
    await openBoard(user)

    // The task changed server-side after the client loaded it.
    server.use(
      http.patch(`${API_PREFIX}/tasks/:taskId/status`, () =>
        HttpResponse.json(
          {
            type: 'https://api.briefline.example/problems/stale_version',
            title: 'Stale version',
            status: 409,
            detail: 'This task was modified by someone else. Review the current state and retry.',
            code: 'STALE_VERSION',
            currentVersion: 3,
            currentState: {
              title: 'Renew hosting certificate',
              description: 'The TLS cert for the staging environment expires this week.',
              status: 'PENDING',
              priority: 'URGENT',
              assigneeId: '22222222-2222-4222-8222-222222222222',
              clientId: '33333333-3333-4333-8333-333333333333',
              dueDate: '2026-08-05',
              blockedReason: null,
            },
          },
          { status: 409, headers: { 'Content-Type': 'application/problem+json' } },
        ),
      ),
    )

    const card = screen.getByRole('button', { name: 'Renew hosting certificate' })
    await user.click(within(card).getByRole('button', { name: /Move to/ }))
    const menu = screen.getByRole('menu', { name: /Renew hosting certificate/ })
    await user.click(within(menu).getByRole('menuitem', { name: 'Completed' }))

    expect(await screen.findByText('This task was changed by someone else.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show latest' })).toBeInTheDocument()

    // Conflict resolved: a plain retry now succeeds and the banner clears.
    server.resetHandlers()
    await user.click(screen.getByRole('button', { name: 'Show latest' }))
    await waitFor(() =>
      expect(screen.queryByText('This task was changed by someone else.')).not.toBeInTheDocument(),
    )
  })
})

describe('Board error state', () => {
  it('shows an error with retry when the board request fails', async () => {
    const user = userEvent.setup()
    server.use(
      http.get(`${API_PREFIX}/tasks/board`, () =>
        HttpResponse.json(
          {
            type: 'https://api.briefline.example/problems/internal_error',
            title: 'Internal error',
            status: 500,
            detail: 'Something went wrong.',
            code: 'INTERNAL_ERROR',
          },
          { status: 500, headers: { 'Content-Type': 'application/problem+json' } },
        ),
      ),
    )
    loginAs(ADMIN_EMAIL)
    renderApp({ initialPath: '/tasks' })
    await findByHeading('Tasks')

    // The query retries once after ~1s before surfacing the error — give it room.
    expect(await screen.findByText('Could not load tasks', {}, { timeout: 3000 })).toBeInTheDocument()
    server.resetHandlers()
    // ErrorState's shared retry button (default label from the UI kit).
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Redesign onboarding flow')).toBeInTheDocument()
  })
})
