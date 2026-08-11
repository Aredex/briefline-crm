// TASK-API-001..014 + FR-DASH-001..003 integration (PH-06) — tasks, board,
// history, archive, dashboard.
//
// Throttle budget: TWO logins in beforeAll (shared admin1 + member1 sessions —
// beforeEach only reseeds the DB, and the reseed recreates the same ids so the
// JWTs stay valid). The 5/min auth budget is never approached and the ~70
// requests of the whole file stay under the 100/min global tier.
//
// The 36-task fixture (seedTaskFixtures) mirrors prisma/seed.ts §8.3/§8.5 so
// the dashboard KPI assertions match the contractual demo numbers: open 17,
// blocked 4, overdue 5, completedLast7Days 7.
//
// The LAST test drops the TaskChange table mid-test to prove the atomicity
// guarantee of TASK-API-008: a forced history-write failure must roll back the
// mutation — the task row is untouched and no partial write survives.
import type { INestApplication } from '@nestjs/common'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createTestApp } from '../helpers/test-app'
import { USERS, dockerAvailable, seedBaseUsers, startTestDb, truncateAll, type TestDb } from '../helpers/fixtures'
import { loginAs, newAgent, type AuthSession } from '../helpers/auth-flow'
import { Prisma, type TaskPriority, type TaskStatus } from '../../../../../packages/api-contract/src/generated/prisma/client'

const DAY = 24 * 3_600_000

const CLIENT_A_ID = 'bbbbbbbb-bbbb-4000-8000-000000000101' // ACTIVE
const CLIENT_B_ID = 'bbbbbbbb-bbbb-4000-8000-000000000102' // ACTIVE
const CLIENT_C_ID = 'bbbbbbbb-bbbb-4000-8000-000000000103' // ARCHIVED

const taskUuid = (n: number): string => `cccccccc-cccc-4000-8000-${String(n).padStart(12, '0')}`
const changeUuid = (n: number): string => `dddddddd-dddd-4000-8000-${String(n).padStart(12, '0')}`

