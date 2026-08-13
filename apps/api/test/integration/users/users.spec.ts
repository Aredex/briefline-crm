// USR-001..005 integration (PH-04) — admin-only user management.
//
// Throttle budget: ONE login in beforeAll (shared session — beforeEach only
// reseeds the DB, and the reseed recreates the same ids so the JWT stays
// valid) + ONE login for the member-403 case. The 5/min auth budget is never
// approached. Order matters only for the LAST_ADMIN case (test 9 demotes
// admin2 first, so admin1 is the last active admin in test 10).
import type { INestApplication } from '@nestjs/common'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createTestApp } from '../helpers/test-app'
import { USERS, dockerAvailable, seedBaseUsers, startTestDb, truncateAll, type TestDb } from '../helpers/fixtures'
import { loginAs, newAgent, type AuthSession } from '../helpers/auth-flow'
import type { TaskPriority, TaskStatus } from '../../../src/generated/prisma/client'

const CLIENT_ID = 'aaaaaaaa-aaaa-4000-8000-000000000101'

describe.skipIf(!dockerAvailable())('users (postgres:17-alpine)', () => {
  let db: TestDb
  let app: INestApplication
  let admin: AuthSession // shared admin1 session (reseed keeps ids stable)

  beforeAll(async () => {
    db = await startTestDb()
    app = await createTestApp(db.uri)
    // Seed BEFORE the login: beforeAll runs against an empty DB, and loginAs
    // validates the credentials against real rows (the beforeEach reseed below
    // only happens per-test — too late for the beforeAll session).
    await seedBaseUsers(db.prisma)
    admin = await loginAs(newAgent(app.getHttpServer()), USERS.admin1.email)
  }, 180_000)

  afterAll(async () => {
    await app?.close()
    await db?.stop()
  })

  beforeEach(async () => {
    await truncateAll(db.prisma)
    await seedBaseUsers(db.prisma)
  })

  // --- USR-001: list + filters + pagination ---

  it('lists users with pagination meta and NO passwordHash', async () => {
    const res = await admin.agent.get('/api/v1/users').expect(200)
    expect(res.body.meta).toEqual({ page: 1, limit: 25, total: 4 })
    expect(res.body.data).toHaveLength(4)
    for (const user of res.body.data as Array<Record<string, unknown>>) {
      expect(user).not.toHaveProperty('passwordHash')
    }
    expect(JSON.stringify(res.body)).not.toContain('passwordHash')
  })

  it('searches by name/email with q (case-insensitive)', async () => {
    const res = await admin.agent.get('/api/v1/users').query({ q: 'admin' }).expect(200)
    expect(res.body.meta.total).toBe(2)
    expect(res.body.data.map((u: { email: string }) => u.email).sort()).toEqual([
      USERS.admin1.email,
      USERS.admin2.email,
    ])
  })

  it('filters by role', async () => {
    const res = await admin.agent.get('/api/v1/users').query({ role: 'ADMIN' }).expect(200)
    expect(res.body.meta.total).toBe(2)
    expect(res.body.data.every((u: { role: string }) => u.role === 'ADMIN')).toBe(true)
  })

  it('filters by status', async () => {
    const res = await admin.agent.get('/api/v1/users').query({ status: 'INACTIVE' }).expect(200)
    expect(res.body.meta.total).toBe(1)
    expect(res.body.data[0].email).toBe(USERS.member6.email)
  })

  it('paginates with page/limit', async () => {
    const res = await admin.agent.get('/api/v1/users').query({ page: 2, limit: 2 }).expect(200)
    expect(res.body.meta).toEqual({ page: 2, limit: 2, total: 4 })
    expect(res.body.data).toHaveLength(2)
  })

  // --- USR-002: create ---

  it('creates a user (201 + Location header, defaults MEMBER/ACTIVE)', async () => {
    const res = await admin.agent
      .post('/api/v1/users')
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ email: '  NEWUSER@BRIEFLINE.DEMO ', name: 'New User', password: 'briefline-new-2026' })
      .expect(201)

    expect(res.body.data.email).toBe('newuser@briefline.demo') // normalized (ADR-002)
    expect(res.body.data.role).toBe('MEMBER')
    expect(res.body.data.status).toBe('ACTIVE')
    expect(res.body.data).not.toHaveProperty('passwordHash')
    expect(res.headers.location).toBe(`/api/v1/users/${res.body.data.id}`)
  })

  it('rejects a duplicate email (case variant) with 409 EMAIL_ALREADY_EXISTS', async () => {
    const res = await admin.agent
      .post('/api/v1/users')
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ email: 'ADMIN1@BRIEFLINE.DEMO', name: 'Duplicate', password: 'briefline-new-2026' })
      .expect(409)
    expect(res.body).toMatchObject({ code: 'EMAIL_ALREADY_EXISTS', status: 409 })
    expect(res.body.errors?.[0]).toMatchObject({ field: 'email', code: 'EMAIL_ALREADY_EXISTS' })
  })

  // --- USR-003: update + USR-005: last-active-admin ---

  it('deactivates a member (status -> INACTIVE)', async () => {
    const res = await admin.agent
      .patch(`/api/v1/users/${USERS.member1.id}`)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ status: 'INACTIVE' })
      .expect(200)
    expect(res.body.data.status).toBe('INACTIVE')
  })

  it('demotes admin2 to MEMBER', async () => {
    const res = await admin.agent
      .patch(`/api/v1/users/${USERS.admin2.id}`)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ role: 'MEMBER' })
      .expect(200)
    expect(res.body.data.role).toBe('MEMBER')
  })

  it('refuses to demote the LAST active admin -> 409 LAST_ADMIN', async () => {
    // Self-contained: reseeds run before EVERY test, so first demote admin2
    // inside this test to make admin1 the last active admin.
    await admin.agent
      .patch(`/api/v1/users/${USERS.admin2.id}`)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ role: 'MEMBER' })
      .expect(200)

    const res = await admin.agent
      .patch(`/api/v1/users/${USERS.admin1.id}`)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ role: 'MEMBER' })
      .expect(409)
    expect(res.body).toMatchObject({ code: 'LAST_ADMIN', status: 409 })
    // admin1 is still ADMIN in the DB.
    const stored = await db.prisma.user.findUnique({ where: { id: USERS.admin1.id } })
    expect(stored?.role).toBe('ADMIN')
  })

  it('404s for an unknown user id', async () => {
    const res = await admin.agent
      .patch('/api/v1/users/ffffffff-ffff-4000-8000-0000000000ff')
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ role: 'MEMBER' })
      .expect(404)
    expect(res.body).toMatchObject({ code: 'USER_NOT_FOUND', status: 404 })
  })

  it('400s for an empty PATCH body (nothing to update)', async () => {
    const res = await admin.agent
      .patch(`/api/v1/users/${USERS.member1.id}`)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({})
      .expect(400)
    expect(res.body).toMatchObject({ code: 'VALIDATION_ERROR', status: 400 })
  })

  // --- USR-004: deactivation impact ---

  it('reports open assigned/created tasks for the deactivation impact', async () => {
    await db.prisma.client.create({
      data: {
        id: CLIENT_ID,
        companyName: 'Impact Client',
        contactName: 'Contact',
        contactEmail: 'contact@briefline.demo',
        createdById: USERS.admin1.id,
      },
    })
    await seedImpactTasks(db)

    const res = await admin.agent
      .get(`/api/v1/users/${USERS.member1.id}/deactivation-impact`)
      .expect(200)

    const assigned = res.body.data.assignedTasks
    const created = res.body.data.createdTasks
    expect(assigned.count).toBe(1)
    expect(assigned.tasks[0]).toMatchObject({
      title: 'Assigned open',
      status: 'IN_PROGRESS',
      assignee: { id: USERS.member1.id, name: 'Member One' },
    })
    expect(created.count).toBe(1)
    expect(created.tasks[0]).toMatchObject({
      title: 'Created open',
      status: 'PENDING',
      client: { id: CLIENT_ID, companyName: 'Impact Client' },
    })
  })

  it('404s the deactivation impact for an unknown user', async () => {
    const res = await admin.agent
      .get('/api/v1/users/ffffffff-ffff-4000-8000-0000000000ff/deactivation-impact')
      .expect(404)
    expect(res.body).toMatchObject({ code: 'USER_NOT_FOUND', status: 404 })
  })

  // --- RBAC: member role is forbidden ---

  it('forbids a MEMBER from listing/creating users -> 403 FORBIDDEN', async () => {
    // Self-contained: reseeds run before EVERY test, so demote admin2 here to
    // turn it into an ACTIVE MEMBER — it can log in, but the RolesGuard must
    // reject it on admin routes.
    await admin.agent
      .patch(`/api/v1/users/${USERS.admin2.id}`)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ role: 'MEMBER' })
      .expect(200)
    const member = await loginAs(newAgent(app.getHttpServer()), USERS.admin2.email)

    const list = await member.agent.get('/api/v1/users').expect(403)
    expect(list.body).toMatchObject({ code: 'FORBIDDEN', status: 403 })

    const create = await member.agent
      .post('/api/v1/users')
      .set('X-CSRF-Token', member.csrfToken)
      .send({ email: 'sneaky@briefline.demo', name: 'Sneaky', password: 'briefline-new-2026' })
      .expect(403)
    expect(create.body).toMatchObject({ code: 'FORBIDDEN', status: 403 })
  })
})

