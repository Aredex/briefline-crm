// Deterministic demo seed — PH-03 DB-005 (data-model.md §8).
//
// Northstar Digital Studio demo data: 8 users, 12 clients, 3 contacts,
// 36 tasks, 124 TaskChange events, fixed formal-v4 UUIDs, timestamps relative
// to seed execution time (overdue / due-today / recently-completed states stay
// stable on every run).
//
// Idempotency: fixed IDs + deleteMany-by-id before createMany, all inside one
// interactive $transaction — safe to run repeatedly (AP-43; PH-03 verification
// runs seed/reset three times).
//
// Run with: pnpm --filter @briefline/api prisma:seed
// (tsx prisma/seed.ts, DATABASE_URL = Neon pooled URL at runtime).
import { pathToFileURL } from 'node:url'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../../../packages/api-contract/src/generated/prisma/client'

// ---------------------------------------------------------------------------
// Demo password and precomputed hash
// ---------------------------------------------------------------------------

/**
 * Demo password for EVERY seeded account: `briefline-demo-2026` (19 chars,
 * satisfies @Length(8,72); published in the README and OpenAPI examples —
 * public demo, OBJ-005).
 *
 * Precomputed Argon2id PHC string (OWASP params m=19456 KiB, t=2, p=1,
 * hashLength 32 — AP-54) so the seed is fully deterministic and does not
 * recompute hashes at runtime. Verify with:
 *   argon2.verify(DEMO_PASSWORD_HASH, 'briefline-demo-2026')
 */
export const DEMO_PASSWORD_HASH =
  '$argon2id$v=19$m=19456,p=1,t=2$DtMFf58lBRt9rW+g6miBjQ$/F6rLUVvTE6Mxvhsamq5DmAhMlSGAq9qyn/Dm5RMp9k'

// ---------------------------------------------------------------------------
// Fixed UUIDs (data-model §8.6): 00000000-0000-4000-8000-0000000000NN
// users …001-008, clients …101-112, tasks …201-236, changes …301+
// ---------------------------------------------------------------------------

// 12-hex last segment (data-model §8.6): '01' -> …001, '301' -> …301.
const uuid = (suffix: string): string => `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`

export const SEED_IDS = {
  users: {
    admin1: uuid('01'),
    admin2: uuid('02'),
    member1: uuid('03'),
    member2: uuid('04'),
    member3: uuid('05'),
    member4: uuid('06'),
    member5: uuid('07'),
    member6: uuid('08'),
  },
  clients: {
    c101: uuid('101'),
    c102: uuid('102'),
    c103: uuid('103'),
    c104: uuid('104'),
    c105: uuid('105'),
    c106: uuid('106'),
    c107: uuid('107'),
    c108: uuid('108'),
    c109: uuid('109'),
    c110: uuid('110'),
    c111: uuid('111'),
    c112: uuid('112'),
  },
  contacts: {
    ct401: uuid('401'),
    ct402: uuid('402'),
    ct403: uuid('403'),
  },
  tasks: {
    t201: uuid('201'),
    t202: uuid('202'),
    t203: uuid('203'),
    t204: uuid('204'),
    t205: uuid('205'),
    t206: uuid('206'),
    t207: uuid('207'),
    t208: uuid('208'),
    t209: uuid('209'),
    t210: uuid('210'),
    t211: uuid('211'),
    t212: uuid('212'),
    t213: uuid('213'),
    t214: uuid('214'),
    t215: uuid('215'),
    t216: uuid('216'),
    t217: uuid('217'),
    t218: uuid('218'),
    t219: uuid('219'),
    t220: uuid('220'),
    t221: uuid('221'),
    t222: uuid('222'),
    t223: uuid('223'),
    t224: uuid('224'),
    t225: uuid('225'),
    t226: uuid('226'),
    t227: uuid('227'),
    t228: uuid('228'),
    t229: uuid('229'),
    t230: uuid('230'),
    t231: uuid('231'),
    t232: uuid('232'),
    t233: uuid('233'),
    t234: uuid('234'),
    t235: uuid('235'),
    t236: uuid('236'),
  },
} as const

// ---------------------------------------------------------------------------
// Domain value types (mirror the generated client enums; kept local so the
// seed compiles before `prisma generate` has run)
// ---------------------------------------------------------------------------

type UserRole = 'ADMIN' | 'MEMBER'
type UserStatus = 'ACTIVE' | 'INACTIVE'
type ClientStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED'
type TaskStatus = 'BACKLOG' | 'PENDING' | 'IN_PROGRESS' | 'BLOCKED' | 'COMPLETED'
type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
type TaskChangeEvent =
  | 'CREATED'
  | 'TITLE_CHANGED'
  | 'STATUS_CHANGED'
  | 'PRIORITY_CHANGED'
  | 'ASSIGNEE_CHANGED'
  | 'DUE_DATE_CHANGED'
  | 'ARCHIVED'
  | 'REOPENED'

interface UserSeed {
  id: string
  email: string
  name: string
  role: UserRole
  status: UserStatus
  passwordHash: string
  lastLoginAt: Date | null
  createdAt: Date
  updatedAt: Date
}

interface ClientSeed {
  id: string
  companyName: string
  industry: string | null
  contactName: string
  contactEmail: string
  phone: string | null
  status: ClientStatus
  notes: string | null
  createdById: string
  createdAt: Date
  updatedAt: Date
}

interface ContactSeed {
  id: string
  clientId: string
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  role: string | null
  isPrimary: boolean
  createdAt: Date
  updatedAt: Date
}

interface TaskChangeSeed {
  id: string
  taskId: string
  actorId: string
  event: TaskChangeEvent
  field: string | null
  oldValue: string | null
  newValue: string | null
  createdAt: Date
}

interface TaskSeed {
  id: string
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  assigneeId: string | null
  clientId: string | null
  dueDate: string | null // 'YYYY-MM-DD' (date-only, ADR-003)
  blockedReason: string | null
  creatorId: string
  version: number
  archivedAt: Date | null
  archivedById: string | null
  createdAt: Date
  updatedAt: Date
}

