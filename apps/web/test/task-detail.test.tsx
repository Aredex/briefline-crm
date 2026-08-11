/*
 * TASK-FE-014 — task detail drawer: opens over the board from a card link,
 * deep-links directly at /tasks/:taskId, 404 copy, read-only archived banner,
 * history timeline (CREATED/STATUS_CHANGED/ASSIGNEE_CHANGED with old → new),
 * edit mode, archive with confirmation, and the status move menu.
 */
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import userEvent from '@testing-library/user-event'
import { screen, waitFor, within } from '@testing-library/react'
import { server } from '../src/mocks/server'
import { loginAs, renderApp, ADMIN_EMAIL, findByHeading } from './test-utils'

const TASK_OPEN_ID = '44444444-4444-4444-8444-444444444444'
const TASK_ARCHIVED_ID = '88888888-8888-4888-8888-888888888888'

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  loginAs(null)
})
afterAll(() => server.close())

async function openDetailFromBoard(user: ReturnType<typeof userEvent.setup>) {
  loginAs(ADMIN_EMAIL)
  renderApp({ initialPath: '/tasks' })
  await findByHeading('Tasks')
  await user.click(await screen.findByRole('link', { name: 'Redesign onboarding flow' }))
  const drawer = await screen.findByRole('complementary', { name: 'Task details' })
  return drawer
}

