/*
 * MSW handlers — happy path, empty, and error scenarios (400/401/403/404/
 * 409/422/429) per the error catalogue (.claude/plans/openapi-and-errors.md §3).
 * Login state is tracked in-memory so auth flows behave like the real API.
 *
 * Magic accounts for tests:
 *  - ratelimit@northstar.digital / any password → 429 RATE_LIMITED
 *  - any other email / wrong password / inactive account → 401 INVALID_CREDENTIALS
 */
import { http, HttpResponse } from 'msw'
import { API_PREFIX } from '../api/client'
import type {
  BoardResponse,
  ClientResponse,
  ContactResponse,
  FieldError,
  ProblemDetails,
  TaskPriority,
  TaskResponse,
  TaskStatus,
  UserResponse,
} from '../api/types'
import {
  ALL_CLIENTS,
  ALL_CONTACTS,
  ALL_TASKS,
  ALL_USERS,
  DEMO_PASSWORD,
  findDemoUser,
  KPIS,
  RECENT_ACTIVITY,
  TASK_HISTORY,
  TASK_OPEN_REDESIGN,
} from './data'

const MOCK_CSRF_TOKEN = 'mock-csrf-token-0000'

let loggedInEmail: string | null = null

function problem(
  status: number,
  code: ProblemDetails['code'],
  title: string,
  detail: string,
  extra?: Partial<ProblemDetails>,
) {
  const body: ProblemDetails = {
    type: `https://api.briefline.example/problems/${code.toLowerCase()}`,
    title,
    status,
    detail,
    instance: `/api/v1/requests/mock-instance`,
    traceId: 'mock-trace-id',
    code,
    ...extra,
  }
  return HttpResponse.json(body, {
    status,
    headers: { 'Content-Type': 'application/problem+json' },
  })
}

function json(data: unknown, init?: ResponseInit) {
  return HttpResponse.json({ data }, init)
}

function currentUser(): UserResponse | null {
  return loggedInEmail ? findDemoUser(loggedInEmail) : null
}

function paginate<T>(items: T[], page: number, limit: number) {
  const total = items.length
  const start = (page - 1) * limit
  return { data: items.slice(start, start + limit), meta: { page, limit, total } }
}

function parsePage(url: URL, fallbackLimit: number) {
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1) || 1)
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') ?? fallbackLimit) || fallbackLimit))
  return { page, limit }
}

function unauthorized() {
  return problem(401, 'TOKEN_INVALID', 'Session expired', 'Sign in to continue.')
}

/** Active tasks: not archived and not COMPLETED (the deactivation-impact contract). */
function activeTasksOf(userId: string) {
  return ALL_TASKS.filter(
    (task) => !task.archivedAt && task.status !== 'COMPLETED' && task.assignee?.id === userId,
  )
}

function isLastActiveAdmin(user: UserResponse): boolean {
  if (user.role !== 'ADMIN' || user.status !== 'ACTIVE') return false
  return !ALL_USERS.some(
    (other) => other.id !== user.id && other.role === 'ADMIN' && other.status === 'ACTIVE',
  )
}

function findUser(userId: string): UserResponse | undefined {
  return ALL_USERS.find((item) => item.id === userId)
}

/** CONT-001: at most one primary contact per client. */
function contactWithEmailInClient(email: string, clientId: string): ContactResponse | undefined {
  return ALL_CONTACTS.find(
    (contact) => contact.client.id === clientId && contact.email?.toLowerCase() === email.toLowerCase(),
  )
}

/** Contractual sort (CONT-API-002): primary first, then lastName/firstName asc. */
function sortContacts(items: ContactResponse[]): ContactResponse[] {
  return [...items].sort((a, b) => {
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1
    if (a.lastName !== b.lastName) return a.lastName < b.lastName ? -1 : 1
    if (a.firstName !== b.firstName) return a.firstName < b.firstName ? -1 : 1
    return 0
  })
}

/* ---------- Auth ---------- */

  /* ---------- Tasks & board ---------- */

const PRIORITY_RANK: Record<TaskPriority, number> = { URGENT: 4, HIGH: 3, MEDIUM: 2, LOW: 1 }

/** Board sorting is contractual (server-side): priority desc, due asc (nulls last), updatedAt desc. */
function compareBoardTasks(a: TaskResponse, b: TaskResponse) {
    const priorityDiff = PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority]
    if (priorityDiff !== 0) return priorityDiff
    if (a.dueDate === null && b.dueDate !== null) return 1
    if (a.dueDate !== null && b.dueDate === null) return -1
    if (a.dueDate !== null && b.dueDate !== null && a.dueDate !== b.dueDate) {
      return a.dueDate < b.dueDate ? -1 : 1
    }
    return b.updatedAt.localeCompare(a.updatedAt)
  }

  /** PC-02 (LIST-001): allowlisted list sort. created/updatedAt are ISO strings (lexicographic). */
function compareListTasks(a: TaskResponse, b: TaskResponse, field: string, order: 'asc' | 'desc') {
    let cmp = 0
    if (field === 'priority') {
      cmp = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
    } else if (field === 'dueDate') {
      if (a.dueDate === null && b.dueDate !== null) cmp = 1
      else if (a.dueDate !== null && b.dueDate === null) cmp = -1
      else if (a.dueDate !== null && b.dueDate !== null) cmp = a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0
    } else {
      const fieldKey = field as 'title' | 'status'
      cmp = a[fieldKey] < b[fieldKey] ? -1 : a[fieldKey] > b[fieldKey] ? 1 : 0
    }
    return order === 'asc' ? cmp : -cmp
  }

function canEditTask(user: UserResponse, task: TaskResponse) {
    // BR-013/014: admins edit anything; members only what they created or are assigned to.
    return user.role === 'ADMIN' || task.creator.id === user.id || task.assignee?.id === user.id
  }

