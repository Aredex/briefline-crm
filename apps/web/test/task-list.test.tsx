/*
 * PC-02 (LIST-002/003) — task list table: headers sortable (asc/desc/none
 * cycle written to the URL), filters persisted as query params, row click
 * navigates to the detail, archived tasks excluded, empty/error states.
 */
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import userEvent from '@testing-library/user-event'
import { screen, waitFor, within } from '@testing-library/react'
import { server } from '../src/mocks/server'
import { loginAs, renderApp, ADMIN_EMAIL, findByHeading } from './test-utils'

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  loginAs(null)
})
afterAll(() => server.close())

async function openTaskList(user: ReturnType<typeof userEvent.setup>) {
  loginAs(ADMIN_EMAIL)
  renderApp({ initialPath: '/tasks/list' })
  await findByHeading('Task List')
  await screen.findByRole('table', { name: 'Tasks' })
  return user
}

describe('TaskList (PC-02)', () => {
  it('renders active tasks in a table with the result count (archived excluded)', async () => {
    const user = userEvent.setup()
    await openTaskList(user)

    const table = screen.getByRole('table', { name: 'Tasks' })
    expect(within(table).getByText('Redesign onboarding flow')).toBeInTheDocument()
    expect(within(table).getByText('Site-wide redesign')).toBeInTheDocument()
    expect(screen.getByText('Showing 1–6 of 6 tasks')).toBeInTheDocument()

    // All six active fixtures are visible; the archived one is not.
    expect(within(table).getAllByRole('row')).toHaveLength(7) // thead + 6 rows

    // Four sortable headers (assignee/client are not in the API allowlist).
    expect(within(table).getAllByRole('button', { name: /Sort by / })).toHaveLength(4)
  })

  it('cycles sort asc → desc → none and mirrors it in the URL', async () => {
    const user = userEvent.setup()
    await openTaskList(user)

    // Changing the sort re-fetches the list (the table briefly shows the
    // skeleton and may remount), so wait for the expected header state —
    // polling inside waitFor, never asserting on a stale captured node.
    const clickTitle = async () => {
      const header = screen.getByRole('columnheader', { name: /Title/ })
      await user.click(within(header).getByRole('button', { name: /Sort by Title/ }))
    }
    const expectTitleSort = (aria: string) =>
      waitFor(() => expect(screen.getByRole('columnheader', { name: /Title/ })).toHaveAttribute('aria-sort', aria))

    await clickTitle()
    await expectTitleSort('ascending')
    expect(window.location.search).toContain('sort=title')
    expect(window.location.search).toContain('order=asc')

    await clickTitle()
    await expectTitleSort('descending')
    expect(window.location.search).toContain('order=desc')

    // Third click clears the explicit sort (server default createdAt desc).
    await clickTitle()
    await expectTitleSort('none')
    expect(window.location.search).not.toContain('sort=')
  })

  it('persists filters in the URL and restores them from it', async () => {
    const user = userEvent.setup()
    await openTaskList(user)

    await user.selectOptions(screen.getByRole('combobox', { name: 'Filter tasks by status' }), 'PENDING')
    expect(window.location.search).toContain('status=PENDING')
    await waitFor(() => expect(screen.getByText('Showing 1–1 of 1 tasks')).toBeInTheDocument(), { timeout: 3000 })

    // Clear filters resets to the default URL and restores the full list.
    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(window.location.search).not.toContain('status=')
    await waitFor(() => expect(screen.getByText('Showing 1–6 of 6 tasks')).toBeInTheDocument(), { timeout: 3000 })
  })

  it('debounces the search input into the URL', async () => {
    const user = userEvent.setup()
    await openTaskList(user)

    await user.type(screen.getByRole('searchbox', { name: 'Search tasks' }), 'checkout')
    await waitFor(() => expect(window.location.search).toContain('q=checkout'), { timeout: 3000 })
    await waitFor(() => expect(screen.getByText('Showing 1–2 of 2 tasks')).toBeInTheDocument(), { timeout: 3000 })
  })

  it('opens the task detail drawer on row click and navigates on title link', async () => {
    const user = userEvent.setup()
    await openTaskList(user)

    const table = screen.getByRole('table', { name: 'Tasks' })
    // Row click (outside a link/button) opens the detail drawer
    const row = within(table).getByText('Redesign onboarding flow').closest('tr')
    expect(row).not.toBeNull()
    await user.click(within(row as HTMLElement).getByText('In progress'))
    // Drawer slides in — check that it appears
    const drawer = await screen.findByRole('complementary', { name: /Redesign onboarding flow/ })
    expect(drawer).toBeInTheDocument()

    // Close the drawer
    await user.click(within(drawer).getByRole('button', { name: /Close/ }))
    await waitFor(() => {
      expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
    })

    // Title link still navigates directly (Cmd+click / new tab)
    const link = screen.getByRole('link', { name: 'Site-wide redesign' })
    expect(link).toHaveAttribute('href', expect.stringMatching(/^\/tasks\/[0-9a-f-]{36}$/))
  })
})
