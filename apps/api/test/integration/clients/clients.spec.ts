// CLI-API-001..007 integration (PH-05) — client catalogue.
//
// Throttle budget: TWO logins in beforeAll (shared admin1 + member1 sessions —
// beforeEach only reseeds the DB, and the reseed recreates the same ids so the
// JWTs stay valid). The 5/min auth budget is never approached.
//
// CLI-API-006 (archived client rejects NEW task associations) has no HTTP
// surface yet — the tasks module is PH-06 — so the invariant is exercised
// directly on the exported ClientsService.assertAssignable() (the exact method
// PH-06 task create/update will call).
import type { INestApplication } from '@nestjs/common'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createTestApp } from '../helpers/test-app'
import {
  USERS,
  dockerAvailable,
  seedBaseUsers,
  startTestDb,
  truncateAll,
  type TestDb,
} from '../helpers/fixtures'
import { loginAs, newAgent, type AuthSession } from '../helpers/auth-flow'
import { ClientsService } from '../../../src/modules/clients/clients.service'

const CLIENT_A_ID = 'bbbbbbbb-bbbb-4000-8000-000000000101' // Bluebird Coffee (ACTIVE)
const CLIENT_B_ID = 'bbbbbbbb-bbbb-4000-8000-000000000102' // Vela Analytics (ACTIVE)
const CLIENT_C_ID = 'bbbbbbbb-bbbb-4000-8000-000000000103' // Old Archive Co (ARCHIVED)
const CLIENT_INACTIVE_ID = 'bbbbbbbb-bbbb-4000-8000-000000000104'