function currentStateOf(task: TaskResponse) {
    return {
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      assigneeId: task.assignee?.id ?? null,
      clientId: task.client?.id ?? null,
      dueDate: task.dueDate,
      blockedReason: task.blockedReason,
    }
  }

  /** BR-004/008/009/010/FR-CLI-006 — shared by create, update and status transitions. */
function transitionErrors(
    nextStatus: TaskStatus,
    assigneeId: string | null | undefined,
    clientId: string | null | undefined,
    blockedReason: string | null | undefined,
  ): { status: number; body: ReturnType<typeof problem> } | null {
    const errors: FieldError[] = []
    const assignee = assigneeId ? findUser(assigneeId) : undefined
    if (assigneeId && assignee && assignee.status !== 'ACTIVE') {
      errors.push({ field: 'assigneeId', message: 'Assignees must be active users.', code: 'INACTIVE_ASSIGNEE' })
    }
    if (assigneeId && !assignee) {
      errors.push({ field: 'assigneeId', message: 'The requested assignee does not exist.', code: 'USER_NOT_FOUND' })
    }
    if (nextStatus !== 'BACKLOG' && !assigneeId) {
      errors.push({ field: 'assigneeId', message: 'Tasks outside the backlog must have an active assignee.', code: 'ASSIGNEE_REQUIRED' })
    }
    if (nextStatus === 'BLOCKED' && !blockedReason?.trim()) {
      errors.push({ field: 'blockedReason', message: 'Blocked tasks require a reason.', code: 'BLOCKED_REASON_REQUIRED' })
    }
    if (clientId) {
      const client = ALL_CLIENTS.find((item) => item.id === clientId)
      if (client?.status === 'ARCHIVED') {
        errors.push({ field: 'clientId', message: 'Archived clients cannot receive new task associations.', code: 'CANNOT_ASSIGN_ARCHIVED_CLIENT' })
      }
    }
    if (errors.length > 0) {
      return {
        status: 422,
        body: problem(422, 'ASSIGNEE_REQUIRED', 'Business rule violated', errors[0]?.message ?? 'Business rule violated', { errors }),
      }
    }
    return null
  }

function staleVersion(task: TaskResponse) {
    return problem(
      409,
      'STALE_VERSION',
      'Stale version',
      'This task was modified by someone else. Review the current state and retry.',
      { currentVersion: task.version, currentState: currentStateOf(task) },
    )
  }