/** Task matrix for the deactivation-impact case (USR-004). */
async function seedImpactTasks(db: TestDb): Promise<void> {
  const open: TaskStatus = 'IN_PROGRESS'
  const tasks: Array<{
    title: string
    creatorId: string
    assigneeId?: string
    status: TaskStatus
    priority?: TaskPriority
    clientId?: string
    archivedAt?: Date | null
  }> = [
    // assigned + open -> counted
    { title: 'Assigned open', creatorId: USERS.admin1.id, assigneeId: USERS.member1.id, status: open },
    // assigned + COMPLETED -> excluded
    { title: 'Assigned completed', creatorId: USERS.admin1.id, assigneeId: USERS.member1.id, status: 'COMPLETED' },
    // assigned + archived -> excluded
    { title: 'Assigned archived', creatorId: USERS.admin1.id, assigneeId: USERS.member1.id, status: open, archivedAt: new Date() },
    // created + open -> counted
    { title: 'Created open', creatorId: USERS.member1.id, status: 'PENDING', clientId: CLIENT_ID },
    // created + COMPLETED -> excluded
    { title: 'Created completed', creatorId: USERS.member1.id, status: 'COMPLETED' },
  ]
  for (const task of tasks) {
    await db.prisma.task.create({ data: task })
  }
}
