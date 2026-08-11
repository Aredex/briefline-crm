// RFC 9457 Problem Details response shape — API-004 (PH-04).
//
// Every error response from the API is a Problem Details document. The `type`
// is a stable URI that identifies the error class, `traceId` correlates the
// response with server logs, and `errors[]` carries field-level validation
// problems. Server internals (stack traces, SQL, secrets) never reach the
// client — only a safe `detail` string.

export interface FieldError {
  field: string
  message: string
  code: string
}

export interface ProblemDetails {
  /** Stable URI identifying the error class. */
  type: string
  /** Short human-readable title. */
  title: string
  /** HTTP status code. */
  status: number
  /** Safe, human-readable explanation. */
  detail: string
  /** Request URI that produced the error (RFC 9457 `instance`). */
  instance: string
  /** Correlation id, also echoed in the X-Trace-Id response header. */
  traceId: string
  /** Machine-readable error code (see the error catalogue). */
  code: string
  /** Field-level validation problems (only on 4xx validation errors). */
  errors?: FieldError[]
  /** Seconds until the client may retry (429 responses only). */
  retryAfterSeconds?: number
  /**
   * Documented code extensions (openapi-and-errors.md §3.6) — passed through
   * verbatim by the global filter. STALE_VERSION carries the current server
   * state so the client can re-sync before retrying (TASK-API-005).
   */
  currentVersion?: number
  /** Safe public representation of the current task state (STALE_VERSION only). */
  currentState?: {
    title: string
    description: string | null
    status: string
    priority: string
    assigneeId: string | null
    clientId: string | null
    dueDate: string | null
    blockedReason: string | null
    archivedAt: string | null
  }
}