export const handlers = [
  http.get(`${API_PREFIX}/auth/csrf`, () => json({ csrfToken: MOCK_CSRF_TOKEN })),

  http.post(`${API_PREFIX}/auth/login`, async ({ request }) => {
    const body = (await request.json()) as { email?: string; password?: string }
    const email = body.email?.trim() ?? ''

    if (email === 'ratelimit@northstar.digital') {
      return problem(
        429,
        'RATE_LIMITED',
        'Too many requests',
        'You have made too many sign-in attempts. Please wait before trying again.',
        { retryAfterSeconds: 60 },
      )
    }

    // FR-AUTH-002/003: unknown email, wrong password, and inactive accounts all
    // return the same generic 401 — never distinguish account state.
    const user = findDemoUser(email)
    if (!user || body.password !== DEMO_PASSWORD) {
      return problem(
        401,
        'INVALID_CREDENTIALS',
        'Invalid credentials',
        'The email or password is incorrect.',
      )
    }
    loggedInEmail = user.email
    return json({ csrfToken: MOCK_CSRF_TOKEN, user })
  }),

  http.post(`${API_PREFIX}/auth/logout`, () => {
    loggedInEmail = null
    return json({ ok: true })
  }),

  http.get(`${API_PREFIX}/auth/me`, () => {
    const user = currentUser()
    if (!user) return unauthorized()
    return json(user)
  }),

  /* ---------- Dashboard ---------- */

  http.get(`${API_PREFIX}/dashboard/kpis`, () => {
    if (!currentUser()) return unauthorized()
    return json(KPIS)
  }),

  http.get(`${API_PREFIX}/dashboard/my-tasks`, ({ request }) => {
    const user = currentUser()
    if (!user) return unauthorized()
    // Mirrors the real service: my tasks = non-archived, assignee = me, with
    // the contractual server-side sort (priority desc, due asc, updatedAt desc).
    const { page, limit } = parsePage(new URL(request.url), 8)
    const mine = ALL_TASKS.filter(
      (task) => !task.archivedAt && task.assignee?.id === user.id,
    ).sort(compareBoardTasks)
    return json(paginate(mine, page, limit))
  }),

  http.get(`${API_PREFIX}/dashboard/recent-activity`, ({ request }) => {
    if (!currentUser()) return unauthorized()
    const { page, limit } = parsePage(new URL(request.url), 10)
    return json(paginate(RECENT_ACTIVITY, page, limit))
  }),

  http.get(`${API_PREFIX}/tasks/board`, ({ request }) => {
    const user = currentUser()
    if (!user) return unauthorized()
    const url = new URL(request.url)
    const q = (url.searchParams.get('q') ?? '').trim().toLowerCase()
    const status = url.searchParams.get('status') as TaskStatus | null
    const priority = url.searchParams.get('priority') as TaskPriority | null
    const assigneeId = url.searchParams.get('assigneeId')
    const clientId = url.searchParams.get('clientId')
    const dueBefore = url.searchParams.get('dueBefore') // inclusive (YYYY-MM-DD)
    const dueAfter = url.searchParams.get('dueAfter') // inclusive (YYYY-MM-DD)

    const matches = (task: TaskResponse) => {
      if (task.archivedAt) return false
      if (status && task.status !== status) return false
      if (priority && task.priority !== priority) return false
      if (assigneeId && task.assignee?.id !== assigneeId) return false
      if (clientId && task.client?.id !== clientId) return false
      if (dueBefore && task.dueDate !== null && task.dueDate > dueBefore) return false
      if (dueAfter && task.dueDate !== null && task.dueDate < dueAfter) return false
      if (q && !task.title.toLowerCase().includes(q) && !(task.description ?? '').toLowerCase().includes(q)) {
        return false
      }
      return true
    }

    const filtered = ALL_TASKS.filter(matches).sort(compareBoardTasks)
    const byStatus = (list: TaskStatus) => filtered.filter((task) => task.status === list)
    const board: BoardResponse = {
      backlog: byStatus('BACKLOG'),
      columns: {
        PENDING: byStatus('PENDING'),
        IN_PROGRESS: byStatus('IN_PROGRESS'),
        BLOCKED: byStatus('BLOCKED'),
        COMPLETED: byStatus('COMPLETED'),
      },
      meta: { total: filtered.length },
    }
    return json(board)
  }),

  // PC-02 (LIST-002): paginated list view (GET /tasks). Mirrors the real
  // service: active tasks only, the same filters as the board, and the
  // allowlisted sort (LIST-001) with the createdAt desc default.
  http.get(`${API_PREFIX}/tasks`, ({ request }) => {
    const user = currentUser()
    if (!user) return unauthorized()
    const url = new URL(request.url)
    const q = (url.searchParams.get('q') ?? '').trim().toLowerCase()
    const status = url.searchParams.get('status') as TaskStatus | null
    const priority = url.searchParams.get('priority') as TaskPriority | null
    const assigneeId = url.searchParams.get('assigneeId')
    const clientId = url.searchParams.get('clientId')
    const sort = url.searchParams.get('sort')
    const order: 'asc' | 'desc' = url.searchParams.get('order') === 'asc' ? 'asc' : 'desc'

    const matches = (task: TaskResponse) => {
      if (task.archivedAt) return false
      if (status && task.status !== status) return false
      if (priority && task.priority !== priority) return false
      if (assigneeId && task.assignee?.id !== assigneeId) return false
      if (clientId && task.client?.id !== clientId) return false
      if (q && !task.title.toLowerCase().includes(q) && !(task.description ?? '').toLowerCase().includes(q)) {
        return false
      }
      return true
    }

    const LIST_SORT_FIELDS = new Set(['title', 'priority', 'status', 'dueDate', 'createdAt', 'updatedAt'])
    const filtered = ALL_TASKS.filter(matches)
    if (sort && LIST_SORT_FIELDS.has(sort)) {
      filtered.sort((a, b) => compareListTasks(a, b, sort, order))
    } else {
      filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    }
    const { page, limit } = parsePage(url, 25)
    return json(paginate(filtered, page, limit))
  }),

  http.get(`${API_PREFIX}/tasks/archived`, ({ request }) => {
    if (!currentUser()) return unauthorized()
    if (currentUser()?.role !== 'ADMIN') {
      return problem(403, 'FORBIDDEN', 'Forbidden', 'Only administrators can view archived tasks.')
    }
    const { page, limit } = parsePage(new URL(request.url), 20)
    return json(paginate(ALL_TASKS.filter((task) => task.archivedAt), page, limit))
  }),

  http.get(`${API_PREFIX}/tasks/:taskId`, ({ params }) => {
    const user = currentUser()
    if (!user) return unauthorized()
    const task = ALL_TASKS.find((item) => item.id === params.taskId)
    if (!task || (task.archivedAt && user.role !== 'ADMIN')) {
      // BOLA-safe (BR-016): archived tasks are invisible to members.
      return problem(404, 'TASK_NOT_FOUND', 'Task not found', 'The requested task does not exist or is not visible to you.')
    }
    return json(task)
  }),

  http.get(`${API_PREFIX}/tasks/:taskId/history`, async ({ request, params }) => {
    const user = currentUser()
    if (!user) return unauthorized()
    const task = ALL_TASKS.find((item) => item.id === params.taskId)
    if (!task || (task.archivedAt && user.role !== 'ADMIN')) {
      return problem(404, 'TASK_NOT_FOUND', 'Task not found', 'The requested task does not exist or is not visible to you.')
    }
    const history = task.id === TASK_OPEN_REDESIGN.id ? TASK_HISTORY : []
    // TASK-API-007: history is paginated ({ data, meta }) — same shape as the
    // real API, so the client unwrap yields { data, meta }.
    const { page, limit } = parsePage(new URL(request.url), 25)
    return json(paginate(history, page, limit))
  }),

  http.post(`${API_PREFIX}/tasks`, async ({ request }) => {
    const user = currentUser()
    if (!user) return unauthorized()
    const body = (await request.json()) as {
      title?: string
      description?: string | null
      status?: TaskStatus
      priority?: TaskPriority
      assigneeId?: string | null
      clientId?: string | null
      dueDate?: string | null
      blockedReason?: string | null
    }
    const errors: FieldError[] = []
    if (!body.title?.trim()) {
      errors.push({ field: 'title', message: 'Title is required.', code: 'REQUIRED' })
    }
    if (!body.priority) {
      errors.push({ field: 'priority', message: 'Priority must be one of LOW, MEDIUM, HIGH, URGENT.', code: 'INVALID_ENUM' })
    }
    if (errors.length > 0) {
      return problem(400, 'VALIDATION_ERROR', 'Validation failed', 'The request payload is invalid.', { errors })
    }
    const status = body.status ?? 'BACKLOG'
    const violation = transitionErrors(status, body.assigneeId, body.clientId, body.blockedReason)
    if (violation) return violation.body

    const now = new Date().toISOString()
    const assignee = body.assigneeId ? findUser(body.assigneeId) : undefined
    const client = body.clientId ? ALL_CLIENTS.find((item) => item.id === body.clientId) : undefined
    const task: TaskResponse = {
      id: crypto.randomUUID(),
      title: body.title!.trim(),
      description: body.description?.trim() || null,
      status,
      priority: body.priority!,
      assignee: assignee ? { id: assignee.id, name: assignee.name } : null,
      client: client ? { id: client.id, companyName: client.companyName } : null,
      dueDate: body.dueDate || null,
      version: 1,
      blockedReason: status === 'BLOCKED' ? body.blockedReason!.trim() : null,
      creator: { id: user.id, name: user.name },
      archivedAt: null,
      archivedBy: null,
      createdAt: now,
      updatedAt: now,
    }
    ALL_TASKS.push(task)
    return json(task, { status: 201 })
  }),

  http.patch(`${API_PREFIX}/tasks/:taskId`, async ({ params, request }) => {
    const user = currentUser()
    if (!user) return unauthorized()
    const task = ALL_TASKS.find((item) => item.id === params.taskId)
    if (!task || (task.archivedAt && user.role !== 'ADMIN')) {
      return problem(404, 'TASK_NOT_FOUND', 'Task not found', 'The requested task does not exist or is not visible to you.')
    }
    if (task.archivedAt) {
      return problem(409, 'TASK_ARCHIVED', 'Task archived', 'This task is archived and can no longer be modified.')
    }
    if (!canEditTask(user, task)) {
      return problem(403, 'FORBIDDEN', 'Forbidden', 'You do not have permission to modify this task.')
    }
    const body = (await request.json()) as {
      title?: string
      description?: string | null
      priority?: TaskPriority
      assigneeId?: string | null
      clientId?: string | null
      dueDate?: string | null
      blockedReason?: string | null
      expectedVersion?: number
    }
    if (body.expectedVersion !== task.version) return staleVersion(task)

    // Allowlist (TASK-API-003) + business rules.
    if (body.title !== undefined) {
      if (!body.title.trim()) {
        return problem(400, 'VALIDATION_ERROR', 'Validation failed', 'Title is required.', {
          errors: [{ field: 'title', message: 'Title is required.', code: 'REQUIRED' }],
        })
      }
      task.title = body.title.trim()
    }
    if (body.description !== undefined) task.description = body.description?.trim() || null
    if (body.priority !== undefined) task.priority = body.priority
    if (body.assigneeId !== undefined) {
      const violation = transitionErrors(task.status, body.assigneeId, undefined, undefined)
      if (violation) return violation.body
      const assignee = body.assigneeId ? findUser(body.assigneeId) : undefined
      task.assignee = assignee ? { id: assignee.id, name: assignee.name } : null
    }
    if (body.clientId !== undefined) {
      // Only the archived-client rule applies here — the assignee rule was
      // already evaluated above with the *new* assignee, so pass the current
      // one (passing undefined would false-positive ASSIGNEE_REQUIRED).
      const violation = transitionErrors(task.status, task.assignee?.id ?? null, body.clientId, undefined)
      if (violation) return violation.body
      const client = body.clientId ? ALL_CLIENTS.find((item) => item.id === body.clientId) : undefined
      if (body.clientId && !client) {
        return problem(404, 'CLIENT_NOT_FOUND', 'Client not found', 'The requested client does not exist.')
      }
      task.client = client ? { id: client.id, companyName: client.companyName } : null
    }
    if (body.dueDate !== undefined) task.dueDate = body.dueDate || null
    if (body.blockedReason !== undefined) {
      if (task.status !== 'BLOCKED') {
        return problem(400, 'VALIDATION_ERROR', 'Validation failed', 'A blocked reason is only accepted while the task is blocked.', {
          errors: [{ field: 'blockedReason', message: 'A blocked reason is only accepted while the task is blocked.', code: 'VALIDATION_ERROR' }],
        })
      }
      task.blockedReason = body.blockedReason?.trim() || null
    }

    task.version += 1
    task.updatedAt = new Date().toISOString()
    return json(task)
  }),

  http.patch(`${API_PREFIX}/tasks/:taskId/status`, async ({ params, request }) => {
    const user = currentUser()
    if (!user) return unauthorized()
    const task = ALL_TASKS.find((item) => item.id === params.taskId)
    if (!task || (task.archivedAt && user.role !== 'ADMIN')) {
      return problem(404, 'TASK_NOT_FOUND', 'Task not found', 'The requested task does not exist or is not visible to you.')
    }
    if (task.archivedAt) {
      return problem(409, 'TASK_ARCHIVED', 'Task archived', 'This task is archived and can no longer be modified.')
    }
    if (!canEditTask(user, task)) {
      return problem(403, 'FORBIDDEN', 'Forbidden', 'You do not have permission to modify this task.')
    }
    const body = (await request.json()) as {
      status?: TaskStatus
      blockedReason?: string | null
      expectedVersion?: number
    }
    if (!body.status) {
      return problem(400, 'VALIDATION_ERROR', 'Validation failed', 'Status is required.', {
        errors: [{ field: 'status', message: 'Status is required.', code: 'REQUIRED' }],
      })
    }
    if (body.expectedVersion !== task.version) return staleVersion(task)

    const violation = transitionErrors(body.status, task.assignee?.id ?? null, task.client?.id ?? null, body.blockedReason ?? task.blockedReason)
    if (violation) return violation.body

    task.status = body.status
    if (body.status === 'BLOCKED') {
      task.blockedReason = body.blockedReason?.trim() || null
    } else {
      // Leaving BLOCKED clears the active reason (BR-011) — history keeps the old value.
      task.blockedReason = null
    }
    task.version += 1
    task.updatedAt = new Date().toISOString()
    return json(task)
  }),

  http.post(`${API_PREFIX}/tasks/:taskId/archive`, async ({ params, request }) => {
    const user = currentUser()
    if (!user) return unauthorized()
    if (user.role !== 'ADMIN') {
      return problem(403, 'FORBIDDEN', 'Forbidden', 'Only administrators can archive tasks.')
    }
    const task = ALL_TASKS.find((item) => item.id === params.taskId)
    if (!task) return problem(404, 'TASK_NOT_FOUND', 'Task not found', 'The requested task does not exist or is not visible to you.')
    const body = (await request.json()) as { expectedVersion?: number }
    if (body.expectedVersion !== task.version) return staleVersion(task)
    if (task.archivedAt) {
      return problem(409, 'TASK_ARCHIVED', 'Task archived', 'This task is already archived.')
    }
    task.archivedAt = new Date().toISOString()
    task.archivedBy = { id: user.id, name: user.name }
    task.version += 1
    task.updatedAt = task.archivedAt
    return json(task)
  }),

  /* ---------- Clients ---------- */

  http.get(`${API_PREFIX}/clients`, ({ request }) => {
    if (!currentUser()) return unauthorized()
    const url = new URL(request.url)
    const { page, limit } = parsePage(url, 10)
    const q = (url.searchParams.get('q') ?? '').trim().toLowerCase()
    const status = url.searchParams.get('status')
    const isAdmin = currentUser()?.role === 'ADMIN'

    // BR-005: ARCHIVED is excluded by default; members never receive archived
    // clients — the filter simply yields an empty page (no 403).
    let items = ALL_CLIENTS
    if (status === 'ARCHIVED' && !isAdmin) {
      items = []
    } else if (status) {
      items = items.filter((client) => client.status === status)
    } else {
      items = items.filter((client) => client.status !== 'ARCHIVED')
    }
    if (q) {
      items = items.filter(
        (client) =>
          client.companyName.toLowerCase().includes(q) ||
          client.contactName.toLowerCase().includes(q) ||
          client.contactEmail.toLowerCase().includes(q),
      )
    }
    return json(paginate(items, page, limit))
  }),

  http.post(`${API_PREFIX}/clients`, async ({ request }) => {
    const user = currentUser()
    if (!user) return unauthorized()
    const body = (await request.json()) as {
      companyName?: string
      industry?: string
      contactName?: string
      contactEmail?: string
      phone?: string
      notes?: string
    }
    const errors: FieldError[] = []
    if (!body.companyName?.trim()) {
      errors.push({ field: 'companyName', message: 'Company name is required.', code: 'REQUIRED' })
    }
    if (!body.contactName?.trim()) {
      errors.push({ field: 'contactName', message: 'Primary contact name is required.', code: 'REQUIRED' })
    }
    if (!body.contactEmail?.trim()) {
      errors.push({ field: 'contactEmail', message: 'Primary contact email is required.', code: 'REQUIRED' })
    } else if (!/^\S+@\S+\.\S+$/.test(body.contactEmail.trim())) {
      errors.push({ field: 'contactEmail', message: 'Enter a valid email address.', code: 'INVALID_FORMAT' })
    }
    if (errors.length > 0) {
      return problem(400, 'VALIDATION_ERROR', 'Validation failed', 'The request payload is invalid.', { errors })
    }
    const now = new Date().toISOString()
    const client: ClientResponse = {
      id: crypto.randomUUID(),
      companyName: body.companyName!.trim(),
      industry: body.industry?.trim() ?? '',
      contactName: body.contactName!.trim(),
      contactEmail: body.contactEmail!.trim().toLowerCase(),
      phone: body.phone?.trim() || null,
      notes: body.notes?.trim() || null,
      status: 'ACTIVE',
      createdBy: { id: user.id, name: user.name },
      createdAt: now,
      updatedAt: now,
    }
    ALL_CLIENTS.push(client)
    return json(client, { status: 201 })
  }),

  http.get(`${API_PREFIX}/clients/:clientId`, ({ params }) => {
    const user = currentUser()
    if (!user) return unauthorized()
    const client = ALL_CLIENTS.find((item) => item.id === params.clientId)
    if (!client || (client.status === 'ARCHIVED' && user.role !== 'ADMIN')) {
      return problem(
        404,
        'CLIENT_NOT_FOUND',
        'Client not found',
        'The requested client does not exist or is not visible to you.',
      )
    }
    const related = ALL_TASKS.filter((task) => task.client?.id === client.id && !task.archivedAt)
    return json({
      client,
      relatedTasks: { data: related, meta: { page: 1, limit: 10, total: related.length } },
    })
  }),

  http.patch(`${API_PREFIX}/clients/:clientId`, async ({ params, request }) => {
    if (currentUser()?.role !== 'ADMIN') {
      return problem(403, 'FORBIDDEN', 'Forbidden', 'Only administrators can update clients.')
    }
    const client = ALL_CLIENTS.find((item) => item.id === params.clientId)
    if (!client) {
      return problem(404, 'CLIENT_NOT_FOUND', 'Client not found', 'The requested client does not exist.')
    }
    if (client.status === 'ARCHIVED') {
      return problem(
        409,
        'CLIENT_ARCHIVED',
        'Client archived',
        'This client is archived and can no longer be modified.',
      )
    }
    const body = (await request.json()) as Partial<ClientResponse>
    if (body.companyName !== undefined) client.companyName = body.companyName.trim()
    if (body.industry !== undefined) client.industry = body.industry.trim() ?? ''
    if (body.contactName !== undefined) client.contactName = body.contactName.trim()
    if (body.contactEmail !== undefined) client.contactEmail = body.contactEmail.trim().toLowerCase()
    if (body.phone !== undefined) client.phone = body.phone?.trim() || null
    if (body.notes !== undefined) client.notes = body.notes?.trim() || null
    client.updatedAt = new Date().toISOString()
    return json(client)
  }),

  http.post(`${API_PREFIX}/clients/:clientId/deactivate`, ({ params }) => {
    if (currentUser()?.role !== 'ADMIN') {
      return problem(403, 'FORBIDDEN', 'Forbidden', 'Only administrators can deactivate clients.')
    }
    const client = ALL_CLIENTS.find((item) => item.id === params.clientId)
    if (!client) {
      return problem(404, 'CLIENT_NOT_FOUND', 'Client not found', 'The requested client does not exist.')
    }
    if (client.status === 'ARCHIVED') {
      return problem(
        409,
        'CLIENT_ARCHIVED',
        'Client archived',
        'This client is archived and can no longer be modified.',
      )
    }
    // ACTIVE → INACTIVE; already INACTIVE → 200 no-op (CLI-API-005).
    if (client.status === 'ACTIVE') {
      client.status = 'INACTIVE'
      client.updatedAt = new Date().toISOString()
    }
    return json(client)
  }),

  http.post(`${API_PREFIX}/clients/:clientId/archive`, ({ params }) => {
    if (currentUser()?.role !== 'ADMIN') {
      return problem(403, 'FORBIDDEN', 'Forbidden', 'Only administrators can archive clients.')
    }
    const client = ALL_CLIENTS.find((item) => item.id === params.clientId)
    if (!client) {
      return problem(404, 'CLIENT_NOT_FOUND', 'Client not found', 'The requested client does not exist.')
    }
    if (client.status === 'ARCHIVED') {
      return problem(
        409,
        'CLIENT_ARCHIVED',
        'Client archived',
        'This client is already archived.',
      )
    }
    client.status = 'ARCHIVED'
    client.updatedAt = new Date().toISOString()
    return json(client)
  }),

  /* ---------- Contacts ---------- */

  http.get(`${API_PREFIX}/contacts`, ({ request }) => {
    if (!currentUser()) return unauthorized()
    const url = new URL(request.url)
    const { page, limit } = parsePage(url, 10)
    const q = (url.searchParams.get('q') ?? '').trim().toLowerCase()
    const clientId = url.searchParams.get('clientId')
    const isPrimary = url.searchParams.get('isPrimary')

    // Reads are team-wide (CONT-002); the sort is contractual.
    let items = ALL_CONTACTS
    if (clientId) items = items.filter((contact) => contact.client.id === clientId)
    if (isPrimary === 'true') items = items.filter((contact) => contact.isPrimary)
    if (isPrimary === 'false') items = items.filter((contact) => !contact.isPrimary)
    if (q) {
      items = items.filter(
        (contact) =>
          `${contact.firstName} ${contact.lastName}`.toLowerCase().includes(q) ||
          contact.firstName.toLowerCase().includes(q) ||
          contact.lastName.toLowerCase().includes(q) ||
          (contact.email ?? '').toLowerCase().includes(q),
      )
    }
    return json(paginate(sortContacts(items), page, limit))
  }),

  http.post(`${API_PREFIX}/contacts`, async ({ request }) => {
    const user = currentUser()
    if (!user) return unauthorized()
    if (user.role !== 'ADMIN') {
      return problem(403, 'FORBIDDEN', 'Forbidden', 'Only administrators can create contacts.')
    }
    const body = (await request.json()) as {
      clientId?: string
      firstName?: string
      lastName?: string
      email?: string
      phone?: string
      role?: string
    }
    const errors: FieldError[] = []
    if (!body.clientId) {
      errors.push({ field: 'clientId', message: 'Select a client.', code: 'REQUIRED' })
    }
    if (!body.firstName?.trim()) {
      errors.push({ field: 'firstName', message: 'First name is required.', code: 'REQUIRED' })
    }
    if (!body.lastName?.trim()) {
      errors.push({ field: 'lastName', message: 'Last name is required.', code: 'REQUIRED' })
    }
    if (body.email && !/^\S+@\S+\.\S+$/.test(body.email.trim())) {
      errors.push({ field: 'email', message: 'Enter a valid email address.', code: 'INVALID_FORMAT' })
    }
    if (errors.length > 0) {
      return problem(400, 'VALIDATION_ERROR', 'Validation failed', 'The request payload is invalid.', { errors })
    }
    if (!body.clientId || !ALL_CLIENTS.some((client) => client.id === body.clientId)) {
      return problem(404, 'CLIENT_NOT_FOUND', 'Client not found', 'The requested client does not exist.')
    }
    const email = body.email?.trim().toLowerCase()
    if (email && contactWithEmailInClient(email, body.clientId)) {
      return problem(
        409,
        'CONTACT_EMAIL_EXISTS',
        'Contact email already exists',
        'A contact with this email already exists for this client.',
        {
          errors: [
            {
              field: 'email',
              message: 'A contact with this email already exists for this client.',
              code: 'CONTACT_EMAIL_EXISTS',
            },
          ],
        },
      )
    }
    const now = new Date().toISOString()
    const client = ALL_CLIENTS.find((item) => item.id === body.clientId)!
    const contact: ContactResponse = {
      id: crypto.randomUUID(),
      client: { id: client.id, companyName: client.companyName },
      firstName: body.firstName!.trim(),
      lastName: body.lastName!.trim(),
      email: email || null,
      phone: body.phone?.trim() || null,
      role: body.role?.trim() || null,
      isPrimary: false,
      createdAt: now,
      updatedAt: now,
    }
    ALL_CONTACTS.push(contact)
    return json(contact, { status: 201 })
  }),

  http.get(`${API_PREFIX}/contacts/:contactId`, ({ params }) => {
    if (!currentUser()) return unauthorized()
    const contact = ALL_CONTACTS.find((item) => item.id === params.contactId)
    if (!contact) {
      return problem(
        404,
        'CONTACT_NOT_FOUND',
        'Contact not found',
        'The requested contact does not exist or is not visible to you.',
      )
    }
    return json(contact)
  }),

  http.patch(`${API_PREFIX}/contacts/:contactId`, async ({ params, request }) => {
    if (currentUser()?.role !== 'ADMIN') {
      return problem(403, 'FORBIDDEN', 'Forbidden', 'Only administrators can update contacts.')
    }
    const contact = ALL_CONTACTS.find((item) => item.id === params.contactId)
    if (!contact) {
      return problem(404, 'CONTACT_NOT_FOUND', 'Contact not found', 'The requested contact does not exist.')
    }
    const body = (await request.json()) as {
      firstName?: string
      lastName?: string
      email?: string
      phone?: string
      role?: string
    }
    // Empty body → 400 (CONT-API-004).
    if (!['firstName', 'lastName', 'email', 'phone', 'role'].some((key) => key in body)) {
      return problem(400, 'VALIDATION_ERROR', 'Validation failed', 'At least one field is required.')
    }
    if (body.firstName !== undefined) {
      if (!body.firstName.trim()) {
        return problem(400, 'VALIDATION_ERROR', 'Validation failed', 'First name is required.', {
          errors: [{ field: 'firstName', message: 'First name is required.', code: 'REQUIRED' }],
        })
      }
      contact.firstName = body.firstName.trim()
    }
    if (body.lastName !== undefined) {
      if (!body.lastName.trim()) {
        return problem(400, 'VALIDATION_ERROR', 'Validation failed', 'Last name is required.', {
          errors: [{ field: 'lastName', message: 'Last name is required.', code: 'REQUIRED' }],
        })
      }
      contact.lastName = body.lastName.trim()
    }
    if (body.email !== undefined) {
      const email = body.email.trim().toLowerCase()
      if (email && !/^\S+@\S+\.\S+$/.test(email)) {
        return problem(400, 'VALIDATION_ERROR', 'Validation failed', 'Enter a valid email address.', {
          errors: [{ field: 'email', message: 'Enter a valid email address.', code: 'INVALID_FORMAT' }],
        })
      }
      const duplicate = email ? contactWithEmailInClient(email, contact.client.id) : undefined
      if (duplicate && duplicate.id !== contact.id) {
        return problem(
          409,
          'CONTACT_EMAIL_EXISTS',
          'Contact email already exists',
          'A contact with this email already exists for this client.',
          {
            errors: [
              {
                field: 'email',
                message: 'A contact with this email already exists for this client.',
                code: 'CONTACT_EMAIL_EXISTS',
              },
            ],
          },
        )
      }
      contact.email = email || null
    }
    if (body.phone !== undefined) contact.phone = body.phone?.trim() || null
    if (body.role !== undefined) contact.role = body.role?.trim() || null
    contact.updatedAt = new Date().toISOString()
    return json(contact)
  }),

  http.post(`${API_PREFIX}/contacts/:contactId/primary`, ({ params }) => {
    const user = currentUser()
    if (!user) return unauthorized()
    if (user.role !== 'ADMIN') {
      return problem(403, 'FORBIDDEN', 'Forbidden', 'Only administrators can change the primary contact.')
    }
    const contact = ALL_CONTACTS.find((item) => item.id === params.contactId)
    if (!contact) {
      return problem(404, 'CONTACT_NOT_FOUND', 'Contact not found', 'The requested contact does not exist.')
    }
    // Idempotent: marking the current primary is a 200 no-op (CONT-API-005).
    if (!contact.isPrimary) {
      ALL_CONTACTS.forEach((item) => {
        if (item.client.id === contact.client.id && item.isPrimary) item.isPrimary = false
      })
      contact.isPrimary = true
      contact.updatedAt = new Date().toISOString()
    }
    return json(contact)
  }),

  http.delete(`${API_PREFIX}/contacts/:contactId`, ({ params }) => {
    const user = currentUser()
    if (!user) return unauthorized()
    if (user.role !== 'ADMIN') {
      return problem(403, 'FORBIDDEN', 'Forbidden', 'Only administrators can delete contacts.')
    }
    const index = ALL_CONTACTS.findIndex((item) => item.id === params.contactId)
    if (index === -1) {
      return problem(404, 'CONTACT_NOT_FOUND', 'Contact not found', 'The requested contact does not exist.')
    }
    const [deleted] = ALL_CONTACTS.splice(index, 1)
    return json(deleted)
  }),

  /* ---------- Users ---------- */

  http.get(`${API_PREFIX}/users`, ({ request }) => {
    if (currentUser()?.role !== 'ADMIN') {
      return problem(403, 'FORBIDDEN', 'Forbidden', 'Only administrators can list users.')
    }
    const url = new URL(request.url)
    const { page, limit } = parsePage(url, 10)
    const q = (url.searchParams.get('q') ?? '').trim().toLowerCase()
    const status = url.searchParams.get('status')
    const role = url.searchParams.get('role')

    let items = ALL_USERS
    if (status) items = items.filter((user) => user.status === status)
    if (role) items = items.filter((user) => user.role === role)
    if (q) {
      items = items.filter(
        (user) => user.name.toLowerCase().includes(q) || user.email.toLowerCase().includes(q),
      )
    }
    return json(paginate(items, page, limit))
  }),

  http.post(`${API_PREFIX}/users`, async ({ request }) => {
    if (currentUser()?.role !== 'ADMIN') {
      return problem(403, 'FORBIDDEN', 'Forbidden', 'Only administrators can create users.')
    }
    const body = (await request.json()) as {
      name?: string
      email?: string
      password?: string
      role?: 'ADMIN' | 'MEMBER'
    }
    const errors: FieldError[] = []
    if (!body.name?.trim()) {
      errors.push({ field: 'name', message: 'Name is required.', code: 'REQUIRED' })
    }
    if (!body.email?.trim()) {
      errors.push({ field: 'email', message: 'Email is required.', code: 'REQUIRED' })
    } else if (!/^\S+@\S+\.\S+$/.test(body.email.trim())) {
      errors.push({ field: 'email', message: 'Enter a valid email address.', code: 'INVALID_FORMAT' })
    }
    if (!body.password || body.password.length < 8) {
      errors.push({ field: 'password', message: 'Password must be at least 8 characters.', code: 'INVALID_LENGTH' })
    }
    if (errors.length > 0) {
      return problem(400, 'VALIDATION_ERROR', 'Validation failed', 'The request payload is invalid.', { errors })
    }

    const email = body.email!.trim().toLowerCase()
    if (ALL_USERS.some((user) => user.email.toLowerCase() === email)) {
      return problem(
        409,
        'EMAIL_ALREADY_EXISTS',
        'Email already exists',
        'A user with this email already exists.',
        { errors: [{ field: 'email', message: 'A user with this email already exists.', code: 'EMAIL_ALREADY_EXISTS' }] },
      )
    }
    const now = new Date().toISOString()
    const user: UserResponse = {
      id: crypto.randomUUID(),
      email,
      name: body.name!.trim(),
      role: body.role === 'ADMIN' ? 'ADMIN' : 'MEMBER',
      status: 'ACTIVE',
      lastLoginAt: null,
      createdAt: now,
      updatedAt: now,
    }
    ALL_USERS.push(user)
    return json(user, { status: 201 })
  }),

  http.patch(`${API_PREFIX}/users/:userId`, async ({ params, request }) => {
    if (currentUser()?.role !== 'ADMIN') {
      return problem(403, 'FORBIDDEN', 'Forbidden', 'Only administrators can update users.')
    }
    const target = findUser(String(params.userId))
    if (!target) return problem(404, 'USER_NOT_FOUND', 'User not found', 'The requested user does not exist.')
    const body = (await request.json()) as { name?: string; role?: 'ADMIN' | 'MEMBER'; status?: 'ACTIVE' | 'INACTIVE' }

    // BR-003: demoting or deactivating the last active admin is impossible.
    if (isLastActiveAdmin(target)) {
      const removesAdmin = body.role === 'MEMBER' || body.status === 'INACTIVE'
      if (removesAdmin) {
        return problem(
          409,
          'LAST_ADMIN',
          'Last administrator',
          'You cannot demote or deactivate the last active administrator.',
        )
      }
    }
    if (body.name !== undefined) target.name = body.name.trim()
    if (body.role !== undefined) target.role = body.role
    if (body.status !== undefined) target.status = body.status
    target.updatedAt = new Date().toISOString()
    return json(target)
  }),

  http.get(`${API_PREFIX}/users/:userId/deactivation-impact`, ({ params }) => {
    if (currentUser()?.role !== 'ADMIN') {
      return problem(403, 'FORBIDDEN', 'Forbidden', 'Only administrators can view user impact.')
    }
    const target = findUser(String(params.userId))
    if (!target) return problem(404, 'USER_NOT_FOUND', 'User not found', 'The requested user does not exist.')
    const assignedTasks = activeTasksOf(target.id)
    return json({
      userId: target.id,
      assignedCount: assignedTasks.length,
      createdCount: ALL_TASKS.filter(
        (task) => !task.archivedAt && task.status !== 'COMPLETED' && task.creator.id === target.id,
      ).length,
      requiresReassignment: assignedTasks.length > 0,
      assignedTasks,
    })
  }),

  http.post(`${API_PREFIX}/users/:userId/deactivate`, async ({ params, request }) => {
    if (currentUser()?.role !== 'ADMIN') {
      return problem(403, 'FORBIDDEN', 'Forbidden', 'Only administrators can deactivate users.')
    }
    const target = findUser(String(params.userId))
    if (!target) return problem(404, 'USER_NOT_FOUND', 'User not found', 'The requested user does not exist.')
    if (isLastActiveAdmin(target)) {
      return problem(
        409,
        'LAST_ADMIN',
        'Last administrator',
        'You cannot deactivate the last active administrator.',
      )
    }
    const body = (await request.json()) as { reassignments?: { taskId: string; assigneeId: string }[] }
    const assignedTasks = activeTasksOf(target.id)
    if (assignedTasks.length > 0 && (!body.reassignments || body.reassignments.length === 0)) {
      return problem(
        422,
        'REASSIGNMENT_REQUIRED',
        'Reassignment required',
        'Reassign this user\'s active tasks before deactivating them.',
        { errors: [{ field: 'reassignments', message: 'Reassign the active tasks first.', code: 'REASSIGNMENT_REQUIRED' }] },
      )
    }
    target.status = 'INACTIVE'
    target.updatedAt = new Date().toISOString()
    return json(target)
  }),

  /* ---------- Profile ---------- */

  http.get(`${API_PREFIX}/profile`, () => {
    const user = currentUser()
    if (!user) return unauthorized()
    return json(user)
  }),

  http.patch(`${API_PREFIX}/profile`, async ({ request }) => {
    const user = currentUser()
    if (!user) return unauthorized()
    const body = (await request.json()) as { name?: string }
    if (!body.name?.trim() || body.name.trim().length > 100) {
      return problem(
        400,
        'VALIDATION_ERROR',
        'Validation failed',
        'The request payload is invalid.',
        { errors: [{ field: 'name', message: 'Name is required and must be 100 characters or fewer.', code: body.name?.trim() ? 'INVALID_LENGTH' : 'REQUIRED' }] },
      )
    }
    user.name = body.name.trim()
    user.updatedAt = new Date().toISOString()
    return json(user)
  }),
]

