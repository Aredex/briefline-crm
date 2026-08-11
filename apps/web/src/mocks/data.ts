/*
 * Mock fixtures — derived from the OpenAPI v1 examples
 * (.claude/plans/openapi-and-errors.md §2 and §4).
 *
 * NOTE: these arrays are mutable by design — the handlers push created
 * clients/users so create-then-fetch flows behave like the real API.
 */
import type {
  BoardResponse,
  ClientResponse,
  Kpis,
  RecentActivityItem,
  TaskChange,
  TaskResponse,
  UserResponse,
} from '../api/types'

/* ---------- Users ---------- */

export const ADMIN_USER: UserResponse = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'admin@northstar.digital',
  name: 'Alicia Martin',
  role: 'ADMIN',
  status: 'ACTIVE',
  lastLoginAt: '2026-08-10T17:00:00.000Z',
  createdAt: '2026-01-05T09:00:00.000Z',
  updatedAt: '2026-08-10T17:00:00.000Z',
}

export const MEMBER_USER: UserResponse = {
  id: '22222222-2222-4222-8222-222222222222',
  email: 'member@northstar.digital',
  name: 'Marco Ruiz',
  role: 'MEMBER',
  status: 'ACTIVE',
  lastLoginAt: '2026-08-10T16:30:00.000Z',
  createdAt: '2026-02-14T10:00:00.000Z',
  updatedAt: '2026-08-10T16:30:00.000Z',
}

export const MARIA_USER: UserResponse = {
  id: '55555555-5555-4555-8555-555555555555',
  email: 'maria.kim@northstar.digital',
  name: 'Maria Kim',
  role: 'MEMBER',
  status: 'ACTIVE',
  lastLoginAt: '2026-08-09T09:12:00.000Z',
  createdAt: '2026-03-20T09:00:00.000Z',
  updatedAt: '2026-08-09T09:12:00.000Z',
}

export const INACTIVE_USER: UserResponse = {
  id: '99999999-9999-4999-8999-999999999999',
  email: 'noemi@northstar.digital',
  name: 'Noemi Torres',
  role: 'MEMBER',
  status: 'INACTIVE',
  lastLoginAt: null,
  createdAt: '2026-03-01T08:00:00.000Z',
  updatedAt: '2026-06-20T12:00:00.000Z',
}

export const ALL_USERS: UserResponse[] = [ADMIN_USER, MEMBER_USER, MARIA_USER, INACTIVE_USER]

/* ---------- Clients ---------- */

export const BLUEBIRD_CLIENT: ClientResponse = {
  id: '33333333-3333-4333-8333-333333333333',
  companyName: 'Bluebird Coffee Co.',
  industry: 'Retail',
  contactName: 'Sofia Lindqvist',
  contactEmail: 'sofia@bluebirdcoffee.example',
  phone: '+34 600 123 456',
  notes: 'Rebranding discussion scheduled for September.',
  status: 'ACTIVE',
  createdBy: { id: ADMIN_USER.id, name: ADMIN_USER.name },
  createdAt: '2026-02-10T10:00:00.000Z',
  updatedAt: '2026-08-02T09:00:00.000Z',
}

export const VELA_CLIENT: ClientResponse = {
  id: '77777777-7777-4777-8777-777777777777',
  companyName: 'Vela Analytics',
  industry: 'SaaS',
  contactName: 'Daniel Okafor',
  contactEmail: 'daniel@vela.example',
  phone: null,
  notes: 'Enterprise plan; annual review in Q4.',
  status: 'ACTIVE',
  createdBy: { id: ADMIN_USER.id, name: ADMIN_USER.name },
  createdAt: '2026-03-22T15:30:00.000Z',
  updatedAt: '2026-07-18T12:00:00.000Z',
}

export const NIMBUS_CLIENT: ClientResponse = {
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  companyName: 'Nimbus Hosting',
  industry: 'Web hosting',
  contactName: 'Tom Eriksen',
  contactEmail: 'tom@nimbushosting.example',
  phone: null,
  notes: null,
  status: 'INACTIVE',
  createdBy: { id: MEMBER_USER.id, name: MEMBER_USER.name },
  createdAt: '2026-05-04T09:00:00.000Z',
  updatedAt: '2026-07-30T14:00:00.000Z',
}

export const ARCHIVED_CLIENT: ClientResponse = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  companyName: 'Sunrise Textiles',
  industry: 'Manufacturing',
  contactName: 'Leila Haddad',
  contactEmail: 'leila@sunrisetextiles.example',
  phone: null,
  notes: null,
  status: 'ARCHIVED',
  createdBy: { id: ADMIN_USER.id, name: ADMIN_USER.name },
  createdAt: '2026-01-18T11:00:00.000Z',
  updatedAt: '2026-06-25T10:00:00.000Z',
}

