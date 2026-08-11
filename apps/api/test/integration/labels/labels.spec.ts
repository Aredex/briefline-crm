// LAB-001/002 integration (PC-04) — label catalogue + task assignment.
//
// The catalogue (/api/v1/labels) is team-wide readable, ADMIN-only for
// mutations (create/update/delete); the unique `name` index turns duplicates
// into 409 LABEL_NAME_EXISTS; colors are regex-validated #RRGGBB at the DTO.
// The task-scoped routes (/api/v1/tasks/:taskId/labels/:labelId) follow the
// TASK edit policy (canEditTask, LAB-002): archived tasks are 404 for members
// (identical to an unknown id, BOLA-safe) and 409 TASK_ARCHIVED for admins;
// unrelated members get 403. Assignment is an idempotent upsert; removal of an
// unassigned pair is a 200 no-op.
//
// Throttle budget: TWO logins in beforeAll (shared admin1 + member1 sessions —
// beforeEach only reseeds the DB, and the reseed recreates the same ids so the
// JWTs stay valid). The 5/min auth budget is never approached.
import type { INestApplication } from '@nestjs/common'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createTestApp } from '../helpers/test-app'
import { USERS, dockerAvailable, seedBaseUsers, startTestDb, truncateAll, type TestDb } from '../helpers/fixtures'
import { loginAs, newAgent, type AuthSession } from '../helpers/auth-flow'

const TASK_A_ID = 'cccccccc-cccc-4000-8000-000000000101' // ACTIVE, created by member1 (editable)
const TASK_B_ID = 'cccccccc-cccc-4000-8000-000000000102' // ACTIVE, created by admin1 (member-unrelated)
const TASK_ARCHIVED_ID = 'cccccccc-cccc-4000-8000-000000000103' // ARCHIVED (admin only)

const labelUuid = (n: number): string => `dddddddd-dddd-4000-8000-${String(n).padStart(12, '0')}`