// ---------------------------------------------------------------------------
// Temporal helpers — Europe/Madrid day boundaries (ADR-003)
// ---------------------------------------------------------------------------

const HOUR = 3_600_000
const DAY = 24 * HOUR

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * HOUR)
}

/** 'YYYY-MM-DD' for "today + offsetDays" evaluated in Europe/Madrid (ADR-003). */
function madridDateOffset(offsetDays: number): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(Date.now() + offsetDays * DAY))
  const y = parts.find((p) => p.type === 'year')?.value ?? '2026'
  const m = parts.find((p) => p.type === 'month')?.value ?? '01'
  const d = parts.find((p) => p.type === 'day')?.value ?? '01'
  return `${y}-${m}-${d}`
}

const TODAY = madridDateOffset(0)

/** JSON-serialized old/new value for TaskChange (D-7): '"uuid"' / '"date"' / 'null'. */
const ser = (value: string | null): string => (value === null ? 'null' : JSON.stringify(value))

// ---------------------------------------------------------------------------
// Users — 8 (2 ADMIN, 6 MEMBER) — data-model §8.1
// ---------------------------------------------------------------------------

function buildUsers(): UserSeed[] {
  const created = hoursAgo(60 * 24)
  const mk = (
    id: string,
    email: string,
    name: string,
    role: UserRole,
    status: UserStatus,
    lastLoginAt: Date | null,
  ): UserSeed => ({
    id,
    email, // pre-normalized lowercase (ADR-002)
    name,
    role,
    status,
    passwordHash: DEMO_PASSWORD_HASH,
    lastLoginAt,
    createdAt: created,
    updatedAt: created,
  })
  const { admin1, admin2, member1, member2, member3, member4, member5, member6 } = SEED_IDS.users
  return [
    mk(admin1, 'admin@briefline.demo', 'Alex Rivera', 'ADMIN', 'ACTIVE', hoursAgo(2)),
    mk(admin2, 'admin2@briefline.demo', 'Sara Chen', 'ADMIN', 'ACTIVE', hoursAgo(5)),
    mk(member1, 'member@briefline.demo', 'Marco Díaz', 'MEMBER', 'ACTIVE', hoursAgo(1)),
    mk(member2, 'member2@briefline.demo', 'Lea Fernández', 'MEMBER', 'ACTIVE', hoursAgo(7)),
    mk(member3, 'member3@briefline.demo', 'Noah Patel', 'MEMBER', 'ACTIVE', hoursAgo(12)),
    mk(member4, 'member4@briefline.demo', 'Emma Novak', 'MEMBER', 'ACTIVE', hoursAgo(26)), // yesterday
    mk(member5, 'member5@briefline.demo', 'Lucas Ortiz', 'MEMBER', 'ACTIVE', hoursAgo(3 * 24)), // 3 days ago
    mk(member6, 'member6@briefline.demo', 'Irene Santos', 'MEMBER', 'INACTIVE', null), // never logged in
  ]
}

// ---------------------------------------------------------------------------
// Clients — 12 (8 ACTIVE, 2 INACTIVE, 2 ARCHIVED) — data-model §8.2
// ---------------------------------------------------------------------------

function buildClients(): ClientSeed[] {
  const created = hoursAgo(50 * 24)
  const mk = (
    id: string,
    companyName: string,
    industry: string | null,
    contactName: string,
    contactEmail: string,
    phone: string | null,
    status: ClientStatus,
    notes: string | null,
    createdById: string,
  ): ClientSeed => ({
    id,
    companyName,
    industry,
    contactName,
    contactEmail, // normalized (ADR-002 invariant, D-16)
    phone,
    status,
    notes,
    createdById,
    createdAt: created,
    updatedAt: created,
  })
  const u = SEED_IDS.users
  const c = SEED_IDS.clients
  return [
    mk(c.c101, 'Nova Cloudworks', 'SaaS', 'Irene Vidal', 'irene@novacloudworks.demo', '+34 610 123 101', 'ACTIVE', 'Expanding to EMEA in Q4.', u.admin1),
    mk(c.c102, 'Brightline Commerce', 'E-commerce', 'Daniel Roca', 'daniel@brightlinecommerce.demo', '+34 610 123 102', 'ACTIVE', null, u.admin1),
    mk(c.c103, 'MedCore Systems', 'Healthcare', 'Alicia Font', 'alicia@medcoresystems.demo', null, 'ACTIVE', 'Compliance review pending.', u.admin2),
    mk(c.c104, 'FinEdge Capital', 'Fintech', 'Bruno Silva', 'bruno@finedgecapital.demo', '+34 610 123 104', 'ACTIVE', null, u.admin2),
    mk(c.c105, 'EduBridge Academy', 'Education', 'Camila Ríos', 'camila@edubridgeacademy.demo', null, 'ACTIVE', null, u.member1),
    mk(c.c106, 'Vertex Manufacturing', 'Manufacturing', 'Diego Ramos', 'diego@vertexmanufacturing.demo', '+34 610 123 106', 'ACTIVE', 'Legacy ERP migration.', u.member1),
    mk(c.c107, 'Casa Aurora Hotels', 'Hospitality', 'Elena Marín', 'elena@casaaurora.demo', '+34 610 123 107', 'ACTIVE', null, u.member2),
    mk(c.c108, 'Pulse Media Group', 'Media', 'Fernando Gil', 'fernando@pulsemedia.demo', null, 'ACTIVE', null, u.member2),
    mk(c.c109, 'Urban Retail Co.', 'Retail', 'Gloria Pons', 'gloria@urbanretail.demo', '+34 610 123 109', 'INACTIVE', 'Paused contract — renew in September.', u.member3),
    mk(c.c110, 'GreenPath Nonprofit', 'Nonprofit', 'Hugo León', 'hugo@greenpath.demo', null, 'INACTIVE', null, u.member3),
    mk(c.c111, 'Harbor Consulting Group', 'Consulting', 'Inés Puig', 'ines@harborconsulting.demo', null, 'ARCHIVED', 'Portfolio complete 2025 — archived.', u.admin1),
    mk(c.c112, 'Digital Nest Agency', 'Digital Agency', 'Javier Costa', 'javier@digitalnest.demo', '+34 610 123 112', 'ARCHIVED', null, u.admin2),
  ]
}

