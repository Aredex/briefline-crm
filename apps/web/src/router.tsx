/*
 * Router — React Router v7 Data Mode (createBrowserRouter, AP-16). Created ONCE
 * at module scope (AP-46), consumed by <RouterProvider> in App.tsx.
 *
 * Auth gates (AUTH-FE-002):
 *  - requireAuth: not signed in → redirect /login?next=<original path>
 *  - requireAdmin: MEMBER → redirect /403 (no logout, ever)
 * Loaders run outside React, so they consult the module-level session store and
 * only hit the network on deep-link refreshes (session empty in memory).
 */
import { lazy, useEffect } from 'react'
import { createBrowserRouter, redirect, useRouteError, type LoaderFunctionArgs } from 'react-router'
import { api, ApiError } from './api/client'
import type { UserResponse } from './api/types'
import { getSession, setSession } from './lib/auth-session'
import { AppShell } from './components/layout/AppShell'
import { ErrorState } from './components/ui/ErrorState'
import { Accessibility } from './pages/Accessibility'
import { Landing } from './pages/Landing'
import { Forbidden } from './pages/Forbidden'
import { Login } from './pages/Login'
import { NotFound } from './pages/NotFound'

/*
 * Authenticated-app pages (T5.3, H2) — lazy-loaded so `/`, `/login`,
 * `/accessibility`, `/403` and `/404` (all public, all eager above) don't
 * pull the entire authenticated bundle. Each of these only renders inside
 * the `requireAuth`-gated branch below, which AppShell wraps in <Suspense>.
 */
const ArchivedTasks = lazy(() => import('./pages/ArchivedTasks').then((m) => ({ default: m.ArchivedTasks })))
const Board = lazy(() => import('./pages/Board').then((m) => ({ default: m.Board })))
const TaskList = lazy(() => import('./pages/TaskList').then((m) => ({ default: m.TaskList })))
const ClientCreate = lazy(() => import('./pages/ClientCreate').then((m) => ({ default: m.ClientCreate })))
const ClientDetail = lazy(() => import('./pages/ClientDetail').then((m) => ({ default: m.ClientDetail })))
const ClientList = lazy(() => import('./pages/ClientList').then((m) => ({ default: m.ClientList })))
const ContactCreate = lazy(() => import('./pages/ContactCreate').then((m) => ({ default: m.ContactCreate })))
const ContactDetail = lazy(() => import('./pages/ContactDetail').then((m) => ({ default: m.ContactDetail })))
const ContactEdit = lazy(() => import('./pages/ContactEdit').then((m) => ({ default: m.ContactEdit })))
const ContactList = lazy(() => import('./pages/ContactList').then((m) => ({ default: m.ContactList })))
const Dashboard = lazy(() => import('./pages/Dashboard').then((m) => ({ default: m.Dashboard })))
const Profile = lazy(() => import('./pages/Profile').then((m) => ({ default: m.Profile })))
const TaskDetail = lazy(() => import('./pages/TaskDetail').then((m) => ({ default: m.TaskDetail })))
const Users = lazy(() => import('./pages/Users').then((m) => ({ default: m.Users })))

/* ---------- Auth loaders ---------- */

async function ensureSession(): Promise<UserResponse | null> {
  const existing = getSession()
  if (existing) return existing
  try {
    const user = await api.get<UserResponse>('/auth/me', { skipUnauthorizedRedirect: true })
    setSession(user)
    return user
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null
    throw error // 5xx — the route errorElement will surface it with retry
  }
}

export async function requireAuth({ request }: Pick<LoaderFunctionArgs, 'request'>) {
  const user = await ensureSession()
  if (!user) {
    const url = new URL(request.url)
    const next = encodeURIComponent(url.pathname + url.search)
    throw redirect(`/login?next=${next}`)
  }
  return null
}

export async function requireAdmin({ request }: LoaderFunctionArgs) {
  await requireAuth({ request })
  const user = getSession()
  if (user && user.role !== 'ADMIN') throw redirect('/403')
  return null
}

