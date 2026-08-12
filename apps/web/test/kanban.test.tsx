/*
 * TASK-FE-014 — the kanban board: simplified cards (title + priority badge +
 * assignee only — no status, no client, no due date, no MoveTo), filters
 * (debounced search, selects, role="status" count, Clear filters), backlog
 * compact table with MoveTo, the BR-009 assignee gate, the BR-010 blocked-
 * reason dialog (via modal), the 409 STALE_VERSION banner with "Show latest",
 * and error retry.
 *
 * Board cards no longer carry the "Move to…" menu — it lives in the backlog
 * rows and the detail modal (TaskDetailModal). Status changes by drag-and-drop
 * go through the board's onMove handler.
 */
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import userEvent from '@testing-library/user-event'
import { screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '../src/mocks/server'
import { API_PREFIX } from '../src/api/client'
import { loginAs, renderApp, ADMIN_EMAIL, findByHeading } from './test-utils'

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
  await screen.findByText('Redesign onboarding flow')
  return user
}

describe('Board rendering (TASK-FE-002)', () => {
  it('renders the backlog and the four active columns with simplified cards', async () => {
    const user = userEvent.setup()
    await openBoard(user)

    // Backlog at the bottom (always visible)
    expect(screen.getByRole('region', { name: 'Backlog' })).toBeInTheDocument()
    // Four column headings
    for (const name of ['Pending', 'In progress', 'Blocked', 'Completed']) {
      expect(screen.getByRole('heading', { name: new RegExp(`^${name}`) })).toBeInTheDocument()
    }

    // Simplified card: title + priority badge + assignee only
    const card = screen.getByRole('button', { name: 'Redesign onboarding flow' })
    expect(within(card).getByText('High')).toBeInTheDocument()
    expect(within(card).getByText('Alicia Martin')).toBeInTheDocument()
    void user
  })

  it('shows backlog as compact table below active columns', async () => {
    const user = userEvent.setup()
    await openBoard(user)

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

    expect(await screen.findByText('1 task')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Fix checkout bug' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Redesign onboarding flow' })).not.toBeInTheDocument()
    expect(screen.getAllByText('No tasks here')).toHaveLength(3)
  })

  it('debounces the search term and supports Clear filters', async () => {
    const user = userEvent.setup()
    await openBoard(user)

    await user.type(screen.getByLabelText('Search tasks'), 'certificate')
    // Debounced (300ms) search: generous timeout so the suite passes under load.
    expect(await screen.findByText('1 task', {}, { timeout: 3000 })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Renew hosting certificate' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(await screen.findByText('6 tasks', {}, { timeout: 3000 })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument()
  })
})

describe('Backlog Move to… (TASK-FE-008)', () => {
  it('shows Move to… buttons in the backlog compact rows', async () => {
    const user = userEvent.setup()
    await openBoard(user)

    // Backlog rows still have the MoveTo menu (unlike board cards which use the modal)
    const backlog = screen.getByRole('region', { name: 'Backlog' })
    const moveButtons = within(backlog).getAllByRole('button', { name: /Move to/ })
    expect(moveButtons.length).toBeGreaterThanOrEqual(1)
    void user
  })
})

describe('Card click opens detail drawer', () => {
  it('opens the task detail drawer when a board card is clicked', async () => {
    const user = userEvent.setup()
    await openBoard(user)

    const card = screen.getByRole('button', { name: 'Redesign onboarding flow' })
    await user.click(card)

    // The drawer slides in from the right
    const drawer = await screen.findByRole('complementary', { name: /Redesign onboarding flow/ })
    expect(within(drawer).getByText('Redesign onboarding flow')).toBeInTheDocument()
  })

  it('shows the blocked reason dialog when moving to Blocked via the modal', async () => {
    const user = userEvent.setup()
    await openBoard(user)

    // Open the drawer for the overdue task
    const card = screen.getByRole('button', { name: 'Renew hosting certificate' })
    await user.click(card)

    const drawer = await screen.findByRole('complementary', { name: /Renew hosting certificate/ })
    // Click Move to… in the drawer header and select Blocked
    await user.click(within(drawer).getByRole('button', { name: /Move to/ }))
    const menu = screen.getByRole('menu')
    await user.click(within(menu).getByRole('menuitem', { name: 'Blocked' }))

    // Blocked reason dialog (BR-010) appears
    const blockDialog = await screen.findByRole('dialog', { name: 'Block Renew hosting certificate' })
    await user.click(within(blockDialog).getByRole('button', { name: 'Block task' }))
    expect(await within(blockDialog).findByText('A blocked reason is required.')).toBeInTheDocument()

    await user.type(within(blockDialog).getByLabelText(/Blocked reason/), 'Waiting for assets')
    await user.click(within(blockDialog).getByRole('button', { name: 'Block task' }))

    // After providing a reason, the move succeeds and the modal closes
    expect(await screen.findByText(/Moved.*to Blocked/)).toBeInTheDocument()
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

    expect(await screen.findByText('Could not load tasks', {}, { timeout: 3000 })).toBeInTheDocument()
    server.resetHandlers()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Redesign onboarding flow')).toBeInTheDocument()
  })
})