// ---------------------------------------------------------------------------
// Contacts — 3 (PC-01, PH-14) — data-model §8.2 extension
// ---------------------------------------------------------------------------
// ct401 (Nova Cloudworks, primary) mirrors the client's legacy contactName/
// contactEmail; ct402 is a second contact of the same client (CONT-001:
// multiple contacts per client); ct403 is the single primary of Brightline
// Commerce. Emails are pre-normalized (ADR-002).

function buildContacts(): ContactSeed[] {
  const created = hoursAgo(40 * 24)
  const c = SEED_IDS.clients
  const ct = SEED_IDS.contacts
  const mk = (
    id: string,
    clientId: string,
    firstName: string,
    lastName: string,
    email: string | null,
    phone: string | null,
    role: string | null,
    isPrimary: boolean,
  ): ContactSeed => ({
    id,
    clientId,
    firstName,
    lastName,
    email,
    phone,
    role,
    isPrimary,
    createdAt: created,
    updatedAt: created,
  })
  return [
    mk(ct.ct401, c.c101, 'Irene', 'Vidal', 'irene@novacloudworks.demo', '+34 610 123 101', 'CEO', true),
    mk(ct.ct402, c.c101, 'Marc', 'Serra', 'marc@novacloudworks.demo', null, 'Design Lead', false),
    mk(ct.ct403, c.c102, 'Daniel', 'Roca', 'daniel@brightlinecommerce.demo', '+34 610 123 102', 'CEO', true),
  ]
}

// ---------------------------------------------------------------------------
// Tasks — 36 (data-model §8.3) with their full TaskChange event plan (§8.4)
// ---------------------------------------------------------------------------
// Event ordering: changes[] is chronological; CREATED is implied first.
// Task.version invariant (D-5): version = 1 + changes.length.
// ---------------------------------------------------------------------------

interface TaskChangePlan {
  event: TaskChangeEvent
  field: string | null
  oldValue: string | null
  newValue: string | null
}

interface TaskPlan {
  id: string
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  assigneeId: string | null
  clientId: string | null
  dueDate: string | null
  blockedReason: string | null
  creatorId: string
  createdDaysAgo: number
  lastEventDaysAgo: number
  archivedById: string | null
  changes: TaskChangePlan[]
}

const titleChanged = (oldTitle: string, newTitle: string): TaskChangePlan => ({
  event: 'TITLE_CHANGED',
  field: 'title',
  oldValue: ser(oldTitle),
  newValue: ser(newTitle),
})

const statusChanged = (from: TaskStatus, to: TaskStatus): TaskChangePlan => ({
  event: 'STATUS_CHANGED',
  field: 'status',
  oldValue: ser(from),
  newValue: ser(to),
})

const priorityChanged = (from: TaskPriority, to: TaskPriority): TaskChangePlan => ({
  event: 'PRIORITY_CHANGED',
  field: 'priority',
  oldValue: ser(from),
  newValue: ser(to),
})

const assigneeChanged = (from: string | null, to: string | null): TaskChangePlan => ({
  event: 'ASSIGNEE_CHANGED',
  field: 'assigneeId',
  oldValue: ser(from),
  newValue: ser(to),
})

const dueDateChanged = (from: string | null, to: string | null): TaskChangePlan => ({
  event: 'DUE_DATE_CHANGED',
  field: 'dueDate',
  oldValue: ser(from),
  newValue: ser(to),
})

const archivedEvent = (): TaskChangePlan => ({
  event: 'ARCHIVED',
  field: 'archivedAt',
  oldValue: 'null',
  newValue: ser(new Date().toISOString()),
})

const reopenedEvent = (): TaskChangePlan => ({
  event: 'REOPENED',
  field: 'status',
  oldValue: ser('COMPLETED'),
  newValue: ser('IN_PROGRESS'),
})

