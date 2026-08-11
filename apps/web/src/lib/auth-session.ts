/*
 * Module-level session store.
 *
 * React Router loaders run OUTSIDE the React tree and cannot use hooks, so the
 * authenticated user and the CSRF token (which lives in memory only — ADR-001,
 * AP-38) are kept here. AuthProvider subscribes via useSyncExternalStore.
 *
 * Lifecycle:
 *  - AuthProvider bootstraps by calling GET /auth/me and calling setSession().
 *  - Loaders call getSession() synchronously; when empty on a deep-link
 *    refresh they fetch /auth/me themselves before deciding to redirect.
 *  - The API client clears the session on 401 and redirects to /login.
 */
import { useSyncExternalStore } from 'react'

export interface SessionUser {
  id: string
  email: string
  name: string
  role: 'ADMIN' | 'MEMBER'
  status: 'ACTIVE' | 'INACTIVE'
  lastLoginAt: string | null
  createdAt: string
  updatedAt: string
}

type SessionState = SessionUser | null

let session: SessionState = null
let csrfToken: string | null = null
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

export function setSession(user: SessionState) {
  session = user
  emit()
}

export function getSession(): SessionState {
  return session
}

export function clearSession() {
  if (session !== null) {
    session = null
    emit()
  }
}

/** CSRF token kept in memory only (never in web storage — AP-04, ADR-001). */
export function getCsrfToken(): string | null {
  return csrfToken
}

export function setCsrfToken(token: string | null) {
  csrfToken = token
}

/** React binding — re-renders consumers whenever the session changes. */
export function useSession() {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange)
      return () => listeners.delete(onChange)
    },
    () => session,
  )
}