describe.skipIf(!dockerAvailable())('labels (postgres:17-alpine)', () => {
  let db: TestDb
  let app: INestApplication
  let admin: AuthSession
  let member: AuthSession

  beforeAll(async () => {
    db = await startTestDb()
    app = await createTestApp(db.uri)
    // Seed BEFORE the logins: beforeAll runs against an empty DB and loginAs
    // validates credentials against real rows.
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

  // --- authentication gate (global JwtAuthGuard) ---

  it('requires authentication for the catalogue (401/CSRF)', async () => {
    const anonymous = newAgent(app.getHttpServer())
    await anonymous.get('/api/v1/labels').expect(401)
    // An anonymous unsafe request dies in the CSRF middleware (403 CSRF_INVALID)
    // BEFORE reaching the JWT guard — middleware runs ahead of guards.
    const post = await anonymous.post('/api/v1/labels').send({ name: 'x' }).expect(403)
    expect(post.body).toMatchObject({ code: 'CSRF_INVALID', status: 403 })
  })

  // --- LAB-001: catalogue reads ---

  it('lists the catalogue alphabetically for any authenticated user', async () => {
    await seedLabel(db, { id: labelUuid(2), name: 'design', color: '#8b5cf6' })
    await seedLabel(db, { id: labelUuid(1), name: 'bug', color: '#ef4444' })

    const res = await member.agent.get('/api/v1/labels').expect(200)
    expect(res.body.data).toHaveLength(2)
    expect(res.body.data.map((l: { name: string }) => l.name)).toEqual(['bug', 'design'])
    expect(res.body.data[0]).toEqual({
      id: labelUuid(1),
      name: 'bug',
      color: '#ef4444',
      createdAt: expect.any(String) as unknown as Date,
    })
    expect(res.body.data[0]).not.toHaveProperty('tasks') // no Prisma relation leaks
  })

  it('returns an empty catalogue when no labels exist', async () => {
    const res = await admin.agent.get('/api/v1/labels').expect(200)
    expect(res.body).toEqual({ data: [] })
  })

  // --- LAB-001: create (ADMIN) ---

  it('creates a label as an ADMIN (201 + Location, trimmed name, default color)', async () => {
    const res = await admin.agent
      .post('/api/v1/labels')
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ name: '  urgent-review  ' })
      .expect(201)

    expect(res.headers.location).toBe(`/api/v1/labels/${res.body.data.id}`)
    expect(res.body.data).toMatchObject({ name: 'urgent-review', color: '#6b7280' }) // trimmed + schema default
    const stored = await db.prisma.label.findUnique({ where: { id: res.body.data.id } })
    expect(stored).toMatchObject({ name: 'urgent-review', color: '#6b7280' })
  })

  it('accepts an explicit valid color and stores it verbatim', async () => {
    const res = await admin.agent
      .post('/api/v1/labels')
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ name: 'frontend', color: '#10B981' }) // uppercase hex is legal (regex)
      .expect(201)
    expect(res.body.data.color).toBe('#10B981')
  })

  it('rejects create by a MEMBER -> 403 FORBIDDEN', async () => {
    const res = await member.agent
      .post('/api/v1/labels')
      .set('X-CSRF-Token', member.csrfToken)
      .send({ name: 'sneaky' })
      .expect(403)
    expect(res.body).toMatchObject({ code: 'FORBIDDEN', status: 403 })
    expect(await db.prisma.label.count()).toBe(0)
  })

  it('rejects a duplicate name -> 409 LABEL_NAME_EXISTS', async () => {
    await seedLabel(db, { id: labelUuid(1), name: 'bug', color: '#ef4444' })

    const res = await admin.agent
      .post('/api/v1/labels')
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ name: 'bug' })
      .expect(409)
    expect(res.body).toMatchObject({ code: 'LABEL_NAME_EXISTS', status: 409 })
    expect(res.body.errors?.[0]).toMatchObject({ field: 'name', code: 'LABEL_NAME_EXISTS' })
    expect(await db.prisma.label.count()).toBe(1) // nothing extra written
  })

  it('rejects an invalid color -> 400 (and name violations -> 400)', async () => {
    const badColor = await admin.agent
      .post('/api/v1/labels')
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ name: 'x', color: 'red' })
      .expect(400)
    expect(badColor.body).toMatchObject({ code: 'VALIDATION_ERROR', status: 400 })

    const shortHex = await admin.agent
      .post('/api/v1/labels')
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ name: 'x', color: '#fff' })
      .expect(400)
    expect(shortHex.body).toMatchObject({ code: 'VALIDATION_ERROR', status: 400 })

    const blankName = await admin.agent
      .post('/api/v1/labels')
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ name: '   ' })
      .expect(400)
    expect(blankName.body).toMatchObject({ code: 'VALIDATION_ERROR', status: 400 })

    const tooLong = await admin.agent
      .post('/api/v1/labels')
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ name: 'x'.repeat(51) })
      .expect(400)
    expect(tooLong.body).toMatchObject({ code: 'VALIDATION_ERROR', status: 400 })
    expect(await db.prisma.label.count()).toBe(0)
  })

  // --- LAB-001: update (ADMIN) ---

  it('updates name and color as an ADMIN; a MEMBER gets 403', async () => {
    await seedLabel(db, { id: labelUuid(1), name: 'bug', color: '#ef4444' })

    const res = await admin.agent
      .patch(`/api/v1/labels/${labelUuid(1)}`)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ name: 'bug-fix', color: '#dc2626' })
      .expect(200)
    expect(res.body.data).toMatchObject({ id: labelUuid(1), name: 'bug-fix', color: '#dc2626' })

    const denied = await member.agent
      .patch(`/api/v1/labels/${labelUuid(1)}`)
      .set('X-CSRF-Token', member.csrfToken)
      .send({ name: 'hacked' })
      .expect(403)
    expect(denied.body).toMatchObject({ code: 'FORBIDDEN', status: 403 })
    const stored = await db.prisma.label.findUnique({ where: { id: labelUuid(1) } })
    expect(stored).toMatchObject({ name: 'bug-fix' }) // unchanged by the member attempt
  })

  it('rejects an empty update body -> 400 VALIDATION_ERROR', async () => {
    await seedLabel(db, { id: labelUuid(1), name: 'bug', color: '#ef4444' })

    const res = await admin.agent
      .patch(`/api/v1/labels/${labelUuid(1)}`)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({})
      .expect(400)
    expect(res.body).toMatchObject({ code: 'VALIDATION_ERROR', status: 400 })
  })

  it('404s on update/delete of an unknown label (LABEL_NOT_FOUND)', async () => {
    const unknown = labelUuid(99)
    const patch = await admin.agent
      .patch(`/api/v1/labels/${unknown}`)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ name: 'ghost' })
      .expect(404)
    expect(patch.body).toMatchObject({ code: 'LABEL_NOT_FOUND', status: 404 })

    const del = await admin.agent.delete(`/api/v1/labels/${unknown}`).set('X-CSRF-Token', admin.csrfToken).expect(404)
    expect(del.body).toMatchObject({ code: 'LABEL_NOT_FOUND', status: 404 })
  })

  // --- LAB-001: delete (ADMIN) + cascade ---

  it('deletes a label as an ADMIN and cascades its task assignments', async () => {
    await seedTask(db, { id: TASK_A_ID, title: 'Visible task', creatorId: USERS.member1.id })
    await seedLabel(db, { id: labelUuid(1), name: 'bug', color: '#ef4444' })
    await db.prisma.taskLabel.create({ data: { taskId: TASK_A_ID, labelId: labelUuid(1) } })

    const res = await admin.agent
      .delete(`/api/v1/labels/${labelUuid(1)}`)
      .set('X-CSRF-Token', admin.csrfToken)
      .expect(200)
    expect(res.body.data).toMatchObject({ id: labelUuid(1), name: 'bug' }) // last-known state

    expect(await db.prisma.label.count()).toBe(0)
    expect(await db.prisma.taskLabel.count()).toBe(0) // FK cascade removed the link
    expect(await db.prisma.task.count()).toBe(1) // the task itself survives
  })

  // --- LAB-002: assign (task edit policy) ---

  it('assigns a label as the MEMBER who created the task (200 + row created)', async () => {
    await seedTask(db, { id: TASK_A_ID, title: 'Visible task', creatorId: USERS.member1.id })
    await seedLabel(db, { id: labelUuid(1), name: 'bug', color: '#ef4444' })

    const res = await member.agent
      .post(`/api/v1/tasks/${TASK_A_ID}/labels/${labelUuid(1)}`)
      .set('X-CSRF-Token', member.csrfToken)
      .expect(200)
    expect(res.body.data).toMatchObject({ id: labelUuid(1), name: 'bug', color: '#ef4444' })
    expect(await db.prisma.taskLabel.count()).toBe(1)
  })

  it('assigns as an ADMIN on a task created by someone else', async () => {
    await seedTask(db, { id: TASK_B_ID, title: 'Admin task', creatorId: USERS.member1.id })
    await seedLabel(db, { id: labelUuid(1), name: 'bug', color: '#ef4444' })

    const res = await admin.agent
      .post(`/api/v1/tasks/${TASK_B_ID}/labels/${labelUuid(1)}`)
      .set('X-CSRF-Token', admin.csrfToken)
      .expect(200)
    expect(res.body.data.id).toBe(labelUuid(1))
  })

  it('re-assigning the same label is an idempotent no-op (still one row)', async () => {
    await seedTask(db, { id: TASK_A_ID, title: 'Visible task', creatorId: USERS.member1.id })
    await seedLabel(db, { id: labelUuid(1), name: 'bug', color: '#ef4444' })

    await member.agent
      .post(`/api/v1/tasks/${TASK_A_ID}/labels/${labelUuid(1)}`)
      .set('X-CSRF-Token', member.csrfToken)
      .expect(200)
    await member.agent
      .post(`/api/v1/tasks/${TASK_A_ID}/labels/${labelUuid(1)}`)
      .set('X-CSRF-Token', member.csrfToken)
      .expect(200)
    expect(await db.prisma.taskLabel.count()).toBe(1)
  })

  it('rejects assignment by a MEMBER unrelated to the task -> 403 FORBIDDEN', async () => {
    await seedTask(db, { id: TASK_B_ID, title: 'Admin task', creatorId: USERS.admin1.id, assigneeId: USERS.admin1.id })
    await seedLabel(db, { id: labelUuid(1), name: 'bug', color: '#ef4444' })

    const res = await member.agent
      .post(`/api/v1/tasks/${TASK_B_ID}/labels/${labelUuid(1)}`)
      .set('X-CSRF-Token', member.csrfToken)
      .expect(403)
    expect(res.body).toMatchObject({ code: 'FORBIDDEN', status: 403 })
    expect(await db.prisma.taskLabel.count()).toBe(0)
  })

  it('gives a MEMBER 404 on an archived task and an ADMIN 409 TASK_ARCHIVED', async () => {
    await seedTask(db, { id: TASK_ARCHIVED_ID, title: 'Frozen', creatorId: USERS.admin1.id, archivedAt: new Date() })
    await seedLabel(db, { id: labelUuid(1), name: 'bug', color: '#ef4444' })

    const memberPost = await member.agent
      .post(`/api/v1/tasks/${TASK_ARCHIVED_ID}/labels/${labelUuid(1)}`)
      .set('X-CSRF-Token', member.csrfToken)
      .expect(404)
    expect(memberPost.body).toMatchObject({ code: 'TASK_NOT_FOUND', status: 404 }) // BOLA-safe: identical to unknown id

    const adminPost = await admin.agent
      .post(`/api/v1/tasks/${TASK_ARCHIVED_ID}/labels/${labelUuid(1)}`)
      .set('X-CSRF-Token', admin.csrfToken)
      .expect(409)
    expect(adminPost.body).toMatchObject({ code: 'TASK_ARCHIVED', status: 409 })
    expect(await db.prisma.taskLabel.count()).toBe(0) // nothing leaked or written
  })

  it('404s on an unknown task or unknown label (never a 500)', async () => {
    await seedLabel(db, { id: labelUuid(1), name: 'bug', color: '#ef4444' })
    const unknownTask = 'ffffffff-ffff-4000-8000-0000000000ff'

    const task404 = await admin.agent
      .post(`/api/v1/tasks/${unknownTask}/labels/${labelUuid(1)}`)
      .set('X-CSRF-Token', admin.csrfToken)
      .expect(404)
    expect(task404.body).toMatchObject({ code: 'TASK_NOT_FOUND', status: 404 })

    await seedTask(db, { id: TASK_A_ID, title: 'Visible task', creatorId: USERS.member1.id })
    const label404 = await member.agent
      .post(`/api/v1/tasks/${TASK_A_ID}/labels/${labelUuid(99)}`)
      .set('X-CSRF-Token', member.csrfToken)
      .expect(404)
    expect(label404.body).toMatchObject({ code: 'LABEL_NOT_FOUND', status: 404 })
  })

  it('400s a malformed task/label id (INVALID_FORMAT, never a 500)', async () => {
    const res = await member.agent.post('/api/v1/tasks/not-a-uuid/labels/not-a-uuid').set('X-CSRF-Token', member.csrfToken).expect(400)
    expect(res.body).toMatchObject({ code: 'INVALID_FORMAT', status: 400 })
  })

  // --- LAB-002: remove ---

  it('removes a label from a task as the MEMBER creator (200 + row gone)', async () => {
    await seedTask(db, { id: TASK_A_ID, title: 'Visible task', creatorId: USERS.member1.id })
    await seedLabel(db, { id: labelUuid(1), name: 'bug', color: '#ef4444' })
    await db.prisma.taskLabel.create({ data: { taskId: TASK_A_ID, labelId: labelUuid(1) } })

    const res = await member.agent
      .delete(`/api/v1/tasks/${TASK_A_ID}/labels/${labelUuid(1)}`)
      .set('X-CSRF-Token', member.csrfToken)
      .expect(200)
    expect(res.body.data).toMatchObject({ id: labelUuid(1), name: 'bug' }) // label survives in the catalogue
    expect(await db.prisma.taskLabel.count()).toBe(0)
    expect(await db.prisma.label.count()).toBe(1)
  })

  it('removing an unassigned pair is an idempotent 200 no-op', async () => {
    await seedTask(db, { id: TASK_A_ID, title: 'Visible task', creatorId: USERS.member1.id })
    await seedLabel(db, { id: labelUuid(1), name: 'bug', color: '#ef4444' })

    await member.agent
      .delete(`/api/v1/tasks/${TASK_A_ID}/labels/${labelUuid(1)}`)
      .set('X-CSRF-Token', member.csrfToken)
      .expect(200)
    expect(await db.prisma.taskLabel.count()).toBe(0)
  })

  // --- LAB-002: labels embedded in task payloads ---

  it('includes assigned labels in TaskSummary and the task detail', async () => {
    await seedTask(db, { id: TASK_A_ID, title: 'Visible task', creatorId: USERS.member1.id })
    await seedTask(db, { id: TASK_B_ID, title: 'Unlabeled task', creatorId: USERS.member1.id })
    await seedLabel(db, { id: labelUuid(1), name: 'bug', color: '#ef4444' })
    await db.prisma.taskLabel.create({ data: { taskId: TASK_A_ID, labelId: labelUuid(1) } })

    // List (TaskSummary shape)
    const list = await member.agent.get('/api/v1/tasks').expect(200)
    expect(list.body.data).toHaveLength(2)
    const labeled = list.body.data.find((t: { id: string }) => t.id === TASK_A_ID)
    expect(labeled.labels).toEqual([{ id: labelUuid(1), name: 'bug', color: '#ef4444' }])

    // Detail (TaskResponse shape)
    const detail = await member.agent.get(`/api/v1/tasks/${TASK_A_ID}`).expect(200)
    expect(detail.body.data.labels).toEqual([{ id: labelUuid(1), name: 'bug', color: '#ef4444' }])

    // Unlabeled tasks expose an empty array, not null
    const board = await member.agent.get('/api/v1/tasks/board').expect(200)
    const unlabeledCard = board.body.data.backlog.find((t: { id: string }) => t.id === TASK_B_ID)
    expect(unlabeledCard.labels).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

interface TaskSeedInput {
  id: string
  title: string
  creatorId: string
  assigneeId?: string | null
  archivedAt?: Date | null
}

async function seedTask(db: TestDb, input: TaskSeedInput): Promise<void> {
  await db.prisma.task.create({
    data: {
      id: input.id,
      title: input.title,
      description: null,
      status: 'BACKLOG',
      priority: 'MEDIUM',
      assigneeId: input.assigneeId ?? null,
      clientId: null,
      dueDate: null,
      blockedReason: null,
      creatorId: input.creatorId,
      version: 1,
      archivedAt: input.archivedAt ?? null,
      archivedById: input.archivedAt ? input.creatorId : null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  })
}

interface LabelSeedInput {
  id: string
  name: string
  color: string
}

async function seedLabel(db: TestDb, input: LabelSeedInput): Promise<void> {
  await db.prisma.label.create({ data: input })
}