describe.skipIf(!dockerAvailable())('tasks + dashboard (postgres:17-alpine)', () => {
  let db: TestDb
  let app: INestApplication
  let admin: AuthSession
  let member: AuthSession

  beforeAll(async () => {
    db = await startTestDb()
    app = await createTestApp(db.uri)
    await seedBaseUsers(db.prisma)
    admin = await loginAs(newAgent(app.getHttpServer()), USERS.admin1.email)
    member = await loginAs(newAgent(app.getHttpServer()), USERS.member1.email)
  }, 180_000)

  afterAll(async () => {
    await app?.close()
    await db?.stop()
  })

  beforeEach(async () => {
    await truncateAll(db.prisma)
    await seedBaseUsers(db.prisma)
  })

  // ---------------------------------------------------------------------------
  // TASK-API-002: create
  // ---------------------------------------------------------------------------

  it('creates a backlog task unassigned (201 + Location, version 1, CREATED event)', async () => {
    const res = await admin.agent
      .post('/api/v1/tasks')
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ title: 'Set up analytics dashboards', description: 'GA4 + Looker Studio.', status: 'BACKLOG' })
      .expect(201)

    expect(res.headers.location).toBe(`/api/v1/tasks/${res.body.data.id}`)
    expect(res.body.data).toMatchObject({
      title: 'Set up analytics dashboards',
      status: 'BACKLOG',
      priority: 'MEDIUM', // default
      assignee: null,
      creator: { id: USERS.admin1.id, name: 'Admin One' },
      version: 1,
      archivedAt: null,
      archivedBy: null,
    })
    expect(res.body.data).not.toHaveProperty('creatorId') // never raw Prisma shape

    const stored = await db.prisma.task.findUnique({ where: { id: res.body.data.id } })
    expect(stored?.version).toBe(1)
    expect(await db.prisma.taskChange.count({ where: { taskId: res.body.data.id } })).toBe(1)

    const history = await admin.agent.get(`/api/v1/tasks/${res.body.data.id}/history`).expect(200)
    expect(history.body.data).toHaveLength(1)
    expect(history.body.data[0]).toMatchObject({ event: 'CREATED', version: 1, field: null, oldValue: null, newValue: null })
  })

  it('creates an active task with an assignee', async () => {
    const res = await admin.agent
      .post('/api/v1/tasks')
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ title: 'Implement contact form', status: 'IN_PROGRESS', priority: 'HIGH', assigneeId: USERS.member1.id })
      .expect(201)
    expect(res.body.data.status).toBe('IN_PROGRESS')
    expect(res.body.data.assignee).toEqual({ id: USERS.member1.id, name: 'Member One' })
  })

  it('rejects an active task without assignee -> 422 ASSIGNEE_REQUIRED (BR-009)', async () => {
    const res = await admin.agent
      .post('/api/v1/tasks')
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ title: 'No owner', status: 'PENDING' })
      .expect(422)
    expect(res.body).toMatchObject({ code: 'ASSIGNEE_REQUIRED', status: 422 })
    expect(res.body.errors?.[0]).toMatchObject({ field: 'assigneeId', code: 'ASSIGNEE_REQUIRED' })
    expect(await db.prisma.task.count()).toBe(0) // nothing persisted
  })

  it('rejects a BLOCKED task without reason -> 422 BLOCKED_REASON_REQUIRED (BR-010)', async () => {
    const res = await admin.agent
      .post('/api/v1/tasks')
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ title: 'Blocked no reason', status: 'BLOCKED', assigneeId: USERS.member1.id })
      .expect(422)
    expect(res.body).toMatchObject({ code: 'BLOCKED_REASON_REQUIRED', status: 422 })
    expect(res.body.errors?.[0]).toMatchObject({ field: 'blockedReason', code: 'BLOCKED_REASON_REQUIRED' })
  })

  it('rejects a blank blocked reason (whitespace-only)', async () => {
    const res = await admin.agent
      .post('/api/v1/tasks')
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ title: 'Blocked blank', status: 'BLOCKED', assigneeId: USERS.member1.id, blockedReason: '   ' })
      .expect(422)
    expect(res.body.code).toBe('BLOCKED_REASON_REQUIRED')
  })

  it('rejects a reason on a non-BLOCKED task -> 422 (BR-011 consistency)', async () => {
    const res = await admin.agent
      .post('/api/v1/tasks')
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ title: 'Reason where not allowed', status: 'PENDING', assigneeId: USERS.member1.id, blockedReason: 'Why?' })
      .expect(422)
    expect(res.body).toMatchObject({ code: 'BLOCKED_REASON_REQUIRED', status: 422 })
  })

  it('rejects an INACTIVE assignee -> 422 INACTIVE_ASSIGNEE (BR-004)', async () => {
    const res = await admin.agent
      .post('/api/v1/tasks')
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ title: 'Ghost assignee', status: 'PENDING', assigneeId: USERS.member6.id })
      .expect(422)
    expect(res.body).toMatchObject({ code: 'INACTIVE_ASSIGNEE', status: 422 })
    expect(res.body.errors?.[0]).toMatchObject({ field: 'assigneeId', code: 'INACTIVE_ASSIGNEE' })
  })

  it('rejects an unknown assignee -> 404 USER_NOT_FOUND', async () => {
    const res = await admin.agent
      .post('/api/v1/tasks')
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ title: 'Nobody home', status: 'PENDING', assigneeId: 'ffffffff-ffff-4000-8000-0000000000ff' })
      .expect(404)
    expect(res.body.code).toBe('USER_NOT_FOUND')
  })

  it('rejects an ARCHIVED client association -> 422 CANNOT_ASSIGN_ARCHIVED_CLIENT (CLI-API-006)', async () => {
    await seedDefaultClients(db)
    const res = await admin.agent
      .post('/api/v1/tasks')
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ title: 'Old client link', status: 'PENDING', assigneeId: USERS.member1.id, clientId: CLIENT_C_ID })
      .expect(422)
    expect(res.body).toMatchObject({ code: 'CANNOT_ASSIGN_ARCHIVED_CLIENT', status: 422 })
  })

  it('rejects an unknown client -> 404 CLIENT_NOT_FOUND', async () => {
    const res = await admin.agent
      .post('/api/v1/tasks')
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ title: 'Client ghost', status: 'PENDING', assigneeId: USERS.member1.id, clientId: 'ffffffff-ffff-4000-8000-0000000000ff' })
      .expect(404)
    expect(res.body.code).toBe('CLIENT_NOT_FOUND')
  })

  it('rejects expectedVersion > 0 on create -> 400 (const 0)', async () => {
    const res = await admin.agent
      .post('/api/v1/tasks')
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ title: 'Wrong version', expectedVersion: 1 })
      .expect(400)
    expect(res.body).toMatchObject({ code: 'VALIDATION_ERROR', status: 400 })
  })

  it('rejects unknown properties with 400 UNKNOWN_PROPERTY (NFR-SEC-005)', async () => {
    const res = await admin.agent
      .post('/api/v1/tasks')
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ title: 'Mass assignment', status: 'PENDING', creatorId: USERS.member1.id })
      .expect(400)
    expect(res.body.errors?.map((e: { code: string }) => e.code)).toContain('UNKNOWN_PROPERTY')
  })

  it('rejects an empty title -> 400', async () => {
    const res = await admin.agent.post('/api/v1/tasks').set('X-CSRF-Token', admin.csrfToken).send({ title: '   ' }).expect(400)
    expect(res.body).toMatchObject({ code: 'VALIDATION_ERROR', status: 400 })
  })

  // ---------------------------------------------------------------------------
  // TASK-API-003: update
  // ---------------------------------------------------------------------------

  it('lets a MEMBER edit a task they own and writes TITLE_CHANGED (only real changes)', async () => {
    const created = await member.agent
      .post('/api/v1/tasks')
      .set('X-CSRF-Token', member.csrfToken)
      .send({ title: 'Old title', status: 'PENDING', assigneeId: USERS.member1.id })
      .expect(201)

    const res = await member.agent
      .patch(`/api/v1/tasks/${created.body.data.id}`)
      .set('X-CSRF-Token', member.csrfToken)
      .send({ title: 'New title', expectedVersion: 1 })
      .expect(200)
    expect(res.body.data).toMatchObject({ title: 'New title', version: 2 })

    const history = await member.agent.get(`/api/v1/tasks/${created.body.data.id}/history`).expect(200)
    expect(history.body.data).toHaveLength(2)
    expect(history.body.data[1]).toMatchObject({
      event: 'TITLE_CHANGED',
      field: 'title',
      oldValue: '"Old title"',
      newValue: '"New title"',
      version: 2,
      actor: { id: USERS.member1.id, name: 'Member One' },
    })
  })

  it('forbids a MEMBER from editing an unrelated task -> 403 (BR-013)', async () => {
    await seedTask(db, { id: taskUuid(201), title: 'Not yours', status: 'PENDING', assigneeId: USERS.admin2.id, creatorId: USERS.admin1.id })
    const res = await member.agent
      .patch(`/api/v1/tasks/${taskUuid(201)}`)
      .set('X-CSRF-Token', member.csrfToken)
      .send({ title: 'sneaky', expectedVersion: 1 })
      .expect(403)
    expect(res.body).toMatchObject({ code: 'FORBIDDEN', status: 403 })
  })

  it('lets an ADMIN edit any task (BR-014)', async () => {
    await seedTask(db, { id: taskUuid(201), title: 'Admin owned', status: 'PENDING', assigneeId: USERS.member1.id, creatorId: USERS.member1.id })
    const res = await admin.agent
      .patch(`/api/v1/tasks/${taskUuid(201)}`)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ priority: 'URGENT', expectedVersion: 1 })
      .expect(200)
    expect(res.body.data).toMatchObject({ priority: 'URGENT', version: 2 })
  })

  it('returns 409 STALE_VERSION with currentVersion + currentState (ADR-004)', async () => {
    await seedTask(db, { id: taskUuid(201), title: 'Stale task', status: 'PENDING', assigneeId: USERS.member1.id, creatorId: USERS.admin1.id })

    const res = await admin.agent
      .patch(`/api/v1/tasks/${taskUuid(201)}`)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ title: 'Stale write', expectedVersion: 99 })
      .expect(409)
    expect(res.body).toMatchObject({ code: 'STALE_VERSION', status: 409 })
    expect(res.body.currentVersion).toBe(1)
    expect(res.body.currentState).toMatchObject({
      title: 'Stale task',
      status: 'PENDING',
      priority: 'MEDIUM',
      assigneeId: USERS.member1.id,
      clientId: null,
      dueDate: null,
      blockedReason: null,
      archivedAt: null,
    })
    // Nothing was written: version and title are unchanged.
    const stored = await db.prisma.task.findUnique({ where: { id: taskUuid(201) } })
    expect(stored?.version).toBe(1)
    expect(stored?.title).toBe('Stale task')
    expect(await db.prisma.taskChange.count({ where: { taskId: taskUuid(201) } })).toBe(1)
  })

  it('rejects an expectedVersion-only PATCH body -> 400 (nothing to update)', async () => {
    await seedTask(db, { id: taskUuid(201), title: 'No-op body', status: 'BACKLOG', creatorId: USERS.admin1.id })
    const res = await admin.agent
      .patch(`/api/v1/tasks/${taskUuid(201)}`)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ expectedVersion: 1 })
      .expect(400)
    expect(res.body).toMatchObject({ code: 'VALIDATION_ERROR', status: 400 })
  })

  it('rejects missing expectedVersion and unknown PATCH properties -> 400', async () => {
    await seedTask(db, { id: taskUuid(201), title: 'Version guard', status: 'BACKLOG', creatorId: USERS.admin1.id })

    const missing = await admin.agent
      .patch(`/api/v1/tasks/${taskUuid(201)}`)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ title: 'no version' })
      .expect(400)
    expect(missing.body).toMatchObject({ code: 'VALIDATION_ERROR', status: 400 })

    const statusHere = await admin.agent
      .patch(`/api/v1/tasks/${taskUuid(201)}`)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ status: 'PENDING', expectedVersion: 1 })
      .expect(400)
    expect(statusHere.body.errors?.map((e: { code: string }) => e.code)).toContain('UNKNOWN_PROPERTY')
  })

  it('rejects unassigning an active task -> 422 ASSIGNEE_REQUIRED (BR-009)', async () => {
    await seedTask(db, { id: taskUuid(201), title: 'Has owner', status: 'IN_PROGRESS', assigneeId: USERS.member1.id, creatorId: USERS.admin1.id })
    const res = await admin.agent
      .patch(`/api/v1/tasks/${taskUuid(201)}`)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ assigneeId: null, expectedVersion: 1 })
      .expect(422)
    expect(res.body).toMatchObject({ code: 'ASSIGNEE_REQUIRED', status: 422 })
  })

  it('allows unassigning a BACKLOG task and records ASSIGNEE_CHANGED', async () => {
    await seedTask(db, { id: taskUuid(201), title: 'Backlog owned', status: 'BACKLOG', assigneeId: USERS.member1.id, creatorId: USERS.admin1.id })
    const res = await admin.agent
      .patch(`/api/v1/tasks/${taskUuid(201)}`)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ assigneeId: null, expectedVersion: 1 })
      .expect(200)
    expect(res.body.data.assignee).toBeNull()
    expect(res.body.data.version).toBe(2)

    const history = await admin.agent.get(`/api/v1/tasks/${taskUuid(201)}/history`).expect(200)
    expect(history.body.data[1]).toMatchObject({
      event: 'ASSIGNEE_CHANGED',
      oldValue: `"${USERS.member1.id}"`,
      newValue: 'null',
    })
  })

  it('rejects assigning to an INACTIVE user on update -> 422 INACTIVE_ASSIGNEE', async () => {
    await seedTask(db, { id: taskUuid(201), title: 'Reassign', status: 'BACKLOG', creatorId: USERS.admin1.id })
    const res = await admin.agent
      .patch(`/api/v1/tasks/${taskUuid(201)}`)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ assigneeId: USERS.member6.id, expectedVersion: 1 })
      .expect(422)
    expect(res.body.code).toBe('INACTIVE_ASSIGNEE')
  })

  it('rejects a blockedReason on a non-BLOCKED task via PATCH -> 422', async () => {
    await seedTask(db, { id: taskUuid(201), title: 'Not blocked', status: 'PENDING', assigneeId: USERS.member1.id, creatorId: USERS.admin1.id })
    const res = await admin.agent
      .patch(`/api/v1/tasks/${taskUuid(201)}`)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ blockedReason: 'Not allowed here', expectedVersion: 1 })
      .expect(422)
    expect(res.body).toMatchObject({ code: 'BLOCKED_REASON_REQUIRED', status: 422 })
  })

  it('allows rewriting the reason of a BLOCKED task via PATCH', async () => {
    await seedTask(db, {
      id: taskUuid(201), title: 'Blocked task', status: 'BLOCKED', assigneeId: USERS.member1.id,
      creatorId: USERS.admin1.id, blockedReason: 'Old reason',
    })
    const res = await admin.agent
      .patch(`/api/v1/tasks/${taskUuid(201)}`)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ blockedReason: '  New reason  ', expectedVersion: 1 })
      .expect(200)
    expect(res.body.data.blockedReason).toBe('New reason') // trimmed
  })

  it('emits DUE_DATE_CHANGED with YYYY-MM-DD values and skips same-day no-ops', async () => {
    await seedTask(db, { id: taskUuid(201), title: 'Deadline', status: 'PENDING', assigneeId: USERS.member1.id, creatorId: USERS.admin1.id })

    await admin.agent
      .patch(`/api/v1/tasks/${taskUuid(201)}`)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ dueDate: '2026-09-15', expectedVersion: 1 })
      .expect(200)
    let history = await admin.agent.get(`/api/v1/tasks/${taskUuid(201)}/history`).expect(200)
    expect(history.body.data[1]).toMatchObject({ event: 'DUE_DATE_CHANGED', field: 'dueDate', oldValue: 'null', newValue: '"2026-09-15"' })

    // Same calendar day is not an auditable change.
    await admin.agent
      .patch(`/api/v1/tasks/${taskUuid(201)}`)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ dueDate: '2026-09-15', expectedVersion: 2 })
      .expect(200)
    history = await admin.agent.get(`/api/v1/tasks/${taskUuid(201)}/history`).expect(200)
    expect(history.body.data).toHaveLength(2)
  })

  it('writes no history event for description-only edits (no enum member)', async () => {
    await seedTask(db, { id: taskUuid(201), title: 'Desc edit', status: 'PENDING', assigneeId: USERS.member1.id, creatorId: USERS.admin1.id })
    const res = await admin.agent
      .patch(`/api/v1/tasks/${taskUuid(201)}`)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ description: 'New details', expectedVersion: 1 })
      .expect(200)
    expect(res.body.data.description).toBe('New details')
    expect(res.body.data.version).toBe(2) // version bumps regardless

    const history = await admin.agent.get(`/api/v1/tasks/${taskUuid(201)}/history`).expect(200)
    expect(history.body.data).toHaveLength(1) // only CREATED
  })

  it('rejects a task update to an ARCHIVED client -> 422 (FR-CLI-006)', async () => {
    await seedDefaultClients(db)
    await seedTask(db, { id: taskUuid(201), title: 'Reclient', status: 'PENDING', assigneeId: USERS.member1.id, creatorId: USERS.admin1.id })
    const res = await admin.agent
      .patch(`/api/v1/tasks/${taskUuid(201)}`)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ clientId: CLIENT_C_ID, expectedVersion: 1 })
      .expect(422)
    expect(res.body).toMatchObject({ code: 'CANNOT_ASSIGN_ARCHIVED_CLIENT', status: 422 })
  })

  // ---------------------------------------------------------------------------
  // TASK-API-004: status transitions
  // ---------------------------------------------------------------------------

  it('rejects BACKLOG -> PENDING without assignee -> 422 ASSIGNEE_REQUIRED (BR-009)', async () => {
    await seedTask(db, { id: taskUuid(201), title: 'Unassigned backlog', status: 'BACKLOG', creatorId: USERS.admin1.id })
    const res = await admin.agent
      .patch(`/api/v1/tasks/${taskUuid(201)}/status`)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ status: 'PENDING', expectedVersion: 1 })
      .expect(422)
    expect(res.body).toMatchObject({ code: 'ASSIGNEE_REQUIRED', status: 422 })
  })

  it('rejects -> BLOCKED without a reason -> 422 BLOCKED_REASON_REQUIRED (BR-010)', async () => {
    await seedTask(db, { id: taskUuid(201), title: 'To block', status: 'PENDING', assigneeId: USERS.member1.id, creatorId: USERS.admin1.id })
    const res = await admin.agent
      .patch(`/api/v1/tasks/${taskUuid(201)}/status`)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ status: 'BLOCKED', expectedVersion: 1 })
      .expect(422)
    expect(res.body).toMatchObject({ code: 'BLOCKED_REASON_REQUIRED', status: 422 })
  })

  it('BLOCKED -> PENDING clears the active reason while history keeps the transition (BR-011)', async () => {
    await seedTask(db, {
      id: taskUuid(201), title: 'Unblock me', status: 'BLOCKED', assigneeId: USERS.member1.id,
      creatorId: USERS.admin1.id, blockedReason: 'Waiting for assets',
    })
    const res = await admin.agent
      .patch(`/api/v1/tasks/${taskUuid(201)}/status`)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ status: 'PENDING', expectedVersion: 1 })
      .expect(200)
    expect(res.body.data).toMatchObject({ status: 'PENDING', blockedReason: null, version: 2 })

    const stored = await db.prisma.task.findUnique({ where: { id: taskUuid(201) } })
    expect(stored?.blockedReason).toBeNull()

    const history = await admin.agent.get(`/api/v1/tasks/${taskUuid(201)}/history`).expect(200)
    expect(history.body.data[1]).toMatchObject({ event: 'STATUS_CHANGED', oldValue: '"BLOCKED"', newValue: '"PENDING"' })
  })

  it('entering BLOCKED persists the trimmed reason', async () => {
    await seedTask(db, { id: taskUuid(201), title: 'Block me', status: 'IN_PROGRESS', assigneeId: USERS.member1.id, creatorId: USERS.admin1.id })
    const res = await admin.agent
      .patch(`/api/v1/tasks/${taskUuid(201)}/status`)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ status: 'BLOCKED', blockedReason: '  Legal review pending  ', expectedVersion: 1 })
      .expect(200)
    expect(res.body.data).toMatchObject({ status: 'BLOCKED', blockedReason: 'Legal review pending' })
  })

  it('reopens a COMPLETED task with a REOPENED event (BR-012)', async () => {
    await seedTask(db, { id: taskUuid(201), title: 'Done task', status: 'COMPLETED', assigneeId: USERS.member1.id, creatorId: USERS.admin1.id })
    const res = await admin.agent
      .patch(`/api/v1/tasks/${taskUuid(201)}/status`)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ status: 'IN_PROGRESS', expectedVersion: 1 })
      .expect(200)
    expect(res.body.data).toMatchObject({ status: 'IN_PROGRESS', version: 2 })

    const history = await admin.agent.get(`/api/v1/tasks/${taskUuid(201)}/history`).expect(200)
    expect(history.body.data[1]).toMatchObject({ event: 'REOPENED', field: 'status', oldValue: '"COMPLETED"', newValue: '"IN_PROGRESS"' })
  })

  it('a same-status PATCH is a no-op: no version bump, no event (DEC-035)', async () => {
    await seedTask(db, { id: taskUuid(201), title: 'Already pending', status: 'PENDING', assigneeId: USERS.member1.id, creatorId: USERS.admin1.id })
    const res = await admin.agent
      .patch(`/api/v1/tasks/${taskUuid(201)}/status`)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ status: 'PENDING', expectedVersion: 1 })
      .expect(200)
    expect(res.body.data.version).toBe(1)

    const stored = await db.prisma.task.findUnique({ where: { id: taskUuid(201) } })
    expect(stored?.version).toBe(1)
    expect(await db.prisma.taskChange.count({ where: { taskId: taskUuid(201) } })).toBe(1)
  })

  it('rejects a status change with a stale version -> 409 STALE_VERSION', async () => {
    await seedTask(db, { id: taskUuid(201), title: 'Move stale', status: 'PENDING', assigneeId: USERS.member1.id, creatorId: USERS.admin1.id })
    const res = await admin.agent
      .patch(`/api/v1/tasks/${taskUuid(201)}/status`)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ status: 'IN_PROGRESS', expectedVersion: 7 })
      .expect(409)
    expect(res.body).toMatchObject({ code: 'STALE_VERSION', status: 409, currentVersion: 1 })
  })

  // ---------------------------------------------------------------------------
  // TASK-API-006: archive + immutability
  // ---------------------------------------------------------------------------

  it('archives a task as ADMIN (200, ARCHIVED event, archiver recorded)', async () => {
    await seedTask(db, { id: taskUuid(201), title: 'Archive me', status: 'PENDING', assigneeId: USERS.member1.id, creatorId: USERS.admin1.id })
    const res = await admin.agent
      .post(`/api/v1/tasks/${taskUuid(201)}/archive`)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ expectedVersion: 1 })
      .expect(200)
    expect(res.body.data).toMatchObject({ version: 2, archivedBy: { id: USERS.admin1.id, name: 'Admin One' } })
    expect(res.body.data.archivedAt).not.toBeNull()

    const stored = await db.prisma.task.findUnique({ where: { id: taskUuid(201) } })
    expect(stored?.archivedById).toBe(USERS.admin1.id)

    const history = await admin.agent.get(`/api/v1/tasks/${taskUuid(201)}/history`).expect(200)
    expect(history.body.data[1]).toMatchObject({ event: 'ARCHIVED' })
    expect(history.body.data).toHaveLength(2) // no duplicate event possible
  })

  it('forbids a MEMBER from archiving -> 403 (BR-015)', async () => {
    await seedTask(db, { id: taskUuid(201), title: 'Member archive', status: 'BACKLOG', creatorId: USERS.member1.id })
    const res = await member.agent
      .post(`/api/v1/tasks/${taskUuid(201)}/archive`)
      .set('X-CSRF-Token', member.csrfToken)
      .send({ expectedVersion: 1 })
      .expect(403)
    expect(res.body).toMatchObject({ code: 'FORBIDDEN', status: 403 })
  })

  it('a double archive is a 409 TASK_ARCHIVED no-op (defined idempotency)', async () => {
    await seedTask(db, { id: taskUuid(201), title: 'Double archive', status: 'BACKLOG', creatorId: USERS.admin1.id })
    await admin.agent
      .post(`/api/v1/tasks/${taskUuid(201)}/archive`)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ expectedVersion: 1 })
      .expect(200)

    const res = await admin.agent
      .post(`/api/v1/tasks/${taskUuid(201)}/archive`)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ expectedVersion: 2 })
      .expect(409)
    expect(res.body).toMatchObject({ code: 'TASK_ARCHIVED', status: 409 })
    expect(await db.prisma.taskChange.count({ where: { taskId: taskUuid(201) } })).toBe(2) // CREATED + ARCHIVED only
  })

  it('an archived task is immutable: admin PATCH -> 409 TASK_ARCHIVED (BR-016)', async () => {
    await seedTask(db, { id: taskUuid(201), title: 'Frozen', status: 'PENDING', assigneeId: USERS.member1.id, creatorId: USERS.admin1.id, archivedAt: new Date(), archivedById: USERS.admin1.id, version: 2 })
    const res = await admin.agent
      .patch(`/api/v1/tasks/${taskUuid(201)}`)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ title: 'Too late', expectedVersion: 2 })
      .expect(409)
    expect(res.body).toMatchObject({ code: 'TASK_ARCHIVED', status: 409 })

    const status = await admin.agent
      .patch(`/api/v1/tasks/${taskUuid(201)}/status`)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ status: 'IN_PROGRESS', expectedVersion: 2 })
      .expect(409)
    expect(status.body.code).toBe('TASK_ARCHIVED')
  })

  // ---------------------------------------------------------------------------
  // TASK-API-010: reads — visibility (BOLA-safe) + list/archived
  // ---------------------------------------------------------------------------

  it('gives a MEMBER the active task detail but 404s an archived one (BOLA-safe)', async () => {
    await seedTask(db, { id: taskUuid(201), title: 'Visible', status: 'PENDING', assigneeId: USERS.admin2.id, creatorId: USERS.admin1.id })
    await seedTask(db, {
      id: taskUuid(202), title: 'Invisible', status: 'PENDING', assigneeId: USERS.member1.id,
      creatorId: USERS.admin1.id, archivedAt: new Date(), archivedById: USERS.admin1.id, version: 2,
    })

    const visible = await member.agent.get(`/api/v1/tasks/${taskUuid(201)}`).expect(200) // team-wide view
    expect(visible.body.data.title).toBe('Visible')

    const hidden = await member.agent.get(`/api/v1/tasks/${taskUuid(202)}`).expect(404)
    expect(hidden.body).toMatchObject({ code: 'TASK_NOT_FOUND', status: 404 })

    const adminSees = await admin.agent.get(`/api/v1/tasks/${taskUuid(202)}`).expect(200)
    expect(adminSees.body.data.archivedAt).not.toBeNull()
  })

  it('404s an unknown task id (TASK_NOT_FOUND)', async () => {
    const res = await admin.agent.get('/api/v1/tasks/ffffffff-ffff-4000-8000-0000000000ff').expect(404)
    expect(res.body).toMatchObject({ code: 'TASK_NOT_FOUND', status: 404 })
  })

  it('400s a malformed task id (INVALID_FORMAT, never a 500)', async () => {
    const res = await admin.agent.get('/api/v1/tasks/not-a-uuid').expect(400)
    expect(res.body).toMatchObject({ code: 'INVALID_FORMAT', status: 400 })
  })

  it('lists active tasks paginated with meta, excluding archived (BR-016)', async () => {
    await seedTaskFixtures(db)
    const page1 = await admin.agent.get('/api/v1/tasks').query({ page: 1, limit: 10 }).expect(200)
    expect(page1.body.meta).toEqual({ page: 1, limit: 10, total: 32 })
    expect(page1.body.data).toHaveLength(10)

    const page4 = await admin.agent.get('/api/v1/tasks').query({ page: 4, limit: 10 }).expect(200)
    expect(page4.body.data).toHaveLength(2)

    const tooBig = await admin.agent.get('/api/v1/tasks').query({ limit: 101 }).expect(400)
    expect(tooBig.body).toMatchObject({ code: 'VALIDATION_ERROR', status: 400 })
  })

  it('searches title+description with q, case-insensitive', async () => {
    await seedTaskFixtures(db)
    const byTitle = await admin.agent.get('/api/v1/tasks').query({ q: 'DESIGN SYSTEM' }).expect(200)
    expect(byTitle.body.meta.total).toBe(1)
    expect(byTitle.body.data[0].title).toBe('Task 217')
  })

  it('serves the archived list to admins only (member 403)', async () => {
    await seedTaskFixtures(db)
    const adminRes = await admin.agent.get('/api/v1/tasks/archived').expect(200)
    expect(adminRes.body.meta).toEqual({ page: 1, limit: 25, total: 4 })
    // DEC-035 sort: all four are LOW/null-due, so updatedAt desc decides the
    // order (t236 first) — assert the set, not a positional pick.
    const statuses = adminRes.body.data.map((t: { status: string }) => t.status).sort() as string[]
    expect(statuses).toEqual(['BLOCKED', 'COMPLETED', 'IN_PROGRESS', 'PENDING'])
    expect(adminRes.body.data.every((t: { archivedAt: string | null }) => t.archivedAt !== null)).toBe(true)

    const memberRes = await member.agent.get('/api/v1/tasks/archived').expect(403)
    expect(memberRes.body).toMatchObject({ code: 'FORBIDDEN', status: 403 })
  })

  // ---------------------------------------------------------------------------
  // TASK-API-009: board
  // ---------------------------------------------------------------------------

  it('returns backlog + the four active columns with the contractual sort (DEC-035)', async () => {
    await seedTaskFixtures(db)
    const res = await admin.agent.get('/api/v1/tasks/board').expect(200)

    expect(res.body.meta).toEqual({ total: 32 }) // archived excluded
    expect(res.body.data.backlog).toHaveLength(6)
    expect(res.body.data.columns.PENDING).toHaveLength(6)
    expect(res.body.data.columns.IN_PROGRESS).toHaveLength(7)
    expect(res.body.data.columns.BLOCKED).toHaveLength(4)
    expect(res.body.data.columns.COMPLETED).toHaveLength(9)

    // priority desc (URGENT > HIGH > MEDIUM), then dueDate asc nulls last, updatedAt desc.
    const inProgress = res.body.data.columns.IN_PROGRESS.map((t: { title: string }) => t.title) as string[]
    expect(inProgress).toEqual(['Task 213', 'Task 215', 'Task 214', 'Task 216', 'Task 217', 'Task 219', 'Task 218'])

    const blocked = res.body.data.columns.BLOCKED.map((t: { title: string }) => t.title) as string[]
    expect(blocked).toEqual(['Task 222', 'Task 221', 'Task 223', 'Task 220'])

    const backlog = res.body.data.backlog.map((t: { title: string }) => t.title) as string[]
    expect(backlog).toEqual(['Task 201', 'Task 203', 'Task 206', 'Task 205', 'Task 204', 'Task 202'])
  })

  it('board flat filters: status selects a single column; priority/q/assignee/due range combine', async () => {
    await seedTaskFixtures(db)

    const single = await admin.agent.get('/api/v1/tasks/board').query({ status: 'PENDING' }).expect(200)
    expect(single.body.meta.total).toBe(6)
    expect(single.body.data.backlog).toEqual([])
    expect(single.body.data.columns.PENDING).toHaveLength(6)
    expect(single.body.data.columns.IN_PROGRESS).toEqual([])
    expect(single.body.data.columns.BLOCKED).toEqual([])
    expect(single.body.data.columns.COMPLETED).toEqual([])

    const urgent = await admin.agent.get('/api/v1/tasks/board').query({ priority: 'URGENT' }).expect(200)
    expect(urgent.body.meta.total).toBe(5) // 1 IN_PROGRESS + 4 BLOCKED

    const assigned = await admin.agent.get('/api/v1/tasks/board').query({ assigneeId: USERS.member1.id }).expect(200)
    expect(assigned.body.meta.total).toBe(14)

    const byClient = await admin.agent.get('/api/v1/tasks/board').query({ clientId: CLIENT_A_ID }).expect(200)
    expect(byClient.body.meta.total).toBe(10)

    const dueBefore = await admin.agent.get('/api/v1/tasks/board').query({ dueBefore: madridDateOffset(0) }).expect(200)
    expect(dueBefore.body.meta.total).toBe(7)

    const dueAfter = await admin.agent.get('/api/v1/tasks/board').query({ dueAfter: madridDateOffset(7) }).expect(200)
    expect(dueAfter.body.meta.total).toBe(5)

    const q = await admin.agent.get('/api/v1/tasks/board').query({ q: 'photography' }).expect(200)
    expect(q.body.meta.total).toBe(1)
    expect(q.body.data.columns.IN_PROGRESS[0].title).toBe('Task 218')
  })

  it('caps the board at ~200 cards when the dataset overflows (TASK-API-009)', async () => {
    await seedTaskFixtures(db)
    const bulk: Prisma.TaskCreateManyInput[] = []
    for (let i = 1; i <= 200; i++) {
      bulk.push({
        id: taskUuid(300 + i), title: `Bulk ${i}`, description: null,
        status: 'BACKLOG', priority: 'MEDIUM', assigneeId: null, clientId: null,
        dueDate: null, blockedReason: null, creatorId: USERS.admin1.id,
        version: 1, archivedAt: null, archivedById: null, createdAt: new Date(), updatedAt: new Date(),
      })
    }
    await db.prisma.task.createMany({ data: bulk })

    const res = await admin.agent.get('/api/v1/tasks/board').query({ status: 'BACKLOG' }).expect(200)
    expect(res.body.meta.total).toBe(200) // server cap, not the raw 206 backlog rows
    expect(res.body.data.backlog).toHaveLength(200)
  })

  it('rejects malformed filter values with 400', async () => {
    await seedTaskFixtures(db)
    const badUuid = await admin.agent.get('/api/v1/tasks/board').query({ assigneeId: 'not-a-uuid' }).expect(400)
    expect(badUuid.body).toMatchObject({ code: 'VALIDATION_ERROR', status: 400 })

    const badDate = await admin.agent.get('/api/v1/tasks/board').query({ dueBefore: '2026-13-99' }).expect(400)
    expect(badDate.body).toMatchObject({ code: 'VALIDATION_ERROR', status: 400 })

    const badStatus = await admin.agent.get('/api/v1/tasks/board').query({ status: 'HOLD' }).expect(400)
    expect(badStatus.body).toMatchObject({ code: 'VALIDATION_ERROR', status: 400 })
  })

  // ---------------------------------------------------------------------------
  // TASK-API-007: history
  // ---------------------------------------------------------------------------

  it('history is append-only, ASC, with derived versions 1..N and no write routes', async () => {
    const created = await admin.agent
      .post('/api/v1/tasks')
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ title: 'Timeline', status: 'PENDING', assigneeId: USERS.member1.id })
      .expect(201)
    const id = created.body.data.id as string

    await admin.agent.patch(`/api/v1/tasks/${id}`).set('X-CSRF-Token', admin.csrfToken).send({ title: 'Timeline v2', expectedVersion: 1 }).expect(200)
    await admin.agent.patch(`/api/v1/tasks/${id}`).set('X-CSRF-Token', admin.csrfToken).send({ priority: 'URGENT', expectedVersion: 2 }).expect(200)

    const history = await admin.agent.get(`/api/v1/tasks/${id}/history`).expect(200)
    expect(history.body.meta.total).toBe(3)
    expect(history.body.data.map((c: { event: string }) => c.event)).toEqual(['CREATED', 'TITLE_CHANGED', 'PRIORITY_CHANGED'])
    expect(history.body.data.map((c: { version: number }) => c.version)).toEqual([1, 2, 3])
    expect(history.body.data.map((c: { field: string | null }) => c.field)).toEqual([null, 'title', 'priority'])
    expect(history.body.data.map((c: { createdAt: string }) => c.createdAt)).toEqual(
      [...history.body.data.map((c: { createdAt: string }) => c.createdAt)].sort(),
    )

    // No update/delete routes exist (TASK-API-007).
    const noPatch = await admin.agent.patch(`/api/v1/tasks/${id}/history`).set('X-CSRF-Token', admin.csrfToken).send({}).expect(404)
    expect(noPatch.body.code).toBe('NOT_FOUND')
  })

  // ---------------------------------------------------------------------------
  // TASK-API-011: dashboard
  // ---------------------------------------------------------------------------

  it('KPIs match the seed fixtures for both roles: open 17, blocked 4, overdue 5, completed 7', async () => {
    await seedTaskFixtures(db)

    const adminKpis = await admin.agent.get('/api/v1/dashboard/kpis').expect(200)
    expect(adminKpis.body.data).toEqual({ open: 17, overdue: 5, blocked: 4, completedLast7Days: 7 })

    const memberKpis = await member.agent.get('/api/v1/dashboard/kpis').expect(200) // same numbers (team-wide)
    expect(memberKpis.body.data).toEqual({ open: 17, overdue: 5, blocked: 4, completedLast7Days: 7 })
  })

  it('my-tasks returns only the caller assignments, prioritized (DASH-002)', async () => {
    await seedTaskFixtures(db)

    const res = await member.agent.get('/api/v1/dashboard/my-tasks').expect(200)
    expect(res.body.meta.total).toBe(14)
    expect(res.body.data.every((t: { assignee: { id: string } | null }) => t.assignee?.id === USERS.member1.id)).toBe(true)

    // priority desc, dueDate asc nulls last, updatedAt desc.
    const titles = res.body.data.map((t: { title: string }) => t.title) as string[]
    expect(titles.slice(0, 4)).toEqual(['Task 222', 'Task 223', 'Task 213', 'Task 215'])

    const page = await member.agent.get('/api/v1/dashboard/my-tasks').query({ page: 1, limit: 5 }).expect(200)
    expect(page.body.data).toHaveLength(5)
  })

  it('recent-activity never leaks archived-task events to members (DASH-003)', async () => {
    await seedTaskFixtures(db)

    // An event on an ACTIVE task (member1 is the assignee, so a member can edit it).
    await member.agent
      .patch(`/api/v1/tasks/${taskUuid(207)}/status`)
      .set('X-CSRF-Token', member.csrfToken)
      .send({ status: 'IN_PROGRESS', expectedVersion: 1 })
      .expect(200)
    // A fresh event on an ARCHIVED task (actor: admin1) — the leak probe.
    const leaked = changeUuid(401)
    await db.prisma.taskChange.create({
      data: {
        id: leaked, taskId: taskUuid(233), actorId: USERS.admin1.id, event: 'STATUS_CHANGED',
        field: 'status', oldValue: '"PENDING"', newValue: '"IN_PROGRESS"', createdAt: new Date(Date.now() + 1000),
      },
    })

    const memberFeed = await member.agent.get('/api/v1/dashboard/recent-activity').expect(200)
    expect(memberFeed.body.meta.total).toBe(33) // 32 active CREATED + the status change
    const memberIds = memberFeed.body.data.map((a: { id: string }) => a.id) as string[]
    expect(memberIds).not.toContain(leaked)
    expect(memberFeed.body.data[0]).toMatchObject({
      type: 'STATUS_CHANGED',
      taskId: taskUuid(207),
      taskTitle: 'Task 207',
      actorName: 'Member One',
    })

    const adminFeed = await admin.agent.get('/api/v1/dashboard/recent-activity').expect(200)
    expect(adminFeed.body.meta.total).toBe(38) // 36 CREATED + status change + leaked (archived visible to admin)
    expect(adminFeed.body.data[0]).toMatchObject({ id: leaked, taskId: taskUuid(233), actorName: 'Admin One' })
  })

  // ---------------------------------------------------------------------------
  // TASK-API-008/013: atomicity — forced history failure rolls back everything
  // ---------------------------------------------------------------------------
  // LAST: dropping the TaskChange table makes the in-transaction history write
  // fail; the mutation must roll back completely (no partial Task write).

  it('a forced history-write failure rolls back the mutation (atomic, BR-018)', async () => {
    const created = await admin.agent
      .post('/api/v1/tasks')
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ title: 'Atomic task', status: 'PENDING', assigneeId: USERS.member1.id })
      .expect(201)
    const id = created.body.data.id as string

    await db.prisma.$executeRawUnsafe('DROP TABLE "TaskChange" CASCADE')

    const res = await admin.agent
      .patch(`/api/v1/tasks/${id}/status`)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ status: 'IN_PROGRESS', expectedVersion: 1 })
      .expect(500)
    expect(res.body).toMatchObject({ code: 'INTERNAL_ERROR', status: 500 })
    expect(JSON.stringify(res.body)).not.toContain('stack')

    const stored = await db.prisma.task.findUnique({ where: { id } })
    expect(stored?.status).toBe('PENDING') // no partial write
    expect(stored?.version).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

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