describe.skipIf(!dockerAvailable())('clients (postgres:17-alpine)', () => {
  let db: TestDb
  let app: INestApplication
  let admin: AuthSession
  let member: AuthSession

  beforeAll(async () => {
    db = await startTestDb()
    app = await createTestApp(db.uri)
    // Seed BEFORE the logins: beforeAll runs against an empty DB and loginAs
    // validates credentials against real rows (the beforeEach reseed below only
    // happens per-test — too late for the beforeAll sessions).
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

  // --- CLI-API-001: paginated list, search, filters, archived exclusion ---

  it('returns an empty list with pagination meta when no clients exist', async () => {
    const res = await member.agent.get('/api/v1/clients').expect(200)
    expect(res.body).toEqual({ data: [], meta: { page: 1, limit: 25, total: 0 } })
  })

  it('lists clients for admins including archived ones', async () => {
    await seedDefaultClients(db)

    const res = await admin.agent.get('/api/v1/clients').expect(200)
    expect(res.body.meta).toEqual({ page: 1, limit: 25, total: 4 })
    expect(res.body.data).toHaveLength(4)
    // companyName ASC ordering.
    expect(res.body.data.map((c: { companyName: string }) => c.companyName)).toEqual([
      'Bluebird Coffee Co.',
      'Northwind Traders',
      'Old Archive Co.',
      'Vela Analytics',
    ])
  })

  it('excludes archived clients from a MEMBER list (BR-005)', async () => {
    await seedDefaultClients(db)

    const res = await member.agent.get('/api/v1/clients').expect(200)
    expect(res.body.meta.total).toBe(3)
    const names = res.body.data.map((c: { companyName: string }) => c.companyName) as string[]
    expect(names).not.toContain('Old Archive Co.')
  })

  it('lets admins filter by status=ARCHIVED but a member gets an empty page (no 403)', async () => {
    await seedDefaultClients(db)

    const adminRes = await admin.agent.get('/api/v1/clients').query({ status: 'ARCHIVED' }).expect(200)
    expect(adminRes.body.meta.total).toBe(1)
    expect(adminRes.body.data[0].companyName).toBe('Old Archive Co.')

    const memberRes = await member.agent.get('/api/v1/clients').query({ status: 'ARCHIVED' }).expect(200)
    expect(memberRes.body.meta.total).toBe(0)
    expect(memberRes.body.data).toEqual([])
  })

  it('filters by status=INACTIVE', async () => {
    await seedDefaultClients(db)

    const res = await admin.agent.get('/api/v1/clients').query({ status: 'INACTIVE' }).expect(200)
    expect(res.body.meta.total).toBe(1)
    expect(res.body.data[0].companyName).toBe('Northwind Traders')
  })

  it('searches by companyName and contactName, case-insensitive', async () => {
    await seedDefaultClients(db)

    const byCompany = await member.agent.get('/api/v1/clients').query({ q: 'bluebird' }).expect(200)
    expect(byCompany.body.meta.total).toBe(1)
    expect(byCompany.body.data[0].companyName).toBe('Bluebird Coffee Co.')

    const byContact = await member.agent.get('/api/v1/clients').query({ q: 'lindqvist' }).expect(200)
    expect(byContact.body.meta.total).toBe(1)
    expect(byContact.body.data[0].contactName).toBe('Sofia Lindqvist')

    const partial = await member.agent.get('/api/v1/clients').query({ q: 'COFFEE' }).expect(200)
    expect(partial.body.meta.total).toBe(1)
  })

  it('paginates with page/limit and rejects limit above 100 with 400', async () => {
    await seedDefaultClients(db)

    const page1 = await member.agent.get('/api/v1/clients').query({ page: 1, limit: 2 }).expect(200)
    expect(page1.body.meta).toEqual({ page: 1, limit: 2, total: 3 })
    expect(page1.body.data).toHaveLength(2)

    const page2 = await member.agent.get('/api/v1/clients').query({ page: 2, limit: 2 }).expect(200)
    expect(page2.body.meta).toEqual({ page: 2, limit: 2, total: 3 })
    expect(page2.body.data).toHaveLength(1)
    expect(page2.body.data[0].companyName).toBe('Vela Analytics') // no overlap with page 1

    const tooBig = await member.agent.get('/api/v1/clients').query({ limit: 101 }).expect(400)
    expect(tooBig.body).toMatchObject({ code: 'VALIDATION_ERROR', status: 400 })
  })

  // --- CLI-API-002: create ---

  it('creates a client as ADMIN (201 + Location, ACTIVE, creator recorded)', async () => {
    const res = await admin.agent
      .post('/api/v1/clients')
      .set('X-CSRF-Token', admin.csrfToken)
      .send({
        companyName: '  Casa Verde Bakery  ',
        industry: 'Food & Beverage',
        contactName: 'Lucia Fernandez',
        contactEmail: '  LUCIA@CASAVERDE.EXAMPLE ',
        phone: '+34 611 222 333',
        notes: 'New client from the July referral program.',
      })
      .expect(201)

    expect(res.body.data.companyName).toBe('Casa Verde Bakery') // trimmed
    expect(res.body.data.contactEmail).toBe('lucia@casaverde.example') // normalized (ADR-002)
    expect(res.body.data.status).toBe('ACTIVE')
    expect(res.body.data.createdBy).toEqual({ id: USERS.admin1.id, name: 'Admin One' })
    expect(res.body.data).not.toHaveProperty('createdById') // never raw Prisma shape
    expect(res.headers.location).toBe(`/api/v1/clients/${res.body.data.id}`)

    const stored = await db.prisma.client.findUnique({ where: { id: res.body.data.id } })
    expect(stored?.createdById).toBe(USERS.admin1.id)
  })

  it('lets a MEMBER create a client (BR-006: any active user)', async () => {
    const res = await member.agent
      .post('/api/v1/clients')
      .set('X-CSRF-Token', member.csrfToken)
      .send({ companyName: 'Member Created Ltd', contactName: 'Ana Torres', contactEmail: 'ana@member.example' })
      .expect(201)

    expect(res.body.data.status).toBe('ACTIVE')
    expect(res.body.data.createdBy).toEqual({ id: USERS.member1.id, name: 'Member One' })
  })

  it('validates lengths, email format and unknown properties with 400', async () => {
    const tooLongCompany = await admin.agent
      .post('/api/v1/clients')
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ companyName: 'X'.repeat(161), contactName: 'C', contactEmail: 'c@example.com' })
      .expect(400)
    expect(tooLongCompany.body).toMatchObject({ code: 'VALIDATION_ERROR', status: 400 })
    expect(tooLongCompany.body.errors?.[0]).toMatchObject({ field: 'companyName', code: 'INVALID_LENGTH' })

    const tooLongIndustry = await admin.agent
      .post('/api/v1/clients')
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ companyName: 'Ok Co', contactName: 'C', contactEmail: 'c@example.com', industry: 'Y'.repeat(81) })
      .expect(400)
    expect(tooLongIndustry.body.errors?.[0]).toMatchObject({ field: 'industry' })

    const badEmail = await admin.agent
      .post('/api/v1/clients')
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ companyName: 'Ok Co', contactName: 'C', contactEmail: 'not-an-email' })
      .expect(400)
    expect(badEmail.body.errors?.[0]).toMatchObject({ field: 'contactEmail' })

    // NFR-SEC-005 mass-assignment guard: unknown properties are rejected.
    const extraField = await admin.agent
      .post('/api/v1/clients')
      .set('X-CSRF-Token', admin.csrfToken)
      .send({
        companyName: 'Ok Co',
        contactName: 'C',
        contactEmail: 'c@example.com',
        status: 'ARCHIVED',
        createdById: USERS.member1.id,
      })
      .expect(400)
    expect(extraField.body.errors?.map((e: { code: string }) => e.code)).toContain('UNKNOWN_PROPERTY')

    // No client was persisted by any of the rejected requests.
    expect(await db.prisma.client.count()).toBe(0)
  })

  // --- CLI-API-003: detail with related tasks ---

  it('returns the client with a paginated related-task summary (contractual sort)', async () => {
    await seedDefaultClients(db)
    await seedRelatedTasks(db)

    const res = await member.agent.get(`/api/v1/clients/${CLIENT_A_ID}`).query({ page: 1, limit: 2 }).expect(200)

    expect(res.body.data.client).toMatchObject({
      id: CLIENT_A_ID,
      companyName: 'Bluebird Coffee Co.',
      status: 'ACTIVE',
      createdBy: { id: USERS.admin1.id, name: 'Admin One' },
    })
    // priority desc (URGENT > HIGH > MEDIUM), then dueDate asc nulls last, updatedAt desc.
    const titles = res.body.data.relatedTasks.data.map((t: { title: string }) => t.title) as string[]
    expect(titles).toEqual(['Urgent landing', 'High design audit'])
    expect(res.body.data.relatedTasks.meta).toEqual({ page: 1, limit: 2, total: 3 })
    expect(res.body.data.relatedTasks.data[0]).toMatchObject({
      assignee: { id: USERS.member1.id, name: 'Member One' },
      client: { id: CLIENT_A_ID, companyName: 'Bluebird Coffee Co.' },
    })

    const page2 = await member.agent.get(`/api/v1/clients/${CLIENT_A_ID}`).query({ page: 2, limit: 2 }).expect(200)
    expect(page2.body.data.relatedTasks.data).toHaveLength(1)
    expect(page2.body.data.relatedTasks.data[0].title).toBe('Medium newsletter')
  })

  it('404s for an unknown client id (CLIENT_NOT_FOUND)', async () => {
    const res = await member.agent.get('/api/v1/clients/ffffffff-ffff-4000-8000-0000000000ff').expect(404)
    expect(res.body).toMatchObject({ code: 'CLIENT_NOT_FOUND', status: 404 })
  })

  // --- CLI-API-003/005: archived visibility (BOLA-safe) ---

  it('gives an admin the archived client detail but 404s a member (BOLA-safe)', async () => {
    await seedDefaultClients(db)

    const adminRes = await admin.agent.get(`/api/v1/clients/${CLIENT_C_ID}`).expect(200)
    expect(adminRes.body.data.client.status).toBe('ARCHIVED')

    const memberRes = await member.agent.get(`/api/v1/clients/${CLIENT_C_ID}`).expect(404)
    expect(memberRes.body).toMatchObject({ code: 'CLIENT_NOT_FOUND', status: 404 })
  })

  // --- CLI-API-004: update (admin only, allowlist) ---

  it('updates editable fields as ADMIN', async () => {
    await seedDefaultClients(db)

    const res = await admin.agent
      .patch(`/api/v1/clients/${CLIENT_A_ID}`)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ notes: 'Rebranding confirmed — kickoff moved to September 1.', contactEmail: '  SOFIA@BLUEBIRD.EXAMPLE ' })
      .expect(200)

    expect(res.body.data.notes).toBe('Rebranding confirmed — kickoff moved to September 1.')
    expect(res.body.data.contactEmail).toBe('sofia@bluebird.example') // normalized (ADR-002)
    expect(res.body.data.status).toBe('ACTIVE') // status untouched by PATCH
  })

  it('forbids a MEMBER from updating (403 FORBIDDEN)', async () => {
    await seedDefaultClients(db)

    const res = await member.agent
      .patch(`/api/v1/clients/${CLIENT_A_ID}`)
      .set('X-CSRF-Token', member.csrfToken)
      .send({ notes: 'sneaky edit' })
      .expect(403)
    expect(res.body).toMatchObject({ code: 'FORBIDDEN', status: 403 })
  })

  it('400s an empty PATCH body (nothing to update)', async () => {
    await seedDefaultClients(db)

    const res = await admin.agent
      .patch(`/api/v1/clients/${CLIENT_A_ID}`)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({})
      .expect(400)
    expect(res.body).toMatchObject({ code: 'VALIDATION_ERROR', status: 400 })
  })

  it('409s a write to an ARCHIVED client (CLIENT_ARCHIVED)', async () => {
    await seedDefaultClients(db)

    const res = await admin.agent
      .patch(`/api/v1/clients/${CLIENT_C_ID}`)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ notes: 'too late' })
      .expect(409)
    expect(res.body).toMatchObject({ code: 'CLIENT_ARCHIVED', status: 409 })

    const stored = await db.prisma.client.findUnique({ where: { id: CLIENT_C_ID } })
    expect(stored?.notes).toBeNull() // nothing changed
  })

  // --- CLI-API-005: deactivate / archive ---

  it('deactivates a client as ADMIN and treats INACTIVE as a 200 no-op', async () => {
    await seedDefaultClients(db)

    const res = await admin.agent
      .post(`/api/v1/clients/${CLIENT_A_ID}/deactivate`)
      .set('X-CSRF-Token', admin.csrfToken)
      .expect(200)
    expect(res.body.data.status).toBe('INACTIVE')

    const noop = await admin.agent
      .post(`/api/v1/clients/${CLIENT_A_ID}/deactivate`)
      .set('X-CSRF-Token', admin.csrfToken)
      .expect(200)
    expect(noop.body.data.status).toBe('INACTIVE')

    const stored = await db.prisma.client.findUnique({ where: { id: CLIENT_A_ID } })
    expect(stored?.status).toBe('INACTIVE') // never deleted
  })

  it('archives a client as ADMIN; double archive is a 409 with no state change', async () => {
    await seedDefaultClients(db)

    const res = await admin.agent
      .post(`/api/v1/clients/${CLIENT_A_ID}/archive`)
      .set('X-CSRF-Token', admin.csrfToken)
      .expect(200)
    expect(res.body.data.status).toBe('ARCHIVED')

    const double = await admin.agent
      .post(`/api/v1/clients/${CLIENT_A_ID}/archive`)
      .set('X-CSRF-Token', admin.csrfToken)
      .expect(409)
    expect(double.body).toMatchObject({ code: 'CLIENT_ARCHIVED', status: 409 })
  })

  it('forbids a MEMBER from deactivate/archive (403 FORBIDDEN)', async () => {
    await seedDefaultClients(db)

    const deactivate = await member.agent
      .post(`/api/v1/clients/${CLIENT_A_ID}/deactivate`)
      .set('X-CSRF-Token', member.csrfToken)
      .expect(403)
    expect(deactivate.body).toMatchObject({ code: 'FORBIDDEN', status: 403 })

    const archive = await member.agent
      .post(`/api/v1/clients/${CLIENT_A_ID}/archive`)
      .set('X-CSRF-Token', member.csrfToken)
      .expect(403)
    expect(archive.body).toMatchObject({ code: 'FORBIDDEN', status: 403 })
  })

  it('deactivating an ARCHIVED client is a 409 (immutable)', async () => {
    await seedDefaultClients(db)

    const res = await admin.agent
      .post(`/api/v1/clients/${CLIENT_C_ID}/deactivate`)
      .set('X-CSRF-Token', admin.csrfToken)
      .expect(409)
    expect(res.body).toMatchObject({ code: 'CLIENT_ARCHIVED', status: 409 })
  })

  it('after archiving: member gets 404 on detail and the client disappears from member lists', async () => {
    await seedDefaultClients(db)
    await admin.agent
      .post(`/api/v1/clients/${CLIENT_B_ID}/archive`)
      .set('X-CSRF-Token', admin.csrfToken)
      .expect(200)

    const detail = await member.agent.get(`/api/v1/clients/${CLIENT_B_ID}`).expect(404)
    expect(detail.body.code).toBe('CLIENT_NOT_FOUND')

    const list = await member.agent.get('/api/v1/clients').query({ q: 'vela' }).expect(200)
    expect(list.body.meta.total).toBe(0) // BR-005: invisible, search yields nothing
  })

  // --- CLI-API-006: association invariant (no tasks module yet — exercised on the service) ---

  it('rejects new task associations to an ARCHIVED client with 422 (CLI-API-006)', async () => {
    await seedDefaultClients(db)
    const service = app.get(ClientsService)

    await expect(service.assertAssignable(CLIENT_C_ID)).rejects.toMatchObject({
      status: 422,
      response: { code: 'CANNOT_ASSIGN_ARCHIVED_CLIENT' },
    })

    // ACTIVE/INACTIVE clients pass; null passes; unknown ids 404.
    await expect(service.assertAssignable(CLIENT_A_ID)).resolves.toBeUndefined()
    await expect(service.assertAssignable(CLIENT_INACTIVE_ID)).resolves.toBeUndefined()
    await expect(service.assertAssignable(null)).resolves.toBeUndefined()
    await expect(service.assertAssignable(undefined)).resolves.toBeUndefined()
    await expect(service.assertAssignable('ffffffff-ffff-4000-8000-0000000000ff')).rejects.toMatchObject({
      status: 404,
      response: { code: 'CLIENT_NOT_FOUND' },
    })
  })
})