export const ALL_CLIENTS: ClientResponse[] = [
  BLUEBIRD_CLIENT,
  VELA_CLIENT,
  NIMBUS_CLIENT,
  ARCHIVED_CLIENT,
]

/* ---------- Tasks ---------- */

export const TASK_OPEN_REDESIGN: TaskResponse = {
  id: '44444444-4444-4444-8444-444444444444',
  title: 'Redesign onboarding flow',
  description: 'Modernize the sign-up wizard and reduce drop-off at step 2.',
  status: 'IN_PROGRESS',
  priority: 'HIGH',
  assignee: { id: ADMIN_USER.id, name: ADMIN_USER.name },
  client: { id: BLUEBIRD_CLIENT.id, companyName: BLUEBIRD_CLIENT.companyName },
  dueDate: '2026-08-21',
  version: 3,
  blockedReason: null,
  creator: { id: ADMIN_USER.id, name: ADMIN_USER.name },
  archivedAt: null,
  archivedBy: null,
  createdAt: '2026-07-15T10:00:00.000Z',
  updatedAt: '2026-08-10T16:05:00.000Z',
}

/** Backlog task WITHOUT assignee — the "Assign someone first" case (BR-008/BR-009). */
export const TASK_SITE_REDESIGN: TaskResponse = {
  id: '66666666-6666-4666-8666-666666666666',
  title: 'Site-wide redesign',
  description: 'Refresh the marketing site to match the new brand guidelines.',
  status: 'BACKLOG',
  priority: 'MEDIUM',
  assignee: null,
  client: { id: VELA_CLIENT.id, companyName: VELA_CLIENT.companyName },
  dueDate: '2026-09-05',
  version: 1,
  blockedReason: null,
  creator: { id: MEMBER_USER.id, name: MEMBER_USER.name },
  archivedAt: null,
  archivedBy: null,
  createdAt: '2026-08-03T13:20:00.000Z',
  updatedAt: '2026-08-03T13:20:00.000Z',
}

export const TASK_OVERDUE: TaskResponse = {
  id: '12121212-1212-4121-8121-121212121212',
  title: 'Renew hosting certificate',
  description: 'The TLS cert for the staging environment expires this week.',
  status: 'PENDING',
  priority: 'URGENT',
  assignee: { id: MEMBER_USER.id, name: MEMBER_USER.name },
  client: { id: BLUEBIRD_CLIENT.id, companyName: BLUEBIRD_CLIENT.companyName },
  dueDate: '2026-08-05',
  version: 2,
  blockedReason: null,
  creator: { id: ADMIN_USER.id, name: ADMIN_USER.name },
  archivedAt: null,
  archivedBy: null,
  createdAt: '2026-07-28T09:00:00.000Z',
  updatedAt: '2026-08-09T12:00:00.000Z',
}

export const TASK_BLOCKED: TaskResponse = {
  id: '13131313-1313-4131-8131-131313131313',
  title: 'Q3 email campaign',
  description: 'Draft and schedule the quarterly newsletter.',
  status: 'BLOCKED',
  priority: 'HIGH',
  assignee: { id: MEMBER_USER.id, name: MEMBER_USER.name },
  client: { id: VELA_CLIENT.id, companyName: VELA_CLIENT.companyName },
  dueDate: '2026-08-31',
  version: 2,
  blockedReason: 'Waiting for client feedback on the mockups.',
  creator: { id: MEMBER_USER.id, name: MEMBER_USER.name },
  archivedAt: null,
  archivedBy: null,
  createdAt: '2026-07-20T11:00:00.000Z',
  updatedAt: '2026-08-09T11:00:00.000Z',
}

export const TASK_NO_DUE: TaskResponse = {
  id: '14141414-1414-4141-8141-141414141414',
  title: 'Accessibility pass on checkout',
  description: 'Audit and fix WCAG 2.2 AA issues on the checkout flow.',
  status: 'IN_PROGRESS',
  priority: 'LOW',
  assignee: { id: ADMIN_USER.id, name: ADMIN_USER.name },
  client: null,
  dueDate: null,
  version: 1,
  blockedReason: null,
  creator: { id: ADMIN_USER.id, name: ADMIN_USER.name },
  archivedAt: null,
  archivedBy: null,
  createdAt: '2026-08-01T08:30:00.000Z',
  updatedAt: '2026-08-08T16:00:00.000Z',
}

