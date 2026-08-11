// COMM-001 integration (PC-03) — append-only task comments.
//
// The thread is task-scoped: POST/GET /api/v1/tasks/:taskId/comments.
// Authorization = task visibility (canViewTask): archived tasks are 404 for
// members, identical to an unknown id (BOLA-safe, BR-016). Append-only: no
// update/delete routes exist. The author is ALWAYS the JWT actor — the create
// DTO does not even accept authorId (global whitelist, NFR-SEC-005), so the
// body can never influence authorship.
//
// Throttle budget: TWO logins in beforeAll (shared admin1 + member1 sessions —
// beforeEach only reseeds the DB, and the reseed recreates the same ids so the
// JWTs stay valid). The 5/min auth budget is never approached.
import type { INestApplication } from '@nestjs/common'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createTestApp } from '../helpers/test-app'
import { USERS, dockerAvailable, seedBaseUsers, startTestDb, truncateAll, type TestDb } from '../helpers/fixtures'
import { loginAs, newAgent, type AuthSession } from '../helpers/auth-flow'

const TASK_A_ID = 'cccccccc-cccc-4000-8000-000000000101' // ACTIVE, team-wide visible
const TASK_B_ID = 'cccccccc-cccc-4000-8000-000000000102' // ACTIVE
const TASK_ARCHIVED_ID = 'cccccccc-cccc-4000-8000-000000000103' // ARCHIVED (admin only)

const commentUuid = (n: number): string => `eeeeeeee-eeee-4000-8000-${String(n).padStart(12, '0')}`

const HOUR = 3_600_000

