/*
 * Contract types — mirror of the OpenAPI v1 spec (.claude/plans/openapi-and-errors.md §4).
 *
 * NOTE: packages/api-contract/src/generated/ is empty until `pnpm --filter
 * @briefline/api-contract generate` runs. When it does, these types should be
 * replaced by the generated ones from `@briefline/api-contract` (same shapes,
 * same names) — the swap is purely mechanical.
 */

export type UserRole = 'ADMIN' | 'MEMBER'
export type UserStatus = 'ACTIVE' | 'INACTIVE'
export type ClientStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED'
export type TaskStatus = 'BACKLOG' | 'PENDING' | 'IN_PROGRESS' | 'BLOCKED' | 'COMPLETED'
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
export type TaskChangeEvent =
  | 'CREATED'
  | 'TITLE_CHANGED'
  | 'STATUS_CHANGED'
  | 'PRIORITY_CHANGED'
  | 'ASSIGNEE_CHANGED'
  | 'DUE_DATE_CHANGED'
  | 'ARCHIVED'
  | 'REOPENED'

/* ---------- References ---------- */

export interface UserRef {
  id: string
  name: string
}

export interface ClientRef {
  id: string
  companyName: string
}

/* ---------- Users ---------- */

export interface UserResponse {
  id: string
  email: string
  name: string
  role: UserRole
  status: UserStatus
  lastLoginAt: string | null
  createdAt: string
  updatedAt: string
}

export interface UserCreateInput {
  name: string
  email: string
  /** Initial password (min 8, max 72). Never returned by the API. */
  password: string
  role?: UserRole
}

export interface UserUpdateInput {
  /** At least one field required; only name, role, and status are editable. */
  name?: string
  role?: UserRole
  status?: UserStatus
}

/** One task moved from the deactivated user to an ACTIVE assignee. */
export interface Reassignment {
  taskId: string
  assigneeId: string
}

export interface DeactivateUserRequest {
  /** Required when the target has active assigned tasks (422 REASSIGNMENT_REQUIRED). */
  reassignments: Reassignment[]
}

export interface DeactivationImpact {
  userId: string
  /** Active tasks assigned to the target (require reassignment before deactivation). */
  assignedCount: number
  /** Active tasks created by the target. */
  createdCount: number
  requiresReassignment: boolean
  assignedTasks: TaskSummary[]
}

export interface UpdateProfileRequest {
  name: string
}

/* ---------- Clients ---------- */

export interface ClientResponse {
  id: string
  companyName: string
  industry: string
  contactName: string
  contactEmail: string
  phone: string | null
  notes: string | null
  status: ClientStatus
  createdBy: UserRef
  createdAt: string
  updatedAt: string
}

export interface ClientCreateInput {
  companyName: string
  industry?: string
  contactName: string
  contactEmail: string
  phone?: string | null
  notes?: string | null
}

export interface ClientUpdateInput {
  companyName?: string
  industry?: string
  contactName?: string
  contactEmail?: string
  phone?: string | null
  notes?: string | null
}

export interface ClientWithTasksResponse {
  client: ClientResponse
  relatedTasks: Paginated<TaskSummary>
}

/* ---------- Contacts ---------- */

export interface ContactResponse {
  id: string
  /** Resolved client ref — the raw clientId FK is never exposed (CONT-API). */
  client: ClientRef
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  /** Free-text role, e.g. "CEO", "Design Lead", "Accounting". */
  role: string | null
  /** At most one primary contact per client (CONT-001). */
  isPrimary: boolean
  createdAt: string
  updatedAt: string
}

export interface ContactCreateInput {
  clientId: string
  firstName: string
  lastName: string
  email?: string
  phone?: string
  role?: string
}

/** Field-level allowlist (CONT-API-004): isPrimary and clientId are NOT editable here. */
export interface ContactUpdateInput {
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  role?: string
}

/* ---------- Tasks ---------- */

export interface TaskSummary {
  id: string
  title: string
  status: TaskStatus
  priority: TaskPriority
  assignee: UserRef | null
  client: ClientRef | null
  dueDate: string | null
  version: number
  updatedAt: string
}

export interface TaskResponse extends TaskSummary {
  description: string | null
  blockedReason: string | null
  creator: UserRef
  archivedAt: string | null
  archivedBy: UserRef | null
  createdAt: string
}

