/*
 * Shared test helpers — render the real <App/> (full provider + router stack)
 * against the MSW server. Session state is driven by mockLoginAs so loaders
 * and the AuthProvider bootstrap agree on the signed-in user.
 */
import { render, screen, waitFor } from '@testing-library/react'
import { App } from '../src/App'
import { createAppRouter } from '../src/router'
import { mockLoginAs } from '../src/mocks/handlers'

export interface RenderAppOptions {
  /** window.history path before render (createBrowserRouter reads it). */
  initialPath?: string
}

export function renderApp(options: RenderAppOptions = {}) {
  if (options.initialPath) {
    window.history.pushState({}, '', options.initialPath)
  }
  // Fresh router per render: the production singleton (AP-46) keeps its
  // navigation state between tests in the same file (same jsdom window), which
  // made the second test boot on the first test's route.
  return render(<App router={createAppRouter()} />)
}

/** Authenticate the mock session as a specific demo user (or none). */
export function loginAs(email: string | null) {
  mockLoginAs(email)
}

export const ADMIN_EMAIL = 'admin@northstar.digital'
export const MEMBER_EMAIL = 'member@northstar.digital'
export const DEMO_PASSWORD = 'Briefline2026!'

/**
 * Wait for a CONNECTED heading by name (loaders are async).
 *
 * Plain findByRole resolves on the first match, which can be a node that is
 * about to be detached: the 403/404 pages render their content standalone and
 * remount it inside the AppShell once the session bootstrap lands, so the
 * first poll can grab the pre-remount <h1>. Also tolerates repeated matches
 * (a task title can appear in the detail header and a drawer at once).
 */
export async function findByHeading(name: string | RegExp) {
  await waitFor(
    () => {
      const elements = screen.queryAllByRole('heading', { name })
      if (elements.length === 0) throw new Error(`heading "${String(name)}" not found yet`)
      if (!elements.some((element) => element.isConnected)) {
        throw new Error(`heading "${String(name)}" only found detached`)
      }
    },
    { timeout: 3000 },
  )
  const elements = screen.queryAllByRole('heading', { name })
  return elements.find((element) => element.isConnected) ?? elements[0]
}
