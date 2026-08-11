// CHIST-001 (PC-06) — append-only client change auditing.
//
// Covers the audit trail written by every client mutation (CREATED /
// FIELD_CHANGED / STATUS_CHANGED / ARCHIVED), the paginated history endpoint
// (newest first) and the BOLA-safe visibility rule (member 404 on ARCHIVED,
// same policy as the detail route). Also pins PC-QA-001: the client detail
// carries the last 5 changes, newest first, with the actor resolved as
// { id, name }.
//
// Throttle budget: TWO logins in beforeAll (shared admin1 + member1 sessions —
// beforeEach only reseeds the DB and the reseed recreates the same ids so the
// JWTs stay valid). The 5/min auth budget is never approached.
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

const CLIENT_ARCHIVED_ID = 'bbbbbbbb-bbbb-4000-8000-000000000111'
const CHANGE_ID = 'bbbbbbbb-bbbb-4000-8000-000000000911'

/** Small spacing so consecutive events get distinct createdAt values (the
 *  history orderBy is [createdAt desc, id desc] — a same-ms batch would leave
 *  the intra-batch order to the random uuid tiebreak). */
const tick = (ms = 15): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

describe.skipIf(!dockerAvailable())('client history (postgres:17-alpine)', () => {
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

  /** POST /clients as admin — the client + its CREATED event. */
  async function createClient(body: Record<string, unknown>): Promise<string> {
    const res = await admin.agent
      .post('/api/v1/clients')
      .set('X-CSRF-Token', admin.csrfToken)
      .send(body)
      .expect(201)
    return res.body.data.id as string
  }

  // --- CHIST-001: events written by mutations ---

  it('creating a client writes a CREATED event', async () => {
    const id = await createClient({ companyName: 'Audit Co', contactName: 'Ana Audit', contactEmail: 'ana@audit.example' })

    const res = await member.agent.get(`/api/v1/clients/${id}/history`).expect(200)
    expect(res.body.meta).toEqual({ page: 1, limit: 25, total: 1 })
    expect(res.body.data).toHaveLength(1)
    expect(res.body.data[0]).toMatchObject({
      event: 'CREATED',
      field: null,
      oldValue: null,
      newValue: null,
      clientId: id,
      actor: { id: USERS.admin1.id, name: 'Admin One' },
    })
    expect(typeof res.body.data[0].id).toBe('string')
    expect(typeof res.body.data[0].createdAt).toBe('string')
  })

  it('updating writes one FIELD_CHANGED event per changed field with old/new values', async () => {
    const id = await createClient({
      companyName: 'Old Name Co',
      industry: 'Retail',
      contactName: 'Ana Audit',
      contactEmail: 'ana@audit.example',
      phone: null,
      notes: null,
    })

    await admin.agent
      .patch(`/api/v1/clients/${id}`)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ companyName: 'New Name Co', industry: 'SaaS' })
      .expect(200)

    const res = await admin.agent.get(`/api/v1/clients/${id}/history`).expect(200)
    expect(res.body.meta.total).toBe(3) // CREATED + 2 field events
    const fieldEvents = res.body.data.filter((c: { event: string }) => c.event === 'FIELD_CHANGED')
    expect(fieldEvents).toHaveLength(2)
    expect(fieldEvents.map((c: { field: string }) => c.field).sort()).toEqual(['companyName', 'industry'])
    const companyEvent = fieldEvents.find((c: { field: string }) => c.field === 'companyName')
    expect(companyEvent).toMatchObject({ oldValue: '"Old Name Co"', newValue: '"New Name Co"' }) // JSON-serialized (D-7)
    const industryEvent = fieldEvents.find((c: { field: string }) => c.field === 'industry')
    expect(industryEvent).toMatchObject({ oldValue: '"Retail"', newValue: '"SaaS"' })
  })

  it('writes no event when the submitted value equals the stored one', async () => {
    const id = await createClient({ companyName: 'Stable Co', contactName: 'Ana Audit', contactEmail: 'ana@audit.example' })

    await tick()
    await admin.agent
      .patch(`/api/v1/clients/${id}`)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ companyName: 'Stable Co' })
      .expect(200)

    const res = await admin.agent.get(`/api/v1/clients/${id}/history`).expect(200)
    expect(res.body.meta.total).toBe(1) // still only CREATED
    expect(res.body.data.map((c: { event: string }) => c.event)).toEqual(['CREATED'])
  })

  it('deactivating writes a STATUS_CHANGED event; the INACTIVE no-op writes none', async () => {
    const id = await createClient({ companyName: 'Pause Co', contactName: 'Ana Audit', contactEmail: 'ana@audit.example' })

    await admin.agent.post(`/api/v1/clients/${id}/deactivate`).set('X-CSRF-Token', admin.csrfToken).expect(200)
    await tick()
    await admin.agent.post(`/api/v1/clients/${id}/deactivate`).set('X-CSRF-Token', admin.csrfToken).expect(200) // no-op

    const res = await admin.agent.get(`/api/v1/clients/${id}/history`).expect(200)
    expect(res.body.meta.total).toBe(2) // CREATED + STATUS_CHANGED — the no-op added nothing
    expect(res.body.data[0]).toMatchObject({
      event: 'STATUS_CHANGED',
      field: 'status',
      oldValue: '"ACTIVE"',
      newValue: '"INACTIVE"',
      actor: { id: USERS.admin1.id, name: 'Admin One' },
    })
  })

  it('archiving writes an ARCHIVED event', async () => {
    const id = await createClient({ companyName: 'Archive Co', contactName: 'Ana Audit', contactEmail: 'ana@audit.example' })

    await admin.agent.post(`/api/v1/clients/${id}/archive`).set('X-CSRF-Token', admin.csrfToken).expect(200)

    const res = await admin.agent.get(`/api/v1/clients/${id}/history`).expect(200)
    expect(res.body.meta.total).toBe(2)
    expect(res.body.data[0]).toMatchObject({ event: 'ARCHIVED', field: null, oldValue: null, newValue: null })
  })

  // --- BOLA-safe visibility ---

  it('hides the history of an ARCHIVED client from members (404) but not from admins', async () => {
    // Seeded directly (no CREATED event) — the guard must 404 before any read.
    await db.prisma.client.create({
      data: {
        id: CLIENT_ARCHIVED_ID,
        companyName: 'Ghost Archive Ltd',
        contactName: 'Ghost Contact',
        contactEmail: 'ghost@archive.example',
        status: 'ARCHIVED',
        createdById: USERS.admin1.id,
      },
    })
    await db.prisma.clientChange.create({
      data: {
        id: CHANGE_ID,
        clientId: CLIENT_ARCHIVED_ID,
        actorId: USERS.admin1.id,
        event: 'ARCHIVED',
        field: null,
        oldValue: null,
        newValue: null,
      },
    })

    const memberRes = await member.agent.get(`/api/v1/clients/${CLIENT_ARCHIVED_ID}/history`).expect(404)
    expect(memberRes.body).toMatchObject({ code: 'CLIENT_NOT_FOUND', status: 404 })

    const adminRes = await admin.agent.get(`/api/v1/clients/${CLIENT_ARCHIVED_ID}/history`).expect(200)
    expect(adminRes.body.meta.total).toBe(1)
    expect(adminRes.body.data[0]).toMatchObject({ event: 'ARCHIVED', clientId: CLIENT_ARCHIVED_ID })
  })

  it('404s the history of an unknown client id', async () => {
    const res = await member.agent.get('/api/v1/clients/ffffffff-ffff-4000-8000-0000000000ff/history').expect(404)
    expect(res.body).toMatchObject({ code: 'CLIENT_NOT_FOUND', status: 404 })
  })

  // --- Pagination + PC-QA-001 ---

  it('paginates newest first across pages', async () => {
    const id = await createClient({ companyName: 'Paged Co', contactName: 'Ana Audit', contactEmail: 'ana@audit.example' })

    await tick()
    await admin.agent.patch(`/api/v1/clients/${id}`).set('X-CSRF-Token', admin.csrfToken).send({ contactName: 'Bea One' }).expect(200)
    await tick()
    await admin.agent.patch(`/api/v1/clients/${id}`).set('X-CSRF-Token', admin.csrfToken).send({ phone: '+34 600 000 001' }).expect(200)
    await tick()
    await admin.agent.patch(`/api/v1/clients/${id}`).set('X-CSRF-Token', admin.csrfToken).send({ notes: 'Renewing contract.' }).expect(200)

    // 1 CREATED + 3 FIELD_CHANGED = 4 events, newest first: notes, phone, contactName, CREATED.
    const page1 = await admin.agent.get(`/api/v1/clients/${id}/history`).query({ page: 1, limit: 2 }).expect(200)
    expect(page1.body.meta).toEqual({ page: 1, limit: 2, total: 4 })
    expect(page1.body.data.map((c: { field: string | null }) => c.field)).toEqual(['notes', 'phone'])

    const page2 = await admin.agent.get(`/api/v1/clients/${id}/history`).query({ page: 2, limit: 2 }).expect(200)
    expect(page2.body.meta).toEqual({ page: 2, limit: 2, total: 4 })
    expect(page2.body.data.map((c: { field: string | null }) => c.field)).toEqual(['contactName', null]) // null = CREATED

    const page3 = await admin.agent.get(`/api/v1/clients/${id}/history`).query({ page: 3, limit: 2 }).expect(200)
    expect(page3.body.meta).toEqual({ page: 3, limit: 2, total: 4 })
    expect(page3.body.data).toEqual([])
  })

  it('every event carries the resolved actor { id, name }', async () => {
    const id = await createClient({ companyName: 'Actor Co', contactName: 'Ana Audit', contactEmail: 'ana@audit.example' })
    await tick()
    await admin.agent.post(`/api/v1/clients/${id}/deactivate`).set('X-CSRF-Token', admin.csrfToken).expect(200)

    const res = await admin.agent.get(`/api/v1/clients/${id}/history`).expect(200)
    expect(res.body.data).toHaveLength(2)
    for (const change of res.body.data as Array<{ actor: { id: string; name: string } }>) {
      expect(change.actor).toEqual({ id: USERS.admin1.id, name: 'Admin One' })
    }
    expect(res.body.data[0]).not.toHaveProperty('actorId') // never raw FK shape
  })

  it('the client detail carries the last 5 changes, newest first (PC-QA-001)', async () => {
    const id = await createClient({ companyName: 'Detail Co', contactName: 'Ana Audit', contactEmail: 'ana@audit.example' })

    for (const notes of ['one', 'two', 'three', 'four', 'five', 'six']) {
      await tick()
      await admin.agent.patch(`/api/v1/clients/${id}`).set('X-CSRF-Token', admin.csrfToken).send({ notes }).expect(200)
    }

    const res = await member.agent.get(`/api/v1/clients/${id}`).expect(200)
    // 1 CREATED + 6 notes edits = 7 events; the detail keeps the 5 newest.
    expect(res.body.data.history).toHaveLength(5)
    expect(res.body.data.history.map((c: { newValue: string }) => c.newValue)).toEqual(['"six"', '"five"', '"four"', '"three"', '"two"'])
    expect(res.body.data.history.every((c: { actor: { id: string } }) => c.actor.id === USERS.admin1.id)).toBe(true)
  })
})