describe.skipIf(!dockerAvailable())('comments (postgres:17-alpine)', () => {
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

  it('requires authentication for list and create (401/CSRF)', async () => {
    await seedTask(db, { id: TASK_A_ID, title: 'Visible task', creatorId: USERS.admin1.id })

    const anonymous = newAgent(app.getHttpServer())
    await anonymous.get(`/api/v1/tasks/${TASK_A_ID}/comments`).expect(401)
    // An anonymous unsafe request dies in the CSRF middleware (403 CSRF_INVALID)
    // BEFORE reaching the JWT guard — middleware runs ahead of guards.
    const post = await anonymous.post(`/api/v1/tasks/${TASK_A_ID}/comments`).send({ content: 'hi' }).expect(403)
    expect(post.body).toMatchObject({ code: 'CSRF_INVALID', status: 403 })
  })

  // --- COMM-001: create (any authenticated user on a visible task) ---

  it('creates a comment as a MEMBER (201 + Location, trimmed content, author = actor)', async () => {
    await seedTask(db, { id: TASK_A_ID, title: 'Visible task', creatorId: USERS.admin1.id })

    const res = await member.agent
      .post(`/api/v1/tasks/${TASK_A_ID}/comments`)
      .set('X-CSRF-Token', member.csrfToken)
      .send({ content: '  Looks good — shipping the first batch.  ' })
      .expect(201)

    expect(res.headers.location).toBe(`/api/v1/tasks/${TASK_A_ID}/comments/${res.body.data.id}`)
    expect(res.body.data).toMatchObject({
      taskId: TASK_A_ID,
      content: 'Looks good — shipping the first batch.', // trimmed
      author: { id: USERS.member1.id, name: 'Member One' },
    })
    expect(res.body.data).not.toHaveProperty('authorId') // resolved ref, never the raw FK

    const stored = await db.prisma.comment.findUnique({ where: { id: res.body.data.id } })
    expect(stored).toMatchObject({ taskId: TASK_A_ID, authorId: USERS.member1.id, content: 'Looks good — shipping the first batch.' })
  })

  it('lets an ADMIN comment on the same task', async () => {
    await seedTask(db, { id: TASK_A_ID, title: 'Visible task', creatorId: USERS.admin1.id })

    const res = await admin.agent
      .post(`/api/v1/tasks/${TASK_A_ID}/comments`)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ content: 'Approved by ops.' })
      .expect(201)
    expect(res.body.data.author).toEqual({ id: USERS.admin1.id, name: 'Admin One' })
  })

  it('never accepts authorId from the body (400 UNKNOWN_PROPERTY, NFR-SEC-005)', async () => {
    await seedTask(db, { id: TASK_A_ID, title: 'Visible task', creatorId: USERS.admin1.id })

    const res = await member.agent
      .post(`/api/v1/tasks/${TASK_A_ID}/comments`)
      .set('X-CSRF-Token', member.csrfToken)
      .send({ content: 'Who wrote this?', authorId: USERS.admin1.id })
      .expect(400)
    expect(res.body.errors?.map((e: { code: string }) => e.code)).toContain('UNKNOWN_PROPERTY')
    expect(await db.prisma.comment.count()).toBe(0)
  })

  it('rejects empty and whitespace-only content -> 400', async () => {
    await seedTask(db, { id: TASK_A_ID, title: 'Visible task', creatorId: USERS.admin1.id })

    const missing = await member.agent
      .post(`/api/v1/tasks/${TASK_A_ID}/comments`)
      .set('X-CSRF-Token', member.csrfToken)
      .send({})
      .expect(400)
    expect(missing.body).toMatchObject({ code: 'VALIDATION_ERROR', status: 400 })

    const blank = await member.agent
      .post(`/api/v1/tasks/${TASK_A_ID}/comments`)
      .set('X-CSRF-Token', member.csrfToken)
      .send({ content: '   ' })
      .expect(400)
    expect(blank.body).toMatchObject({ code: 'VALIDATION_ERROR', status: 400 })
    expect(await db.prisma.comment.count()).toBe(0)
  })

  it('rejects content longer than 2000 chars -> 400 (and accepts exactly 2000)', async () => {
    await seedTask(db, { id: TASK_A_ID, title: 'Visible task', creatorId: USERS.admin1.id })

    const tooLong = await member.agent
      .post(`/api/v1/tasks/${TASK_A_ID}/comments`)
      .set('X-CSRF-Token', member.csrfToken)
      .send({ content: 'x'.repeat(2001) })
      .expect(400)
    expect(tooLong.body).toMatchObject({ code: 'VALIDATION_ERROR', status: 400 })

    const max = await member.agent
      .post(`/api/v1/tasks/${TASK_A_ID}/comments`)
      .set('X-CSRF-Token', member.csrfToken)
      .send({ content: 'y'.repeat(2000) })
      .expect(201)
    expect(max.body.data.content).toHaveLength(2000)
  })

  it('404s on an unknown task id (TASK_NOT_FOUND, BOLA-safe)', async () => {
    const unknown = 'ffffffff-ffff-4000-8000-0000000000ff'
    const post = await member.agent
      .post(`/api/v1/tasks/${unknown}/comments`)
      .set('X-CSRF-Token', member.csrfToken)
      .send({ content: 'Ghost task' })
      .expect(404)
    expect(post.body).toMatchObject({ code: 'TASK_NOT_FOUND', status: 404 })

    const list = await member.agent.get(`/api/v1/tasks/${unknown}/comments`).expect(404)
    expect(list.body).toMatchObject({ code: 'TASK_NOT_FOUND', status: 404 })
  })

  it('gives a MEMBER 404 on an archived task, identical to an unknown id (BOLA-safe)', async () => {
    await seedTask(db, { id: TASK_ARCHIVED_ID, title: 'Frozen', creatorId: USERS.admin1.id, archivedAt: new Date() })

    const post = await member.agent
      .post(`/api/v1/tasks/${TASK_ARCHIVED_ID}/comments`)
      .set('X-CSRF-Token', member.csrfToken)
      .send({ content: 'Sneaky' })
      .expect(404)
    expect(post.body).toMatchObject({ code: 'TASK_NOT_FOUND', status: 404 })

    const list = await member.agent.get(`/api/v1/tasks/${TASK_ARCHIVED_ID}/comments`).expect(404)
    expect(list.body).toMatchObject({ code: 'TASK_NOT_FOUND', status: 404 })
    expect(await db.prisma.comment.count()).toBe(0) // nothing leaked or written

    // The archived task is visible to ADMINS (canViewTask), so they keep the thread.
    await seedComment(db, {
      id: commentUuid(101), taskId: TASK_ARCHIVED_ID, authorId: USERS.admin1.id,
      content: 'Pre-archive note', createdAt: new Date(Date.now() - 2 * HOUR),
    })
    const adminList = await admin.agent.get(`/api/v1/tasks/${TASK_ARCHIVED_ID}/comments`).expect(200)
    expect(adminList.body.meta.total).toBe(1)
  })

  it('400s a malformed task id (INVALID_FORMAT, never a 500)', async () => {
    const res = await member.agent.get('/api/v1/tasks/not-a-uuid/comments').expect(400)
    expect(res.body).toMatchObject({ code: 'INVALID_FORMAT', status: 400 })
  })

  // --- COMM-001: paginated thread, newest first ---

  it('lists comments paginated with meta, newest first', async () => {
    await seedTask(db, { id: TASK_A_ID, title: 'Visible task', creatorId: USERS.admin1.id })
    for (let i = 1; i <= 3; i++) {
      await seedComment(db, {
        id: commentUuid(i), taskId: TASK_A_ID, authorId: USERS.member1.id,
        content: `Comment ${i}`, createdAt: new Date(Date.now() - (3 - i) * HOUR),
      })
    }

    const page1 = await member.agent.get(`/api/v1/tasks/${TASK_A_ID}/comments`).query({ page: 1, limit: 2 }).expect(200)
    expect(page1.body.meta).toEqual({ page: 1, limit: 2, total: 3 })
    expect(page1.body.data).toHaveLength(2)
    // Newest first: comment 3 (most recent), then comment 2.
    expect(page1.body.data.map((c: { id: string }) => c.id)).toEqual([commentUuid(3), commentUuid(2)])
    expect(page1.body.data[0]).toMatchObject({
      taskId: TASK_A_ID,
      content: 'Comment 3',
      author: { id: USERS.member1.id, name: 'Member One' },
    })

    const page2 = await member.agent.get(`/api/v1/tasks/${TASK_A_ID}/comments`).query({ page: 2, limit: 2 }).expect(200)
    expect(page2.body.meta).toEqual({ page: 2, limit: 2, total: 3 })
    expect(page2.body.data).toHaveLength(1)
    expect(page2.body.data[0].id).toBe(commentUuid(1)) // no overlap with page 1

    const tooBig = await member.agent.get(`/api/v1/tasks/${TASK_A_ID}/comments`).query({ limit: 101 }).expect(400)
    expect(tooBig.body).toMatchObject({ code: 'VALIDATION_ERROR', status: 400 })
  })

  it('returns an empty thread with meta when no comments exist', async () => {
    await seedTask(db, { id: TASK_A_ID, title: 'Visible task', creatorId: USERS.admin1.id })

    const res = await member.agent.get(`/api/v1/tasks/${TASK_A_ID}/comments`).expect(200)
    expect(res.body).toEqual({ data: [], meta: { page: 1, limit: 25, total: 0 } })
  })

  it('threads are task-scoped: a comment never leaks to another task', async () => {
    await seedTask(db, { id: TASK_A_ID, title: 'Task A', creatorId: USERS.admin1.id })
    await seedTask(db, { id: TASK_B_ID, title: 'Task B', creatorId: USERS.admin1.id })
    await seedComment(db, {
      id: commentUuid(1), taskId: TASK_A_ID, authorId: USERS.member1.id,
      content: 'Only for A', createdAt: new Date(),
    })

    const res = await member.agent.get(`/api/v1/tasks/${TASK_B_ID}/comments`).expect(200)
    expect(res.body.meta.total).toBe(0)
    expect(res.body.data).toEqual([])
  })

  // --- PC-03: task detail carries the last 5 comments ---

  it('includes the last 5 comments in the task detail, newest first', async () => {
    await seedTask(db, { id: TASK_A_ID, title: 'Visible task', creatorId: USERS.admin1.id })
    for (let i = 1; i <= 7; i++) {
      await seedComment(db, {
        id: commentUuid(i), taskId: TASK_A_ID, authorId: i % 2 === 0 ? USERS.admin1.id : USERS.member1.id,
        content: `Comment ${i}`, createdAt: new Date(Date.now() - (7 - i) * HOUR),
      })
    }

    const res = await member.agent.get(`/api/v1/tasks/${TASK_A_ID}`).expect(200)
    expect(res.body.data.comments).toHaveLength(5) // cap, not the raw 7
    expect(res.body.data.comments.map((c: { id: string }) => c.id)).toEqual([
      commentUuid(7), commentUuid(6), commentUuid(5), commentUuid(4), commentUuid(3),
    ])
    expect(res.body.data.comments[0]).toMatchObject({
      id: commentUuid(7),
      content: 'Comment 7',
      author: { id: USERS.member1.id, name: 'Member One' },
    })
    expect(res.body.data.comments[0]).not.toHaveProperty('taskId') // compact detail shape
  })

  it('returns an empty comments array for a task without comments', async () => {
    await seedTask(db, { id: TASK_A_ID, title: 'Visible task', creatorId: USERS.admin1.id })

    const res = await member.agent.get(`/api/v1/tasks/${TASK_A_ID}`).expect(200)
    expect(res.body.data.comments).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

interface TaskSeedInput {
  id: string
  title: string
  creatorId: string
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
      assigneeId: null,
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

interface CommentSeedInput {
  id: string
  taskId: string
  authorId: string
  content: string
  createdAt: Date
}

async function seedComment(db: TestDb, input: CommentSeedInput): Promise<void> {
  await db.prisma.comment.create({ data: input })
}
