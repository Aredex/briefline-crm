/*
 * API client — cookies (credentials: 'include'), CSRF double-submit (token in
 * memory, ADR-001), Problem Details errors (RFC 9457), envelope unwrap.
 *
 * Status handling:
 *  401 → clear session + redirect to /login?next=<original path>
 *  403 → throw ApiError, NO logout (AUTH-FE-002)
 *  409 → expose currentVersion/currentState for reconciliation
 *  429 → expose retryAfterSeconds
 *  403 CSRF_INVALID → refresh token once and retry the request once
 */
import {
  clearSession,
  getCsrfToken,
  setCsrfToken,
  type SessionUser,
} from '../lib/auth-session'
import type { CsrfTokenResponse, ErrorCode, FieldError, ProblemDetails } from './types'

const API_PREFIX = '/api/v1'

/* ---------- Errors ---------- */

export interface ApiErrorOptions {
  status: number
  title: string
  detail: string
  code: ErrorCode | 'NETWORK'
  traceId?: string
  errors?: FieldError[]
  currentVersion?: number
  currentState?: Record<string, unknown>
  retryAfterSeconds?: number
}

export class ApiError extends Error {
  readonly status: number
  readonly title: string
  readonly detail: string
  readonly code: ApiErrorOptions['code']
  readonly traceId?: string
  readonly errors?: FieldError[]
  readonly currentVersion?: number
  readonly currentState?: Record<string, unknown>
  readonly retryAfterSeconds?: number

  constructor(options: ApiErrorOptions) {
    super(options.detail || options.title)
    this.name = 'ApiError'
    this.status = options.status
    this.title = options.title
    this.detail = options.detail
    this.code = options.code
    this.traceId = options.traceId
    this.errors = options.errors
    this.currentVersion = options.currentVersion
    this.currentState = options.currentState
    this.retryAfterSeconds = options.retryAfterSeconds
  }
}

/* ---------- Session helpers shared with auth-store ---------- */

/** Extracted so the auth store can bootstrap without the CSRF dance. */
export async function fetchCurrentUser(): Promise<SessionUser> {
  const user = await rawFetch<SessionUser>('GET', '/auth/me', { skipUnauthorizedRedirect: true })
  return user
}

/* ---------- Redirect hook (tests stub window.location.assign) ---------- */

let unauthorizedHandler: ((next: string) => void) | null = null

/** AuthProvider registers this so 401s navigate without a full page reload. */
export function setUnauthorizedHandler(handler: ((next: string) => void) | null) {
  unauthorizedHandler = handler
}

function redirectToLogin(next: string) {
  const url = `/login?next=${encodeURIComponent(next)}`
  if (unauthorizedHandler) {
    unauthorizedHandler(url)
    return
  }
  if (typeof window !== 'undefined') {
    try {
      window.location.assign(url)
    } catch {
      // jsdom and other non-navigating environments — nothing to do
    }
  }
}

/* ---------- Core request ---------- */

interface RequestOptions {
  signal?: AbortSignal
  params?: Record<string, string | number | boolean | null | undefined>
  body?: unknown
  /** Internal — used by fetchCurrentUser to avoid redirect loops. */
  skipUnauthorizedRedirect?: boolean
}

const UNSAFE_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE'])