export async function loginLoader() {
  try {
    const user = await ensureSession()
    if (user) throw redirect('/dashboard')
  } catch (error) {
    // Server unreachable / 5xx must not block the login screen (AUTH-FE-002).
    if (error instanceof Response) throw error
  }
  return null
}

/* ---------- Route errors ---------- */

// QA F5 (#7): T5.3's React.lazy() split means a tab left open across a
// deploy references chunk hashes that no longer exist on the server (the
// classic SPA "stale chunk" failure) — dynamic import() rejects with this
// message shape in both Vite/Rollup and native ESM.
const STALE_CHUNK_PATTERN = /Failed to fetch dynamically imported module|Importing a module script failed/i
const STALE_CHUNK_RELOAD_KEY = 'briefline:stale-chunk-reload'

export function RouteError() {
  const error = useRouteError()
  const message = error instanceof Error ? error.message : String(error)
  const isStaleChunk = STALE_CHUNK_PATTERN.test(message)

  useEffect(() => {
    if (!isStaleChunk) return
    // Reload once automatically — a fresh index.html carries the new chunk
    // hashes, so this actually recovers. Guarded in sessionStorage so a
    // *permanently* broken chunk (bad deploy, not a stale tab) fails visibly
    // after one attempt instead of reload-looping forever.
    if (sessionStorage.getItem(STALE_CHUNK_RELOAD_KEY)) return
    sessionStorage.setItem(STALE_CHUNK_RELOAD_KEY, '1')
    window.location.reload()
  }, [isStaleChunk])

  if (isStaleChunk) {
    return (
      <main id="main" tabIndex={-1} className="app-shell__main app-shell__main--center">
        <ErrorState
          title="A new version was deployed"
          message="Reloading to get the latest version…"
          onRetry={() => window.location.reload()}
        />
      </main>
    )
  }

  return (
    <main id="main" tabIndex={-1} className="app-shell__main app-shell__main--center">
      <ErrorState title="Could not load this page" message={message} onRetry={() => window.location.reload()} />
    </main>
  )
}

/* ---------- Router ---------- */

/**
 * Factory + singleton (AP-46).
 *
 * The singleton is what production mounts. Tests need a FRESH router per test:
 * the singleton retains navigation state between renders (same jsdom window),
 * so a later test would boot on the previous test's route. renderApp() in
 * test/test-utils.tsx passes its own createAppRouter() instance.
 */
export function createAppRouter() {
  return createBrowserRouter([
    {
      errorElement: <RouteError />,
      children: [
        { index: true, element: <Landing /> },
        { path: 'accessibility', element: <Accessibility /> },
        {
          element: <AppShell />,
          loader: requireAuth,
          children: [
            { path: 'dashboard', element: <Dashboard /> },
            { path: 'tasks', element: <Board /> },
            // PC-02: static route before tasks/:taskId (router ranks it anyway).
            { path: 'tasks/list', element: <TaskList /> },
            { path: 'tasks/archived', element: <ArchivedTasks />, loader: requireAdmin },
            { path: 'tasks/:taskId', element: <TaskDetail /> },
            { path: 'clients', element: <ClientList /> },
            { path: 'clients/new', element: <ClientCreate /> },
            { path: 'clients/:clientId', element: <ClientDetail /> },
            { path: 'contacts', element: <ContactList /> },
            { path: 'contacts/new', element: <ContactCreate />, loader: requireAdmin },
            { path: 'contacts/:contactId', element: <ContactDetail /> },
            { path: 'contacts/:contactId/edit', element: <ContactEdit />, loader: requireAdmin },
            { path: 'users', element: <Users />, loader: requireAdmin },
            { path: 'profile', element: <Profile /> },
          ],
        },
        { path: 'login', element: <Login />, loader: loginLoader },
        { path: '403', element: <Forbidden /> },
        { path: '404', element: <NotFound /> },
        { path: '*', element: <NotFound /> },
      ],
    },
  ])
}

export const router = createAppRouter()