/** The 4-client baseline used by most cases: 2 ACTIVE, 1 INACTIVE, 1 ARCHIVED. */
async function seedDefaultClients(db: TestDb): Promise<void> {
  await db.prisma.client.createMany({
    data: [
      {
        id: CLIENT_A_ID,
        companyName: 'Bluebird Coffee Co.',
        industry: 'Retail',
        contactName: 'Sofia Lindqvist',
        contactEmail: 'sofia@bluebirdcoffee.example',
        phone: '+34 600 123 456',
        notes: null,
        status: 'ACTIVE',
        createdById: USERS.admin1.id,
      },
      {
        id: CLIENT_B_ID,
        companyName: 'Vela Analytics',
        industry: 'SaaS',
        contactName: 'Daniel Okafor',
        contactEmail: 'daniel@vela.example',
        phone: null,
        notes: null,
        status: 'ACTIVE',
        createdById: USERS.member1.id,
      },
      {
        id: CLIENT_INACTIVE_ID,
        companyName: 'Northwind Traders',
        industry: null,
        contactName: 'Helena Cruz',
        contactEmail: 'helena@northwind.example',
        phone: null,
        notes: null,
        status: 'INACTIVE',
        createdById: USERS.admin1.id,
      },
      {
        id: CLIENT_C_ID,
        companyName: 'Old Archive Co.',
        industry: 'Media',
        contactName: 'Ghost Contact',
        contactEmail: 'ghost@oldarchive.example',
        phone: null,
        notes: null,
        status: 'ARCHIVED',
        createdById: USERS.admin1.id,
      },
    ],
  })
}

/** 3 tasks on CLIENT_A (2 archived-excluded candidates) for the detail case. */
async function seedRelatedTasks(db: TestDb): Promise<void> {
  const base = {
    clientId: CLIENT_A_ID,
    creatorId: USERS.admin1.id,
    assigneeId: USERS.member1.id,
    status: 'PENDING' as const,
    version: 1,
  }
  await db.prisma.task.createMany({
    data: [
      { ...base, title: 'Urgent landing', priority: 'URGENT', dueDate: new Date('2026-08-20') },
      { ...base, title: 'High design audit', priority: 'HIGH', dueDate: null },
      { ...base, title: 'Medium newsletter', priority: 'MEDIUM', dueDate: new Date('2026-09-01') },
      // Archived tasks are excluded from the related summary (BR-016).
      {
        ...base,
        title: 'Old archived task',
        priority: 'URGENT',
        dueDate: null,
        archivedAt: new Date(),
      },
    ],
  })
}