function buildTaskPlans(): TaskPlan[] {
  const u = SEED_IDS.users
  const t = SEED_IDS.tasks
  const c = SEED_IDS.clients
  const today = TODAY
  const d = (offset: number): string => madridDateOffset(offset)

  return [
    // ---- BACKLOG ×6 (201-206): 2 unassigned (BR-008), 4 assigned; future or NULL due
    {
      id: t.t201, title: 'Brand refresh: logo exploration', description: 'First logo concepts for Nova Cloudworks.', status: 'BACKLOG', priority: 'MEDIUM', assigneeId: u.member1, clientId: c.c101, dueDate: d(10), blockedReason: null, creatorId: u.admin1, createdDaysAgo: 22, lastEventDaysAgo: 14, archivedById: null,
      changes: [titleChanged('Logo exploration kickoff', 'Brand refresh: logo exploration')],
    },
    {
      id: t.t202, title: 'Onboarding flow: wireframes', description: null, status: 'BACKLOG', priority: 'MEDIUM', assigneeId: null, clientId: c.c102, dueDate: null, blockedReason: null, creatorId: u.admin1, createdDaysAgo: 20, lastEventDaysAgo: 16, archivedById: null,
      changes: [titleChanged('Wireframes: onboarding', 'Onboarding flow: wireframes')],
    },
    {
      id: t.t203, title: 'E-commerce audit: checkout funnel', description: 'Conversion audit for Brightline Commerce.', status: 'BACKLOG', priority: 'MEDIUM', assigneeId: u.member2, clientId: c.c103, dueDate: d(14), blockedReason: null, creatorId: u.admin2, createdDaysAgo: 19, lastEventDaysAgo: 13, archivedById: null,
      changes: [assigneeChanged(null, u.member2)],
    },
    {
      id: t.t204, title: 'Campaign kit: launch email series', description: null, status: 'BACKLOG', priority: 'MEDIUM', assigneeId: u.member3, clientId: null, dueDate: null, blockedReason: null, creatorId: u.admin2, createdDaysAgo: 18, lastEventDaysAgo: 12, archivedById: null,
      changes: [dueDateChanged('null', ser(d(21)))],
    },
    {
      id: t.t205, title: 'Content calendar: Q3 planning', description: 'Quarterly planning with Pulse Media.', status: 'BACKLOG', priority: 'MEDIUM', assigneeId: null, clientId: c.c104, dueDate: d(20), blockedReason: null, creatorId: u.admin1, createdDaysAgo: 17, lastEventDaysAgo: 11, archivedById: null,
      changes: [titleChanged('Q3 content planning', 'Content calendar: Q3 planning'), assigneeChanged(null, u.member5), assigneeChanged(u.member5, null)],
    },
    {
      id: t.t206, title: 'Social templates: monthly pack', description: null, status: 'BACKLOG', priority: 'MEDIUM', assigneeId: u.member5, clientId: c.c105, dueDate: d(15), blockedReason: null, creatorId: u.member1, createdDaysAgo: 16, lastEventDaysAgo: 10, archivedById: null,
      changes: [dueDateChanged('null', ser(d(22))), priorityChanged('LOW', 'MEDIUM')],
    },

    // ---- PENDING ×6 (207-212): all assigned; 2 due today, 1 overdue
    {
      id: t.t207, title: 'Landing page copy: Q3 campaign', description: 'Headlines and hero copy.', status: 'PENDING', priority: 'HIGH', assigneeId: u.member1, clientId: c.c106, dueDate: today, blockedReason: null, creatorId: u.admin1, createdDaysAgo: 14, lastEventDaysAgo: 4, archivedById: null,
      changes: [statusChanged('BACKLOG', 'PENDING'), titleChanged('Copy: Q3 campaign', 'Landing page copy: Q3 campaign'), priorityChanged('MEDIUM', 'HIGH')],
    },
    {
      id: t.t208, title: 'Product shots: studio session', description: null, status: 'PENDING', priority: 'HIGH', assigneeId: u.member2, clientId: c.c107, dueDate: today, blockedReason: null, creatorId: u.admin2, createdDaysAgo: 14, lastEventDaysAgo: 5, archivedById: null,
      changes: [statusChanged('BACKLOG', 'PENDING'), assigneeChanged(null, u.member2), priorityChanged('MEDIUM', 'HIGH')],
    },
    {
      id: t.t209, title: 'Case study: FinEdge Capital', description: 'Success story for the portfolio.', status: 'PENDING', priority: 'HIGH', assigneeId: u.member3, clientId: c.c108, dueDate: null, blockedReason: null, creatorId: u.admin2, createdDaysAgo: 13, lastEventDaysAgo: 3, archivedById: null,
      changes: [titleChanged('Success story draft', 'Case study: FinEdge Capital'), dueDateChanged(ser(d(9)), 'null')],
    },
    {
      id: t.t210, title: 'Video teaser: 30s cut', description: 'Teaser for social channels.', status: 'PENDING', priority: 'HIGH', assigneeId: u.member4, clientId: c.c109, dueDate: d(-2), blockedReason: null, creatorId: u.admin1, createdDaysAgo: 12, lastEventDaysAgo: 6, archivedById: null,
      changes: [titleChanged('Teaser video draft', 'Video teaser: 30s cut'), priorityChanged('MEDIUM', 'HIGH')],
    },
    {
      id: t.t211, title: 'Email design: renewal series', description: null, status: 'PENDING', priority: 'HIGH', assigneeId: u.member1, clientId: c.c110, dueDate: d(5), blockedReason: null, creatorId: u.member1, createdDaysAgo: 15, lastEventDaysAgo: 5, archivedById: null,
      changes: [assigneeChanged(null, u.member1), dueDateChanged('null', ser(d(7)))],
    },
    {
      id: t.t212, title: 'Illustration pack: brand icons', description: null, status: 'PENDING', priority: 'HIGH', assigneeId: u.member2, clientId: null, dueDate: null, blockedReason: null, creatorId: u.member2, createdDaysAgo: 15, lastEventDaysAgo: 4, archivedById: null,
      changes: [assigneeChanged(null, u.member2), priorityChanged('MEDIUM', 'HIGH')],
    },

    // ---- IN_PROGRESS ×7 (213-219): all assigned; 2 overdue; 217/218 carry an
    // unblock transition in history (BR-011: reason preserved in history only)
    {
      id: t.t213, title: 'Website redesign: home hero', description: 'Hero section and above-the-fold.', status: 'IN_PROGRESS', priority: 'URGENT', assigneeId: u.member3, clientId: c.c101, dueDate: null, blockedReason: null, creatorId: u.admin1, createdDaysAgo: 18, lastEventDaysAgo: 3, archivedById: null,
      changes: [titleChanged('Home hero concepts', 'Website redesign: home hero')],
    },
    {
      id: t.t214, title: 'Ad creative: holiday batch A', description: null, status: 'IN_PROGRESS', priority: 'HIGH', assigneeId: u.member4, clientId: c.c102, dueDate: d(-1), blockedReason: null, creatorId: u.admin2, createdDaysAgo: 17, lastEventDaysAgo: 4, archivedById: null,
      changes: [titleChanged('Holiday ad batch A', 'Ad creative: holiday batch A'), priorityChanged('MEDIUM', 'HIGH')],
    },
    {
      id: t.t215, title: 'Motion graphics: product explainer', description: null, status: 'IN_PROGRESS', priority: 'HIGH', assigneeId: u.member1, clientId: c.c103, dueDate: d(-3), blockedReason: null, creatorId: u.admin1, createdDaysAgo: 16, lastEventDaysAgo: 2, archivedById: null,
      changes: [titleChanged('Explainer animation draft', 'Motion graphics: product explainer'), assigneeChanged(null, u.member1)],
    },
    {
      id: t.t216, title: 'UX polish: checkout steps', description: 'Accessibility pass included.', status: 'IN_PROGRESS', priority: 'HIGH', assigneeId: u.member2, clientId: c.c104, dueDate: d(7), blockedReason: null, creatorId: u.admin2, createdDaysAgo: 15, lastEventDaysAgo: 5, archivedById: null,
      changes: [dueDateChanged('null', ser(d(9))), priorityChanged('MEDIUM', 'HIGH')],
    },
    {
      id: t.t217, title: 'Design system: buttons and forms', description: 'Component library milestone.', status: 'IN_PROGRESS', priority: 'HIGH', assigneeId: u.member3, clientId: c.c105, dueDate: null, blockedReason: null, creatorId: u.member1, createdDaysAgo: 20, lastEventDaysAgo: 2, archivedById: null,
      changes: [statusChanged('PENDING', 'BLOCKED'), statusChanged('BLOCKED', 'IN_PROGRESS'), titleChanged('Design system v1', 'Design system: buttons and forms'), assigneeChanged(null, u.member3)],
    },
    {
      id: t.t218, title: 'Photography: editorial series', description: null, status: 'IN_PROGRESS', priority: 'MEDIUM', assigneeId: u.member4, clientId: c.c106, dueDate: null, blockedReason: null, creatorId: u.member2, createdDaysAgo: 19, lastEventDaysAgo: 3, archivedById: null,
      changes: [statusChanged('PENDING', 'BLOCKED'), statusChanged('BLOCKED', 'IN_PROGRESS'), titleChanged('Editorial photo series', 'Photography: editorial series'), priorityChanged('LOW', 'MEDIUM')],
    },
    {
      id: t.t219, title: 'SEO audit: technical pass', description: null, status: 'IN_PROGRESS', priority: 'MEDIUM', assigneeId: u.member1, clientId: null, dueDate: d(3), blockedReason: null, creatorId: u.member1, createdDaysAgo: 14, lastEventDaysAgo: 6, archivedById: null,
      changes: [titleChanged('Technical SEO audit', 'SEO audit: technical pass'), dueDateChanged('null', ser(d(5))), assigneeChanged(null, u.member1)],
    },

    // ---- BLOCKED ×4 (220-223): all assigned, non-empty reason (BR-010); 2 overdue
    {
      id: t.t220, title: 'Rebrand rollout: key visuals', description: 'Awaiting stakeholder approval.', status: 'BLOCKED', priority: 'URGENT', assigneeId: u.admin1, clientId: c.c108, dueDate: null, blockedReason: 'Waiting for stakeholder approval on scope change', creatorId: u.admin1, createdDaysAgo: 13, lastEventDaysAgo: 1, archivedById: null,
      changes: [statusChanged('PENDING', 'BLOCKED'), titleChanged('Key visual rollout', 'Rebrand rollout: key visuals')],
    },
    {
      id: t.t221, title: 'Product launch: asset kit', description: null, status: 'BLOCKED', priority: 'URGENT', assigneeId: u.admin1, clientId: c.c110, dueDate: d(-1), blockedReason: 'Client has not provided required assets', creatorId: u.admin1, createdDaysAgo: 12, lastEventDaysAgo: 1, archivedById: null,
      changes: [statusChanged('IN_PROGRESS', 'BLOCKED'), dueDateChanged(ser(d(-5)), ser(d(-1)))],
    },
    {
      id: t.t222, title: 'API dashboard: brand components', description: null, status: 'BLOCKED', priority: 'URGENT', assigneeId: u.admin2, clientId: c.c109, dueDate: d(-4), blockedReason: 'Third-party API credentials not delivered', creatorId: u.admin2, createdDaysAgo: 12, lastEventDaysAgo: 2, archivedById: null,
      changes: [statusChanged('PENDING', 'BLOCKED'), titleChanged('Dashboard brand components', 'API dashboard: brand components')],
    },
    {
      id: t.t223, title: 'Video: brand film script', description: null, status: 'BLOCKED', priority: 'URGENT', assigneeId: u.member1, clientId: c.c111, dueDate: d(2), blockedReason: 'Legal review pending on vendor contract', creatorId: u.admin1, createdDaysAgo: 11, lastEventDaysAgo: 1, archivedById: null,
      changes: [statusChanged('IN_PROGRESS', 'BLOCKED'), titleChanged('Brand film script draft', 'Video: brand film script')],
    },

    // ---- COMPLETED ×9 (224-232): 7 recently (last event ≤ 7 days), 2 older;
    // 224/225 carry a reopen transition (BR-012); 225 the unassign→reassign sequence
    {
      id: t.t224, title: 'Newsletter template: v2', description: 'Approved and sent.', status: 'COMPLETED', priority: 'LOW', assigneeId: u.admin2, clientId: c.c112, dueDate: null, blockedReason: null, creatorId: u.admin2, createdDaysAgo: 16, lastEventDaysAgo: 2, archivedById: null,
      changes: [statusChanged('IN_PROGRESS', 'COMPLETED'), reopenedEvent(), statusChanged('IN_PROGRESS', 'COMPLETED'), assigneeChanged(null, u.admin2), titleChanged('Newsletter template v1', 'Newsletter template: v2'), priorityChanged('MEDIUM', 'LOW')],
    },
    {
      id: t.t225, title: 'Print brochure: final files', description: null, status: 'COMPLETED', priority: 'LOW', assigneeId: u.member3, clientId: null, dueDate: null, blockedReason: null, creatorId: u.admin1, createdDaysAgo: 15, lastEventDaysAgo: 2, archivedById: null,
      changes: [statusChanged('IN_PROGRESS', 'COMPLETED'), reopenedEvent(), statusChanged('IN_PROGRESS', 'COMPLETED'), assigneeChanged(u.member5, null), assigneeChanged(null, u.member3)],
    },
    {
      id: t.t226, title: 'Blog illustrations: Q2 set', description: null, status: 'COMPLETED', priority: 'MEDIUM', assigneeId: u.member2, clientId: c.c110, dueDate: null, blockedReason: null, creatorId: u.admin1, createdDaysAgo: 18, lastEventDaysAgo: 3, archivedById: null,
      changes: [statusChanged('IN_PROGRESS', 'COMPLETED'), titleChanged('Q2 blog illustrations', 'Blog illustrations: Q2 set'), priorityChanged('HIGH', 'MEDIUM')],
    },
    {
      id: t.t227, title: 'Social calendar: June', description: 'Delivered on time.', status: 'COMPLETED', priority: 'MEDIUM', assigneeId: u.member4, clientId: c.c101, dueDate: null, blockedReason: null, creatorId: u.member1, createdDaysAgo: 20, lastEventDaysAgo: 3, archivedById: null,
      changes: [statusChanged('PENDING', 'COMPLETED'), dueDateChanged(ser(d(6)), 'null'), priorityChanged('HIGH', 'MEDIUM')],
    },
    {
      id: t.t228, title: 'Packaging design: retail line', description: null, status: 'COMPLETED', priority: 'MEDIUM', assigneeId: u.member3, clientId: c.c102, dueDate: null, blockedReason: null, creatorId: u.member2, createdDaysAgo: 19, lastEventDaysAgo: 4, archivedById: null,
      changes: [statusChanged('IN_PROGRESS', 'COMPLETED'), titleChanged('Retail packaging concepts', 'Packaging design: retail line'), priorityChanged('HIGH', 'MEDIUM')],
    },
    {
      id: t.t229, title: 'Web copy: careers page', description: null, status: 'COMPLETED', priority: 'MEDIUM', assigneeId: u.member5, clientId: null, dueDate: null, blockedReason: null, creatorId: u.member1, createdDaysAgo: 17, lastEventDaysAgo: 5, archivedById: null,
      changes: [statusChanged('PENDING', 'COMPLETED'), titleChanged('Careers page copy', 'Web copy: careers page')],
    },
    {
      id: t.t230, title: 'Event branding: summit kit', description: null, status: 'COMPLETED', priority: 'MEDIUM', assigneeId: u.member4, clientId: c.c103, dueDate: null, blockedReason: null, creatorId: u.member2, createdDaysAgo: 16, lastEventDaysAgo: 5, archivedById: null,
      changes: [statusChanged('IN_PROGRESS', 'COMPLETED'), priorityChanged('HIGH', 'MEDIUM')],
    },
    {
      id: t.t231, title: 'Annual report: layout', description: 'Delivered last quarter.', status: 'COMPLETED', priority: 'MEDIUM', assigneeId: u.member4, clientId: c.c104, dueDate: null, blockedReason: null, creatorId: u.admin1, createdDaysAgo: 30, lastEventDaysAgo: 10, archivedById: null,
      changes: [statusChanged('PENDING', 'COMPLETED'), priorityChanged('HIGH', 'MEDIUM')],
    },
    {
      id: t.t232, title: 'Brand guidelines: PDF', description: 'Final version locked.', status: 'COMPLETED', priority: 'LOW', assigneeId: u.member2, clientId: c.c105, dueDate: null, blockedReason: null, creatorId: u.admin2, createdDaysAgo: 32, lastEventDaysAgo: 12, archivedById: null,
      changes: [statusChanged('IN_PROGRESS', 'COMPLETED'), titleChanged('Brand guidelines v1', 'Brand guidelines: PDF'), priorityChanged('MEDIUM', 'LOW')],
    },

    // ---- ARCHIVED ×4 (233-236): archivedAt + archivedById (BR-015); 233 was
    // BLOCKED (reason lives in history), 234 COMPLETED — none is double-archived
    {
      id: t.t233, title: 'Legacy site: migration plan', description: 'Scope frozen after merger.', status: 'BLOCKED', priority: 'LOW', assigneeId: u.member5, clientId: c.c106, dueDate: null, blockedReason: 'Client merged with another brand; scope frozen', creatorId: u.admin1, createdDaysAgo: 40, lastEventDaysAgo: 8, archivedById: u.admin1,
      changes: [statusChanged('PENDING', 'IN_PROGRESS'), statusChanged('IN_PROGRESS', 'BLOCKED'), archivedEvent()],
    },
    {
      id: t.t234, title: 'Press kit: bilingual', description: 'Archived after launch.', status: 'COMPLETED', priority: 'LOW', assigneeId: u.member5, clientId: c.c107, dueDate: null, blockedReason: null, creatorId: u.admin2, createdDaysAgo: 38, lastEventDaysAgo: 7, archivedById: u.admin2,
      changes: [statusChanged('IN_PROGRESS', 'COMPLETED'), priorityChanged('MEDIUM', 'LOW'), archivedEvent()],
    },
    {
      id: t.t235, title: 'Photoshoot: summer campaign', description: null, status: 'IN_PROGRESS', priority: 'LOW', assigneeId: u.member5, clientId: c.c108, dueDate: null, blockedReason: null, creatorId: u.admin1, createdDaysAgo: 35, lastEventDaysAgo: 6, archivedById: u.admin1,
      changes: [priorityChanged('MEDIUM', 'LOW'), archivedEvent()],
    },
    {
      id: t.t236, title: 'Influencer outreach list', description: null, status: 'PENDING', priority: 'LOW', assigneeId: u.member1, clientId: null, dueDate: null, blockedReason: null, creatorId: u.member2, createdDaysAgo: 25, lastEventDaysAgo: 6, archivedById: u.admin2,
      changes: [priorityChanged('MEDIUM', 'LOW'), archivedEvent()],
    },
  ]
}