async function seedDefaultClients(db: TestDb): Promise<void> {
  await db.prisma.client.createMany({
    data: [
      { id: CLIENT_A_ID, companyName: 'Bluebird Coffee Co.', industry: 'Retail', contactName: 'Sofia Lindqvist', contactEmail: 'sofia@bluebirdcoffee.example', phone: null, notes: null, status: 'ACTIVE', createdById: USERS.admin1.id },
      { id: CLIENT_B_ID, companyName: 'Vela Analytics', industry: 'SaaS', contactName: 'Daniel Okafor', contactEmail: 'daniel@vela.example', phone: null, notes: null, status: 'ACTIVE', createdById: USERS.member1.id },
      { id: CLIENT_C_ID, companyName: 'Old Archive Co.', industry: 'Media', contactName: 'Ghost Contact', contactEmail: 'ghost@oldarchive.example', phone: null, notes: null, status: 'ARCHIVED', createdById: USERS.admin1.id },
    ],
  })
}

interface TaskSeedInput {
  id: string
  title: string
  status: TaskStatus
  priority?: TaskPriority
  assigneeId?: string | null
  clientId?: string | null
  dueDate?: string | null
  blockedReason?: string | null
  creatorId: string
  version?: number
  archivedAt?: Date | null
  archivedById?: string | null
}