export interface TaskCreateInput {
  title: string
  description?: string | null
  /** Defaults to BACKLOG server-side. */
  status?: TaskStatus
  priority: TaskPriority
  assigneeId?: string | null
  clientId?: string | null
  dueDate?: string | null
  /** Required when status is BLOCKED (BR-010); otherwise ignored. */
  blockedReason?: string | null
}

/** Field-level allowlist (TASK-API-003): status is NOT editable here — use PATCH /tasks/{taskId}/status. */
export interface TaskUpdateInput {
  title?: string
  description?: string | null
  priority?: TaskPriority
  assigneeId?: string | null
  clientId?: string | null
  dueDate?: string | null
  /** Only accepted while status is BLOCKED (BR-010/BR-011). */
  blockedReason?: string | null
  /** Required for optimistic updates — STALE_VERSION (409) if it does not match. */
  expectedVersion: number
}

export interface ChangeTaskStatusInput {
  status: TaskStatus
  /** Required when entering BLOCKED (BR-010); cleared server-side when leaving. */
  blockedReason?: string | null
  expectedVersion: number
}

export interface TaskChange {
  id: string
  taskId: string
  /** Version of the task right after this change was applied. */
  version: number
  event: TaskChangeEvent
  field: string | null
  /** JSON-encoded old/new values (e.g. '"PENDING"', '{"title":"…"}'). */
  oldValue: string | null
  newValue: string | null
  actor: UserRef
  createdAt: string
}

/* ---------- Dashboard ---------- */

export interface Kpis {
  open: number
  overdue: number
  blocked: number
  completedLast7Days: number
}

export interface RecentActivityItem {
  id: string
  /** The event's task (TaskChangeEvent value, mirror of TaskChange.event). */
  type: TaskChangeEvent
  taskId: string
  taskTitle: string
  actorName: string
  occurredAt: string
}

/* ---------- Board ---------- */

export interface BoardResponse {
  backlog: TaskSummary[]
  columns: Record<Exclude<TaskStatus, 'BACKLOG'>, TaskSummary[]>
  /** Total task count across backlog + active columns (server-computed). */
  meta: { total: number }
}

/* ---------- Pagination ---------- */

export interface PaginationMeta {
  page: number
  limit: number
  total: number
}

export interface Paginated<T> {
  data: T[]
  meta: PaginationMeta
}

/* ---------- Errors (RFC 9457 Problem Details + envelope) ---------- */
/* Canonical catalogue: .claude/plans/openapi-and-errors.md §3.2-3.6. */

export type ErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'INACTIVE_USER'
  | 'TOKEN_INVALID'
  | 'TOKEN_EXPIRED'
  | 'CSRF_INVALID'
  | 'RATE_LIMITED'
  | 'VALIDATION_ERROR'
  | 'EMAIL_ALREADY_EXISTS'
  | 'LAST_ADMIN'
  | 'USER_NOT_FOUND'
  | 'CANNOT_DEACTIVATE_SELF'
  | 'CLIENT_NOT_FOUND'
  | 'CLIENT_ARCHIVED'
  | 'CANNOT_ARCHIVE_WITH_ACTIVE_TASKS'
  | 'CONTACT_NOT_FOUND'
  | 'CONTACT_EMAIL_EXISTS'
  | 'TASK_NOT_FOUND'
  | 'STALE_VERSION'
  | 'TASK_ARCHIVED'
  | 'ASSIGNEE_REQUIRED'
  | 'BLOCKED_REASON_REQUIRED'
  | 'INACTIVE_ASSIGNEE'
  | 'CANNOT_ASSIGN_ARCHIVED_CLIENT'
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'INTERNAL_ERROR'
  | 'CONCURRENT_MODIFICATION'
  | 'REASSIGNMENT_REQUIRED'

export interface FieldError {
  field: string
  message: string
  code?: string
}

export interface ProblemDetails {
  type: string
  title: string
  status: number
  detail: string
  instance: string
  traceId: string
  code: ErrorCode
  errors?: FieldError[]
  /** 409 STALE_VERSION only — expected entity version. */
  currentVersion?: number
  /** 409 STALE_VERSION only — current server-side state for reconciliation. */
  currentState?: Record<string, unknown>
  /** 429 RATE_LIMITED only — seconds until the user can retry. */
  retryAfterSeconds?: number
}

/* ---------- Auth ---------- */

export interface CsrfTokenResponse {
  csrfToken: string
}

export interface LoginResponse extends CsrfTokenResponse {
  user: UserResponse
}

export interface LogoutResponse {
  ok: true
}