// ---------------------------------------------------------------------------
// Row assembly
// ---------------------------------------------------------------------------

interface SeedStats {
  users: number
  clients: number
  contacts: number
  tasks: number
  changes: number
}

/**
 * Idempotent seed: delete rows by the fixed seed IDs, then createMany.
 * Safe to run repeatedly (PH-03 verification runs seed/reset three times).
 */
export async function runSeed(prisma: PrismaClient): Promise<SeedStats> {
  const users = buildUsers()
  const clients = buildClients()
  const contacts = buildContacts()
  const taskPlans = buildTaskPlans()

  const allTaskIds = taskPlans.map((p) => p.id)
  const allClientIds = clients.map((c) => c.id)
  const allUserIds = users.map((u) => u.id)
  const allContactIds = contacts.map((c) => c.id)
  const allChangeIds = Array.from(
    { length: taskPlans.reduce((sum, p) => sum + p.changes.length + 1, 0) },
    (_, i) => uuid(String(301 + i)),
  )

  // Assemble Task + TaskChange rows; change ids are assigned in fixed event
  // order per task (data-model §8.6), so the timeline is fully deterministic.
  const tasks: TaskSeed[] = []
  const changes: TaskChangeSeed[] = []
  let changeSeq = 0

  for (const plan of taskPlans) {
    const createdMs = Date.now() - plan.createdDaysAgo * DAY
    const lastMs = Date.now() - plan.lastEventDaysAgo * DAY
    const eventCount = plan.changes.length
    const stepMs = eventCount > 0 ? (lastMs - createdMs) / (eventCount + 1) : 0

    tasks.push({
      id: plan.id,
      title: plan.title,
      description: plan.description,
      status: plan.status,
      priority: plan.priority,
      assigneeId: plan.assigneeId,
      clientId: plan.clientId,
      // Prisma 7 client rejects date-only strings for DateTime fields; the
      // API DTO converts 'YYYY-MM-DD' -> Date the same way (ADR-003).
      dueDate: plan.dueDate ? new Date(`${plan.dueDate}T00:00:00.000Z`) : null,
      blockedReason: plan.blockedReason,
      creatorId: plan.creatorId,
      version: 1 + eventCount, // D-5 invariant: version == count(TaskChange)
      archivedAt: plan.archivedById ? new Date(lastMs) : null,
      archivedById: plan.archivedById,
      createdAt: new Date(createdMs),
      updatedAt: new Date(lastMs),
    })

    // CREATED event — recorded atomically with creation (BR-017/018), version 1.
    changes.push({
      id: allChangeIds[changeSeq++]!,
      taskId: plan.id,
      actorId: plan.creatorId,
      event: 'CREATED',
      field: null,
      oldValue: null,
      newValue: null,
      createdAt: new Date(createdMs),
    })

    for (let i = 0; i < eventCount; i++) {
      const ch = plan.changes[i]!
      const actorId = ch.event === 'ARCHIVED' ? (plan.archivedById ?? plan.creatorId) : (plan.assigneeId ?? plan.creatorId)
      changes.push({
        id: allChangeIds[changeSeq++]!,
        taskId: plan.id,
        actorId,
        event: ch.event,
        field: ch.field,
        oldValue: ch.oldValue,
        newValue: ch.newValue,
        createdAt: new Date(createdMs + (i + 1) * stepMs),
      })
    }
  }

  assertFixtureInvariants(taskPlans)

  await prisma.$transaction(async (tx) => {
    await tx.taskChange.deleteMany({ where: { id: { in: allChangeIds } } })
    await tx.task.deleteMany({ where: { id: { in: allTaskIds } } })
    await tx.contact.deleteMany({ where: { id: { in: allContactIds } } }) // children before parents
    await tx.client.deleteMany({ where: { id: { in: allClientIds } } })
    await tx.user.deleteMany({ where: { id: { in: allUserIds } } })

    await tx.user.createMany({ data: users })
    await tx.client.createMany({ data: clients })
    await tx.contact.createMany({ data: contacts })
    await tx.task.createMany({ data: tasks })
    await tx.taskChange.createMany({ data: changes })
  })

  return {
    users: users.length,
    clients: clients.length,
    contacts: contacts.length,
    tasks: tasks.length,
    changes: changes.length,
  }
}