// Prisma 7 client validation rejects date-only strings ('YYYY-MM-DD') for
// DateTime fields — it requires a Date object (probed against 7.9.1). The API
// layer converts DTO strings to Date before writing; fixtures must do the same.
const toUtcDate = (dateOnly: string): Date => new Date(`${dateOnly}T00:00:00.000Z`)

/** One task + its CREATED history event (version invariant: 1 change = version 1). */
async function seedTask(db: TestDb, input: TaskSeedInput): Promise<void> {
  const now = new Date()
  await db.prisma.task.create({
    data: {
      id: input.id,
      title: input.title,
      description: null,
      status: input.status,
      priority: input.priority ?? 'MEDIUM',
      assigneeId: input.assigneeId ?? null,
      clientId: input.clientId ?? null,
      dueDate: input.dueDate ? toUtcDate(input.dueDate) : null,
      blockedReason: input.blockedReason ?? null,
      creatorId: input.creatorId,
      version: input.version ?? 1,
      archivedAt: input.archivedAt ?? null,
      archivedById: input.archivedById ?? null,
      createdAt: now,
      updatedAt: now,
    },
  })
  await db.prisma.taskChange.create({
    data: { taskId: input.id, actorId: input.creatorId, event: 'CREATED', field: null, oldValue: null, newValue: null, createdAt: now },
  })
}