describe('Task detail (TASK-FE-006)', () => {
  it('opens a non-modal drawer over the board with the task info', async () => {
    const user = userEvent.setup()
    const drawer = await openDetailFromBoard(user)

    expect(within(drawer).getByRole('heading', { name: 'Redesign onboarding flow' })).toBeInTheDocument()
    expect(within(drawer).getByText('Modernize the sign-up wizard and reduce drop-off at step 2.')).toBeInTheDocument()
    expect(within(drawer).getByText('High')).toBeInTheDocument()
    // "In progress" appears in the status badge AND the timeline old → new values.
    expect(within(drawer).getAllByText('In progress').length).toBeGreaterThan(0)
    // The assignee name also appears as the timeline actor.
    expect(within(drawer).getAllByText('Alicia Martin').length).toBeGreaterThan(0)
    expect(within(drawer).getByText('Bluebird Coffee Co.')).toBeInTheDocument()
    expect(within(drawer).getByText('Aug 21')).toBeInTheDocument()

    // Actions for an admin: move, edit, archive.
    expect(within(drawer).getByRole('button', { name: /Move to/ })).toBeInTheDocument()
    expect(within(drawer).getByRole('button', { name: 'Edit' })).toBeInTheDocument()
    expect(within(drawer).getByRole('button', { name: 'Archive' })).toBeInTheDocument()

    // The board stays mounted behind the panel (non-modal, AP-14).
    expect(screen.getByRole('heading', { name: 'Tasks' })).toBeInTheDocument()
  })

  it('deep-links straight into the drawer at /tasks/:taskId', async () => {
    const user = userEvent.setup()
    loginAs(ADMIN_EMAIL)
    renderApp({ initialPath: `/tasks/${TASK_OPEN_ID}` })
    const drawer = await screen.findByRole('complementary', { name: 'Task details' })
    expect(
      await within(drawer).findByRole('heading', { name: 'Redesign onboarding flow' }),
    ).toBeInTheDocument()
  })

  it('shows the 404 copy and a way back for unknown tasks', async () => {
    const user = userEvent.setup()
    loginAs(ADMIN_EMAIL)
    renderApp({ initialPath: '/tasks/00000000-0000-4000-8000-000000000000' })
    // Queries retry once after ~1s before surfacing the error — give it room.
    expect(
      await screen.findByText(
        'Task not found, or you don\'t have access to it.',
        {},
        { timeout: 3000 },
      ),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Back to tasks' }))
    await findByHeading('Tasks')
  })

  it('renders archived tasks read-only with a banner for admins', async () => {
    const user = userEvent.setup()
    loginAs(ADMIN_EMAIL)
    renderApp({ initialPath: `/tasks/${TASK_ARCHIVED_ID}` })
    const drawer = await screen.findByRole('complementary', { name: 'Task details' })

    expect(
      await within(drawer).findByText('This task is archived and read-only.'),
    ).toBeInTheDocument()
    expect(
      await within(drawer).findByRole('heading', { name: 'Migrate mailing platform' }),
    ).toBeInTheDocument()
    // No actions on a read-only task.
    expect(within(drawer).queryByRole('button', { name: /Move to/ })).not.toBeInTheDocument()
    expect(within(drawer).queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    expect(within(drawer).queryByRole('button', { name: 'Archive' })).not.toBeInTheDocument()
  })
})

describe('Task history (TASK-FE-007)', () => {
  it('renders the timeline with event badges and old → new values', async () => {
    const user = userEvent.setup()
    const drawer = await openDetailFromBoard(user)

    const history = within(drawer).getByRole('region', { name: 'History' })
    expect(within(history).getByText('Status changed')).toBeInTheDocument()
    expect(within(history).getByText('Pending')).toBeInTheDocument()
    expect(within(history).getByText('In progress')).toBeInTheDocument()

    expect(within(history).getByText('Assignee changed')).toBeInTheDocument()
    expect(within(history).getByText('22222222…')).toBeInTheDocument()

    expect(within(history).getByText('Created')).toBeInTheDocument()
    // Several entries can share the same actor.
    expect(within(history).getAllByText(/Alicia Martin/).length).toBeGreaterThan(0)
  })

  it('shows the empty state for tasks without history', async () => {
    const user = userEvent.setup()
    loginAs(ADMIN_EMAIL)
    renderApp({ initialPath: '/tasks/12121212-1212-4121-8121-121212121212' })
    const drawer = await screen.findByRole('complementary', { name: 'Task details' })
    const history = await within(drawer).findByRole('region', { name: 'History' })
    expect(await within(history).findByText('No history yet')).toBeInTheDocument()
  })
})

describe('Task detail actions', () => {
  it('edits the task from the drawer', async () => {
    const user = userEvent.setup()
    const drawer = await openDetailFromBoard(user)

    await user.click(within(drawer).getByRole('button', { name: 'Edit' }))
    const form = await within(drawer).findByRole('form', { name: 'Edit task form' })
    // The label renders "Title *" (required marker) — match by substring.
    const title = within(form).getByLabelText(/Title/)
    expect(title).toHaveValue('Redesign onboarding flow')

    await user.clear(title)
    await user.type(title, 'Onboarding wizard v2')
    await user.click(within(form).getByRole('button', { name: 'Save changes' }))

    expect(await within(drawer).findByText('Task updated.')).toBeInTheDocument()
    expect(
      await within(drawer).findByRole('heading', { name: 'Onboarding wizard v2' }),
    ).toBeInTheDocument()
  })

  it('moves the task from the drawer menu', async () => {
    const user = userEvent.setup()
    const drawer = await openDetailFromBoard(user)

    await user.click(within(drawer).getByRole('button', { name: /Move to/ }))
    const menu = screen.getByRole('menu', { name: /Redesign onboarding flow/ })
    await user.click(within(menu).getByRole('menuitem', { name: 'Completed' }))

    expect(await within(drawer).findByText('Moved to Completed.')).toBeInTheDocument()
  })

  it('archives the task (admin) after confirmation and returns to the board', async () => {
    const user = userEvent.setup()
    const drawer = await openDetailFromBoard(user)

    await user.click(within(drawer).getByRole('button', { name: 'Archive' }))
    const dialog = screen.getByRole('dialog', { name: 'Archive "Redesign onboarding flow"?' })
    await user.click(within(dialog).getByRole('button', { name: 'Archive' }))

    await findByHeading('Tasks')
    await waitFor(() =>
      expect(screen.queryByRole('article', { name: 'Redesign onboarding flow' })).not.toBeInTheDocument(),
    )
  })
})