// ---------------------------------------------------------------------------
// Fixture self-verification (data-model §8.5 dashboard fixtures) — fails the
// seed loudly if the demo data drifts from the contractual distribution.
// ---------------------------------------------------------------------------

function assertFixtureInvariants(plans: TaskPlan[]): void {
  const byStatus = new Map<TaskStatus, number>()
  const byPriority = new Map<TaskPriority, number>()
  const byEvent = new Map<TaskChangeEvent, number>()
  const assignees = new Map<string, number>()
  let unassigned = 0
  let clientNull = 0
  let overdue = 0
  let dueToday = 0
  let future = 0
  let recentlyCompleted = 0
  let archived = 0

  for (const p of plans) {
    // status KPI counts live tasks only (§8.5: archivedAt IS NULL); priority
    // covers all 36 (the §8.3 priority budget includes archived rows).
    if (p.archivedById === null) {
      byStatus.set(p.status, (byStatus.get(p.status) ?? 0) + 1)
    }
    byPriority.set(p.priority, (byPriority.get(p.priority) ?? 0) + 1)
    if (p.assigneeId === null) unassigned++
    else assignees.set(p.assigneeId, (assignees.get(p.assigneeId) ?? 0) + 1)
    if (p.clientId === null) clientNull++
    if (p.archivedById !== null) archived++
    if (p.archivedById === null && p.dueDate !== null) {
      if (p.dueDate < TODAY && p.status !== 'COMPLETED') overdue++
      if (p.dueDate === TODAY) dueToday++
      if (p.dueDate > TODAY) future++
    }
    if (p.status === 'COMPLETED' && p.archivedById === null && p.lastEventDaysAgo <= 7) {
      recentlyCompleted++
    }
    byEvent.set('CREATED', (byEvent.get('CREATED') ?? 0) + 1)
    for (const ch of p.changes) {
      byEvent.set(ch.event, (byEvent.get(ch.event) ?? 0) + 1)
    }
  }

  const expect = (actual: number, expected: number, label: string): void => {
    if (actual !== expected) {
      throw new Error(`Seed fixture invariant failed: ${label}: expected ${expected}, got ${actual}`)
    }
  }

  expect(plans.length, 36, 'total tasks')
  expect(byStatus.get('BACKLOG') ?? 0, 6, 'BACKLOG tasks')
  expect(byStatus.get('PENDING') ?? 0, 6, 'PENDING tasks (non-archived)')
  expect(byStatus.get('IN_PROGRESS') ?? 0, 7, 'IN_PROGRESS tasks (non-archived)')
  expect(byStatus.get('BLOCKED') ?? 0, 4, 'BLOCKED tasks (non-archived)')
  expect(byStatus.get('COMPLETED') ?? 0, 9, 'COMPLETED tasks (non-archived)')
  expect(archived, 4, 'ARCHIVED tasks')
  expect(unassigned, 2, 'unassigned tasks (BR-008 backlog)')
  expect(clientNull, 6, 'tasks without client')
  expect(overdue, 5, 'overdue tasks (Europe/Madrid, open states)')
  expect(dueToday, 2, 'tasks due today')
  expect(future, 8, 'tasks with future due date')
  expect(recentlyCompleted, 7, 'recently completed (updatedAt within 7 days)')

  expect(byPriority.get('URGENT') ?? 0, 5, 'URGENT tasks')
  expect(byPriority.get('HIGH') ?? 0, 10, 'HIGH tasks')
  expect(byPriority.get('MEDIUM') ?? 0, 14, 'MEDIUM tasks')
  expect(byPriority.get('LOW') ?? 0, 7, 'LOW tasks')

  // §8.3: 34 assigned / 2 unassigned. Distribution admin1 2, admin2 2,
  // member1-6 6/6/5/5/4/4 is internally inconsistent with BR-004 ("no inactive
  // assignee", and member6 is INACTIVE) — BR-004 wins: member6 keeps 0 tasks
  // and its 4 are redistributed (member1 7, member3/4 6, member5 5).
  const u = SEED_IDS.users
  const expectedAssignees: Array<[string, number]> = [
    [u.admin1, 2],
    [u.admin2, 2],
    [u.member1, 7],
    [u.member2, 6],
    [u.member3, 6],
    [u.member4, 6],
    [u.member5, 5],
    [u.member6, 0],
  ]
  for (const [id, n] of expectedAssignees) {
    expect(assignees.get(id) ?? 0, n, `tasks assigned to ${id}`)
  }
  // No task may be assigned to the INACTIVE member (BR-004)
  if ((assignees.get(u.member6) ?? 0) > 0) {
    throw new Error('Seed fixture invariant failed: member6 (INACTIVE) has assigned tasks (BR-004)')
  }

  // data-model §8.4: event budget — 124 total
  const totalEvents = [...byEvent.values()].reduce((a, b) => a + b, 0)
  expect(totalEvents, 124, 'total TaskChange events')
  expect(byEvent.get('CREATED') ?? 0, 36, 'CREATED events')
  expect(byEvent.get('TITLE_CHANGED') ?? 0, 20, 'TITLE_CHANGED events')
  expect(byEvent.get('STATUS_CHANGED') ?? 0, 24, 'STATUS_CHANGED events')
  expect(byEvent.get('PRIORITY_CHANGED') ?? 0, 18, 'PRIORITY_CHANGED events')
  expect(byEvent.get('ASSIGNEE_CHANGED') ?? 0, 12, 'ASSIGNEE_CHANGED events')
  expect(byEvent.get('DUE_DATE_CHANGED') ?? 0, 8, 'DUE_DATE_CHANGED events')
  expect(byEvent.get('ARCHIVED') ?? 0, 4, 'ARCHIVED events')
  expect(byEvent.get('REOPENED') ?? 0, 2, 'REOPENED events')

  // BLOCKED live tasks must carry a non-empty blockedReason (BR-010)
  for (const p of plans) {
    if (p.status === 'BLOCKED' && p.archivedById === null && (p.blockedReason ?? '').trim() === '') {
      throw new Error(`Seed fixture invariant failed: BLOCKED task ${p.id} has no blockedReason (BR-010)`)
    }
    if (p.status !== 'BLOCKED' && p.blockedReason !== null) {
      throw new Error(`Seed fixture invariant failed: non-BLOCKED task ${p.id} has a live blockedReason (BR-011)`)
    }
  }
  // BR-015: exactly one ARCHIVED event per archived task; never double-archived.
  // (Task.status has no 'ARCHIVED' value — archiving is the archivedAt flag.)
  for (const p of plans) {
    const archiveEvents = p.changes.filter((ch) => ch.event === 'ARCHIVED').length
    const expected = p.archivedById !== null ? 1 : 0
    if (archiveEvents !== expected) {
      throw new Error(
        `Seed fixture invariant failed: task ${p.id} has ${archiveEvents} ARCHIVED events (expected ${expected}) (BR-015)`,
      )
    }
  }
  // D-5 version invariant: version == 1 + events per task (enforced in runSeed
  // assembly: `version: 1 + eventCount`); the event-budget checks above pin the
  // per-type counts to data-model §8.4.
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    console.error('❌ Seed cannot run in production.')
    process.exit(1)
  }
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    console.error('prisma:seed requires DATABASE_URL (Neon pooled URL for runtime).')
    process.exitCode = 1
    return
  }
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  })
  try {
    await prisma.$connect()
    const stats = await runSeed(prisma)
    console.log(
      `Seed complete: ${stats.users} users, ${stats.clients} clients, ` +
        `${stats.contacts} contacts, ${stats.tasks} tasks, ${stats.changes} task changes.`,
    )
  } catch (err) {
    console.error('Seed failed:', err instanceof Error ? err.message : err)
    process.exitCode = 1
  } finally {
    await prisma.$disconnect()
  }
}

// Executed only when run directly (tsx prisma/seed.ts) — not when imported
// by reset.ts.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main()
}