/**
 * The 36-task demo fixture mirroring prisma/seed.ts §8.3/§8.5:
 * BACKLOG 6, PENDING 6, IN_PROGRESS 7, BLOCKED 4, COMPLETED 9 (7 recent),
 * ARCHIVED 4. Dashboard KPIs over it: open 17, blocked 4, overdue 5,
 * completedLast7Days 7. member1 has 14 assignments.
 */
async function seedTaskFixtures(db: TestDb): Promise<void> {
  await seedDefaultClients(db)
  const m1 = USERS.member1.id
  const a1 = USERS.admin1.id
  const a2 = USERS.admin2.id
  const today = madridDateOffset(0)
  const d = (offset: number): string => madridDateOffset(offset)
  const at = (daysAgo: number): Date => new Date(Date.now() - daysAgo * DAY)
  const mk = (
    n: number, status: TaskStatus, priority: TaskPriority, assigneeId: string | null, creatorId: string,
    dueDate: string | null, updatedAt: Date, clientId: string | null, blockedReason: string | null,
    archivedAt: Date | null = null, archivedById: string | null = null,
  ): { task: Prisma.TaskCreateManyInput; change: Prisma.TaskChangeCreateManyInput } => ({
    task: {
      id: taskUuid(n), title: `Task ${n}`,
      description: n === 217 ? 'Design system: buttons and forms milestone.' : n === 218 ? 'Photography editorial series.' : null,
      status, priority, assigneeId, clientId, dueDate: dueDate ? toUtcDate(dueDate) : null, blockedReason, creatorId,
      version: 1, archivedAt, archivedById, createdAt: at(30), updatedAt,
    },
    change: {
      id: changeUuid(n), taskId: taskUuid(n), actorId: creatorId, event: 'CREATED',
      field: null, oldValue: null, newValue: null, createdAt: at(30),
    },
  })

  const rows: Array<{ task: Prisma.TaskCreateManyInput; change: Prisma.TaskChangeCreateManyInput }> = [    // BACKLOG (201-206) — 2 unassigned (202, 205)
    mk(201, 'BACKLOG', 'MEDIUM', m1, a1, d(10), at(14), CLIENT_A_ID, null),
    mk(202, 'BACKLOG', 'MEDIUM', null, a1, null, at(16), null, null),
    mk(203, 'BACKLOG', 'MEDIUM', a2, a2, d(14), at(13), CLIENT_B_ID, null),
    mk(204, 'BACKLOG', 'MEDIUM', a2, a2, null, at(12), null, null),
    mk(205, 'BACKLOG', 'MEDIUM', null, a1, d(20), at(11), CLIENT_B_ID, null),
    mk(206, 'BACKLOG', 'MEDIUM', m1, m1, d(15), at(10), CLIENT_A_ID, null),
    // PENDING (207-212) — 1 overdue (210)
    mk(207, 'PENDING', 'HIGH', m1, a1, today, at(4), CLIENT_A_ID, null),
    mk(208, 'PENDING', 'HIGH', a2, a2, today, at(5), CLIENT_B_ID, null),
    mk(209, 'PENDING', 'HIGH', m1, a2, null, at(3), null, null),
    mk(210, 'PENDING', 'HIGH', a2, a1, d(-2), at(6), CLIENT_A_ID, null),
    mk(211, 'PENDING', 'HIGH', m1, m1, d(5), at(5), CLIENT_B_ID, null),
    mk(212, 'PENDING', 'HIGH', a2, a2, null, at(4), null, null),
    // IN_PROGRESS (213-219) — 2 overdue (214, 215)
    mk(213, 'IN_PROGRESS', 'URGENT', m1, a1, null, at(3), CLIENT_A_ID, null),
    mk(214, 'IN_PROGRESS', 'HIGH', a2, a2, d(-1), at(4), CLIENT_B_ID, null),
    mk(215, 'IN_PROGRESS', 'HIGH', m1, a1, d(-3), at(2), null, null),
    mk(216, 'IN_PROGRESS', 'HIGH', a2, a2, d(7), at(5), CLIENT_A_ID, null),
    mk(217, 'IN_PROGRESS', 'HIGH', m1, m1, null, at(2), CLIENT_B_ID, null),
    mk(218, 'IN_PROGRESS', 'MEDIUM', a2, a2, null, at(3), CLIENT_B_ID, null),
    mk(219, 'IN_PROGRESS', 'MEDIUM', m1, m1, d(3), at(6), null, null),
    // BLOCKED (220-223) — 2 overdue (221, 222), all with a reason (BR-010)
    mk(220, 'BLOCKED', 'URGENT', a2, a1, null, at(1), CLIENT_B_ID, 'Waiting for stakeholder approval'),
    mk(221, 'BLOCKED', 'URGENT', a2, a1, d(-1), at(1), CLIENT_A_ID, 'Client has not provided required assets'),
    mk(222, 'BLOCKED', 'URGENT', m1, a2, d(-4), at(2), null, 'Third-party API credentials not delivered'),
    mk(223, 'BLOCKED', 'URGENT', m1, a1, d(2), at(1), CLIENT_A_ID, 'Legal review pending on vendor contract'),
    // COMPLETED (224-232) — 7 recent (224-230), 2 older (231-232)
    mk(224, 'COMPLETED', 'LOW', a2, a2, null, at(2), CLIENT_B_ID, null),
    mk(225, 'COMPLETED', 'LOW', m1, a1, null, at(2), null, null),
    mk(226, 'COMPLETED', 'MEDIUM', a2, a1, null, at(3), CLIENT_A_ID, null),
    mk(227, 'COMPLETED', 'MEDIUM', m1, m1, null, at(3), null, null),
    mk(228, 'COMPLETED', 'MEDIUM', a2, a2, null, at(4), CLIENT_B_ID, null),
    mk(229, 'COMPLETED', 'MEDIUM', m1, a1, null, at(5), null, null),
    mk(230, 'COMPLETED', 'MEDIUM', a2, a2, null, at(5), CLIENT_A_ID, null),
    mk(231, 'COMPLETED', 'MEDIUM', a2, a1, null, at(10), CLIENT_B_ID, null),
    mk(232, 'COMPLETED', 'LOW', a2, a2, null, at(12), null, null),
    // ARCHIVED (233-236) — out of every active view (BR-016)
    mk(233, 'BLOCKED', 'LOW', m1, a1, null, at(8), CLIENT_A_ID, 'Client merged with another brand; scope frozen', at(8), a1),
    mk(234, 'COMPLETED', 'LOW', m1, a2, null, at(7), CLIENT_B_ID, null, at(7), a2),
    mk(235, 'IN_PROGRESS', 'LOW', m1, a1, null, at(6), CLIENT_B_ID, null, at(6), a1),
    mk(236, 'PENDING', 'LOW', m1, a2, null, at(6), null, null, at(6), a2),
  ]

  await db.prisma.task.createMany({ data: rows.map((r) => r.task) })
  await db.prisma.taskChange.createMany({ data: rows.map((r) => r.change) })
}
