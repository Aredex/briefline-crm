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
import { createBrowserRouter, redirect, useRouteError, type LoaderFunctionArgs } from 'react-router'
import { api, ApiError } from './api/client'
import type { UserResponse } from './api/types'
import { getSession, setSession } from './lib/auth-session'
import { AppShell } from './components/layout/AppShell'
import { ErrorState } from './components/ui/ErrorState'
import { ArchivedTasks } from './pages/ArchivedTasks'
import { Board } from './pages/Board'
import { TaskList } from './pages/TaskList'
import { ClientCreate } from './pages/ClientCreate'
import { ClientDetail } from './pages/ClientDetail'
import { ClientList } from './pages/ClientList'
import { ContactCreate } from './pages/ContactCreate'
import { ContactDetail } from './pages/ContactDetail'
import { ContactEdit } from './pages/ContactEdit'
import { ContactList } from './pages/ContactList'
import { Dashboard } from './pages/Dashboard'
import { Forbidden } from './pages/Forbidden'
import { Login } from './pages/Login'
import { NotFound } from './pages/NotFound'
import { Profile } from './pages/Profile'
import { TaskDetail } from './pages/TaskDetail'
import { Users } from './pages/Users'

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

export function RouteError() {
  const error = useRouteError()
  const detail =
    error instanceof Error ? error.message : 'Something went wrong while loading this page.'
  return (
    <main id="main" tabIndex={-1} className="app-shell__main app-shell__main--center">
      <ErrorState title="Could not load this page" message={detail} onRetry={() => window.location.reload()} />
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
        {
          element: <AppShell />,
          loader: requireAuth,
          children: [
            { index: true, loader: () => redirect('/dashboard') },
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
