/*
 * Auth provider — bootstraps the session (GET /auth/me), exposes login/logout,
 * and keeps the module-level auth-session store in sync so loaders can gate
 * routes before React mounts.
 *
 * NOTE: AuthProvider sits ABOVE RouterProvider (order in App.tsx), so it never
 * uses router hooks. On 401 the API client navigates to /login via
 * window.location.assign — a full reload that also clears stale client state.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, fetchCurrentUser } from '../api/client'
import type { LoginResponse, LogoutResponse, UserResponse } from '../api/types'
import { clearSession, getSession, setSession, setCsrfToken, useSession } from '../lib/auth-session'

export interface AuthContextValue {
  user: UserResponse | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<UserResponse>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

interface AuthProviderProps {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const user = useSession()
  const [bootstrapDone, setBootstrapDone] = useState(false)

  // Bootstrap: on mount (including deep-link refresh) ask the API who we are.
  // The cookie authenticates us; the store then gates loaders synchronously.
  // Never overwrite a session a loader or login() already established (race
  // guard: the bootstrap may resolve after either of those).
  useEffect(() => {
    let cancelled = false
    fetchCurrentUser()
      .then((session) => {
        if (!cancelled) {
          if (!getSession()) setSession(session)
          setBootstrapDone(true)
        }
      })
      .catch(() => {
        if (!cancelled) {
          if (!getSession()) setSession(null)
          setBootstrapDone(true)
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  // 401 redirects use the client's default (window.location.assign → /login).

  const login = useCallback(async (email: string, password: string): Promise<UserResponse> => {
    // Login response carries a fresh CSRF token — keep it in memory (ADR-001).
    const result = await api.post<LoginResponse>('/auth/login', { email, password })
    setCsrfToken(result.csrfToken)
    setSession(result.user)
    return result.user
  }, [])

  const logout = useCallback(async (): Promise<void> => {
    try {
      await api.post<LogoutResponse>('/auth/logout', {})
    } catch {
      // Logout is idempotent — clear locally even if the server rejects.
    } finally {
      clearSession()
      setCsrfToken(null)
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ user, isLoading: !bootstrapDone, login, logout }),
    [user, bootstrapDone, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an <AuthProvider>')
  }
  return context
}