async function rawFetch<T>(
  method: string,
  path: string,
  options: RequestOptions = {},
  attempt = 1,
): Promise<T> {
  const url = new URL(API_PREFIX + path, window.location.origin)
  for (const [key, value] of Object.entries(options.params ?? {})) {
    if (value !== null && value !== undefined) url.searchParams.set(key, String(value))
  }

  const headers: Record<string, string> = { Accept: 'application/json' }
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'
  if (UNSAFE_METHODS.has(method)) {
    const token = getCsrfToken() ?? (await refreshCsrfToken())
    if (token) headers['X-CSRF-Token'] = token
  }

  let response: Response
  try {
    response = await fetch(url.toString(), {
      method,
      headers,
      credentials: 'include',
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiError({
      status: 0,
      title: 'Network error',
      detail: 'The server could not be reached. Check your connection and try again.',
      code: 'NETWORK',
    })
  }

  if (response.ok) {
    const payload = await parseJson(response)
    // Envelope unwrap: { data } → data. Two meta-carrying variants exist:
    //  - paginated ({ data: [...], meta }) — keep the whole envelope, callers
    //    read .data and .meta at the same level (TASK-API-011);
    //  - board ({ data: { backlog, columns }, meta }) — BoardResponse reads
    //    everything at one level, so the envelope meta is merged in.
    if (payload && typeof payload === 'object' && 'data' in payload) {
      const hasMeta = 'meta' in payload
      if (hasMeta && !Array.isArray(payload.data)) {
        return { ...(payload.data as object), meta: payload.meta } as T
      }
      if (hasMeta) return payload as T
      return (payload as { data: T }).data
    }
    return payload as T
  }

  const problem = await parseProblem(response)

  if (response.status === 401) {
    // Session expired/invalid → logout + redirect, preserving the destination.
    if (!options.skipUnauthorizedRedirect) {
      clearSession()
      // Use the current page URL as the destination, not the API fetch URL.
      // The user expects to return to the page they were viewing, not an API
      // endpoint they never visited.
      const next =
        window.location.pathname !== '/login'
          ? window.location.pathname + window.location.search
          : '/dashboard'
      redirectToLogin(next)
    }
    throw toApiError(problem, response.status)
  }

  if (response.status === 403 && problem?.code === 'CSRF_INVALID' && attempt < 2) {
    // Stale CSRF token — refresh it in memory and retry the request once.
    await refreshCsrfToken()
    return rawFetch(method, path, options, attempt + 1)
  }

  throw toApiError(problem, response.status)
}

/* ---------- Error parsing ---------- */

async function parseJson(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

async function parseProblem(response: Response): Promise<ProblemDetails | null> {
  const payload = (await parseJson(response)) as ProblemDetails | null
  if (payload && typeof payload === 'object' && 'status' in payload) return payload
  return null
}

function toApiError(problem: ProblemDetails | null, status: number): ApiError {
  if (problem) {
    return new ApiError({
      status,
      title: problem.title ?? `Request failed (${status})`,
      detail: problem.detail ?? '',
      code: problem.code ?? 'INTERNAL_ERROR',
      traceId: problem.traceId,
      errors: problem.errors,
      currentVersion: problem.currentVersion,
      currentState: problem.currentState,
      retryAfterSeconds: problem.retryAfterSeconds,
    })
  }
  return new ApiError({
    status,
    title: `Request failed (${status})`,
    detail: 'The server returned an unexpected response.',
    code: 'INTERNAL_ERROR',
  })
}

/* ---------- CSRF ---------- */

/** Fetches a fresh CSRF token from GET /auth/csrf and keeps it in memory. */
async function refreshCsrfToken(): Promise<string | null> {
  try {
    const response = await fetch(`${API_PREFIX}/auth/csrf`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) return null
    const payload = (await parseJson(response)) as { data?: CsrfTokenResponse } | null
    const token = payload?.data?.csrfToken ?? null
    setCsrfToken(token)
    return token
  } catch {
    return null
  }
}

/* ---------- Public API ---------- */

export interface QueryParams {
  page?: number
  limit?: number
  search?: string
  status?: string
  archived?: boolean
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) => rawFetch<T>('GET', path, options),
  post: <T>(path: string, body: unknown, options?: RequestOptions) =>
    rawFetch<T>('POST', path, { ...options, body }),
  patch: <T>(path: string, body: unknown, options?: RequestOptions) =>
    rawFetch<T>('PATCH', path, { ...options, body }),
  delete: <T>(path: string, options?: RequestOptions) => rawFetch<T>('DELETE', path, options),
}

export { API_PREFIX }
export type { RequestOptions }