export const TASK_COMPLETED: TaskResponse = {
  id: '15151515-1515-4151-8151-151515151515',
  title: 'Fix checkout bug',
  description: 'Resolve the double-charge on card decline retries.',
  status: 'COMPLETED',
  priority: 'URGENT',
  assignee: { id: ADMIN_USER.id, name: ADMIN_USER.name },
  client: { id: VELA_CLIENT.id, companyName: VELA_CLIENT.companyName },
  dueDate: '2026-08-01',
  version: 5,
  blockedReason: null,
  creator: { id: ADMIN_USER.id, name: ADMIN_USER.name },
  archivedAt: null,
  archivedBy: null,
  createdAt: '2026-07-10T08:00:00.000Z',
  updatedAt: '2026-08-01T17:45:00.000Z',
}

export const TASK_ARCHIVED: TaskResponse = {
  id: '88888888-8888-4888-8888-888888888888',
  title: 'Migrate mailing platform',
  description: 'Move transactional email to the new provider.',
  status: 'COMPLETED',
  priority: 'LOW',
  assignee: { id: ADMIN_USER.id, name: ADMIN_USER.name },
  client: null,
  dueDate: '2026-06-30',
  version: 2,
  blockedReason: null,
  creator: { id: ADMIN_USER.id, name: ADMIN_USER.name },
  archivedAt: '2026-07-01T09:00:00.000Z',
  archivedBy: { id: ADMIN_USER.id, name: ADMIN_USER.name },
  createdAt: '2026-05-10T08:00:00.000Z',
  updatedAt: '2026-07-01T09:00:00.000Z',
}

export const ALL_TASKS: TaskResponse[] = [
  TASK_OPEN_REDESIGN,
  TASK_SITE_REDESIGN,
  TASK_OVERDUE,
  TASK_BLOCKED,
  TASK_NO_DUE,
  TASK_COMPLETED,
  TASK_ARCHIVED,
]

export const TASK_HISTORY: TaskChange[] = [
  {
    id: 'aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    taskId: TASK_OPEN_REDESIGN.id,
    version: 3,
    event: 'STATUS_CHANGED',
    field: 'status',
    oldValue: '"PENDING"',
    newValue: '"IN_PROGRESS"',
    actor: { id: ADMIN_USER.id, name: ADMIN_USER.name },
    createdAt: '2026-08-10T16:05:00.000Z',
  },
  {
    id: 'aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
    taskId: TASK_OPEN_REDESIGN.id,
    version: 2,
    event: 'ASSIGNEE_CHANGED',
    field: 'assigneeId',
    oldValue: `"${MEMBER_USER.id}"`,
    newValue: `"${ADMIN_USER.id}"`,
    actor: { id: ADMIN_USER.id, name: ADMIN_USER.name },
    createdAt: '2026-08-09T11:40:00.000Z',
  },
  {
    id: 'aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
    taskId: TASK_OPEN_REDESIGN.id,
    version: 1,
    event: 'CREATED',
    field: null,
    oldValue: null,
    newValue: '{"title":"Redesign onboarding flow"}',
    actor: { id: ADMIN_USER.id, name: ADMIN_USER.name },
    createdAt: '2026-07-15T10:00:00.000Z',
  },
]

/* ---------- Board & dashboard ---------- */

export const BOARD: BoardResponse = {
  backlog: [TASK_SITE_REDESIGN],
  columns: {
    PENDING: [],
    IN_PROGRESS: [TASK_OPEN_REDESIGN],
    BLOCKED: [],
    COMPLETED: [],
  },
  meta: { total: 1 },
}

export const KPIS: Kpis = {
  open: 24,
  overdue: 3,
  blocked: 1,
  completedLast7Days: 9,
}

export const RECENT_ACTIVITY: RecentActivityItem[] = [
  {
    id: 'bbbbbbb1-bbbb-4bbb-8bbb-bbbbbbbbbbbb01',
    type: 'STATUS_CHANGED',
    taskId: TASK_OPEN_REDESIGN.id,
    taskTitle: TASK_OPEN_REDESIGN.title,
    actorName: ADMIN_USER.name,
    occurredAt: '2026-08-10T16:05:00.000Z',
  },
  {
    id: 'bbbbbbb1-bbbb-4bbb-8bbb-bbbbbbbbbbbb02',
    type: 'CREATED',
    taskId: TASK_SITE_REDESIGN.id,
    taskTitle: TASK_SITE_REDESIGN.title,
    actorName: MEMBER_USER.name,
    occurredAt: '2026-08-03T13:20:00.000Z',
  },
]

/* ---------- Auth ---------- */

export const DEMO_PASSWORD = 'Briefline2026!'

/** Only ACTIVE users can authenticate; INACTIVE login → 401 INVALID_CREDENTIALS. */
export function findDemoUser(email: string): UserResponse | null {
  const normalized = email.trim().toLowerCase()
  return [ADMIN_USER, MEMBER_USER].find((user) => user.email === normalized) ?? null
}
