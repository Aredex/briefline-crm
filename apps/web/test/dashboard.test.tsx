/*
 * DASH-001/002/003/004 — KPI cards (values + board deep links), My Tasks
 * (sort, badges, due labels), Recent activity (actor-verb-task), partial
 * error (a failing section never hides the others), and empty states.
 * Fixtures follow the TASK-API-011 contract shapes.
 */
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import userEvent from '@testing-library/user-event'
import { screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '../src/mocks/server'
import { API_PREFIX } from '../src/api/client'
import { loginAs, renderApp, ADMIN_EMAIL, findByHeading } from './test-utils'

const OPEN_TASK_ID = '44444444-4444-4444-8444-444444444444'

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  loginAs(null)
})
afterAll(() => server.close())

async function openDashboard() {
  loginAs(ADMIN_EMAIL)
  renderApp({ initialPath: '/dashboard' })
  await findByHeading('Dashboard')
}

describe('KPI cards (DASH-001/004)', () => {
  it('renders the four cards with mock values and matching board deep links', async () => {
    await openDashboard()

    const open = await screen.findByRole('link', { name: 'Open tasks: 24' })
    expect(open).toHaveAttribute('href', '/tasks')
    expect(within(open).getByText('24')).toBeInTheDocument()

    const overdue = screen.getByRole('link', { name: 'Overdue: 3' })
    expect(overdue).toHaveAttribute('href', '/tasks?due=OVERDUE')

    const blocked = screen.getByRole('link', { name: 'Blocked: 1' })
    expect(blocked).toHaveAttribute('href', '/tasks?status=BLOCKED')

    const completed = screen.getByRole('link', { name: 'Recently completed: 9' })
    expect(completed).toHaveAttribute('href', '/tasks?status=COMPLETED')
  })

  it('navigates to the filtered board when a card is clicked (DASH-004)', async () => {
    const user = userEvent.setup()
    await openDashboard()
    await screen.findByRole('link', { name: 'Open tasks: 24' })

    await user.click(screen.getByRole('link', { name: 'Blocked: 1' }))
    await findByHeading('Tasks')
    expect(window.location.search).toBe('?status=BLOCKED')
  })
})

describe('My Tasks (DASH-002)', () => {
  it('lists the assigned tasks in contractual order with badges and due labels', async () => {
    await openDashboard()
    await screen.findByRole('link', { name: 'Fix checkout bug' })
    const section = screen.getByRole('region', { name: 'My tasks' })

    // Server-side sort: priority desc (URGENT, HIGH, LOW).
    const links = within(section).getAllByRole('link')
    const titles = links.slice(1).map((link) => link.textContent)
    expect(titles).toEqual([
      'Fix checkout bug',
      'Redesign onboarding flow',
      'Accessibility pass on checkout',
    ])

    // Due labels: overdue date → "Overdue", future date → absolute.
    expect(within(section).getAllByText('Overdue').length).toBeGreaterThan(0)
    expect(within(section).getByText('Aug 21')).toBeInTheDocument()

    // Rows deep-link to the task detail.
    expect(within(section).getByRole('link', { name: 'Redesign onboarding flow' })).toHaveAttribute(
      'href',
      `/tasks/${OPEN_TASK_ID}`,
    )
  })

  it('shows the empty state when the user has no assigned tasks', async () => {
    server.use(
      http.get(`${API_PREFIX}/dashboard/my-tasks`, () =>
        HttpResponse.json({ data: { data: [], meta: { page: 1, limit: 8, total: 0 } } }),
      ),
    )
    await openDashboard()
    const section = screen.getByRole('region', { name: 'My tasks' })
    expect(await within(section).findByText('No tasks assigned to you')).toBeInTheDocument()
  })
})

describe('Recent activity (DASH-003)', () => {
  it('renders actor, verb and task link with a relative timestamp', async () => {
    await openDashboard()
    // The verb lives in the paragraph's direct text (actor/task are nested
    // elements), so scope the text match to the line node.
    await screen.findByText(/changed the status of/, { selector: '.recent-activity__line' })
    const section = screen.getByRole('region', { name: 'Recent activity' })

    expect(within(section).getByText('Alicia Martin', { selector: '.recent-activity__actor' })).toBeInTheDocument()
    expect(within(section).getByText('Marco Ruiz', { selector: '.recent-activity__actor' })).toBeInTheDocument()

    const taskLink = within(section).getByRole('link', { name: 'Redesign onboarding flow' })
    expect(taskLink).toHaveAttribute('href', `/tasks/${OPEN_TASK_ID}`)

    const item = within(section).getByText('Redesign onboarding flow').closest('li')
    expect(item?.querySelector('time')).toHaveAttribute('dateTime', '2026-08-10T16:05:00.000Z')
  })

  it('shows the empty state when there is no activity', async () => {
    server.use(
      http.get(`${API_PREFIX}/dashboard/recent-activity`, () =>
        HttpResponse.json({ data: { data: [], meta: { page: 1, limit: 10, total: 0 } } }),
      ),
    )
    await openDashboard()
    const section = screen.getByRole('region', { name: 'Recent activity' })
    expect(await within(section).findByText('No recent activity')).toBeInTheDocument()
  })
})

describe('Partial error (DASH-001)', () => {
  it('degrades the KPI cards to "—" while the other sections keep working', async () => {
    server.use(
      http.get(`${API_PREFIX}/dashboard/kpis`, () =>
        HttpResponse.json(
          {
            type: 'https://api.briefline.example/problems/internal_error',
            title: 'Server error',
            status: 500,
            detail: 'boom',
            instance: '/api/v1/requests/mock',
            traceId: 'mock-trace-id',
            code: 'INTERNAL_ERROR',
          },
          { status: 500 },
        ),
      ),
    )
    await openDashboard()

    const open = await screen.findByRole('link', { name: 'Open tasks' })
    // The card resolves during loading first (aria-label is just the label);
    // the "—" placeholder lands once the query fails.
    expect(await within(open).findByText('—')).toBeInTheDocument()
    expect(open).toHaveAttribute('title', 'Unable to load')

    // My Tasks and Recent activity loaded normally.
    await screen.findByText('Fix checkout bug')
    const myTasks = screen.getByRole('region', { name: 'My tasks' })
    expect(within(myTasks).getByText('Fix checkout bug')).toBeInTheDocument()
    const activity = screen.getByRole('region', { name: 'Recent activity' })
    expect(within(activity).getByText(/Alicia Martin/)).toBeInTheDocument()
  })
})