/* ---------- Test helpers ---------- */

/** Logs the mock user in without going through the login form (tests). */
export function mockLoginAs(email: string | null) {
  loggedInEmail = email
}

/**
 * Restores the mutable fixtures (ALL_CLIENTS/ALL_TASKS/ALL_USERS) to their
 * original state. Handlers mutate them in place (archive, create, rename), so
 * a later test in the same file would otherwise see the previous test's
 * changes — e.g. Bluebird already archived when a member asks for its detail.
 * Called from vitest.setup.ts afterEach.
 */
export function mockResetData() {
  ALL_CLIENTS.splice(0, ALL_CLIENTS.length, ...structuredClone(INITIAL_CLIENTS))
  ALL_TASKS.splice(0, ALL_TASKS.length, ...structuredClone(INITIAL_TASKS))
  ALL_USERS.splice(0, ALL_USERS.length, ...structuredClone(INITIAL_USERS))
  ALL_CONTACTS.splice(0, ALL_CONTACTS.length, ...structuredClone(INITIAL_CONTACTS))
}

/** Module-load snapshots of the fixtures (mockResetData restores from these). */
const INITIAL_CLIENTS = structuredClone(ALL_CLIENTS)
const INITIAL_TASKS = structuredClone(ALL_TASKS)
const INITIAL_USERS = structuredClone(ALL_USERS)
const INITIAL_CONTACTS = structuredClone(ALL_CONTACTS)
