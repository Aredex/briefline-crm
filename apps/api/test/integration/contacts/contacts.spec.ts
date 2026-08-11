// CONT-API-001..006 integration (PH-14, PC-01) — contact catalogue.
//
// Throttle budget: TWO logins in beforeAll (shared admin1 + member1 sessions —
// beforeEach only reseeds the DB, and the reseed recreates the same ids so the
// JWTs stay valid). The 5/min auth budget is never approached.
//
// CONT-001 invariants under test: multiple contacts per client with at most
// one primary (markPrimary unsets the previous one atomically), and no
// duplicate emails per client (409 CONTACT_EMAIL_EXISTS, P2002 mapped).
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

const CLIENT_A_ID = 'bbbbbbbb-bbbb-4000-8000-000000000101' // Bluebird Coffee Co. (ACTIVE)
const CLIENT_B_ID = 'bbbbbbbb-bbbb-4000-8000-000000000102' // Vela Analytics (ACTIVE)
const CONTACT_A_ID = 'bbbbbbbb-bbbb-4000-8000-000000000401' // Sofia Lindqvist — CLIENT_A, primary
const CONTACT_B_ID = 'bbbbbbbb-bbbb-4000-8000-000000000402' // Marta González — CLIENT_A
const CONTACT_C_ID = 'bbbbbbbb-bbbb-4000-8000-000000000403' // Daniel Okafor — CLIENT_B, primary

describe.skipIf(!dockerAvailable())('contacts (postgres:17-alpine)', () => {
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

  // --- authentication gate (global JwtAuthGuard) ---

  it('requires authentication for list and create (401)', async () => {
    const anonymous = newAgent(app.getHttpServer())
    await anonymous.get('/api/v1/contacts').expect(401)
    // An anonymous unsafe request dies in the CSRF middleware (403 CSRF_INVALID)
    // BEFORE reaching the JWT guard — middleware runs ahead of guards, so a
    // missing CSRF token is reported first, never the 401.
    const post = await anonymous.post('/api/v1/contacts').send({}).expect(403)
    expect(post.body).toMatchObject({ code: 'CSRF_INVALID', status: 403 })
  })

  // --- CONT-API-001: create (ADMIN only) ---

  it('creates a contact as ADMIN (201 + Location, trimmed + normalized email)', async () => {
    await seedDefaultContacts(db) // the client must exist (FK guard: 404 otherwise)

    const res = await admin.agent
      .post('/api/v1/contacts')
      .set('X-CSRF-Token', admin.csrfToken)
      .send({
        clientId: CLIENT_A_ID,
        firstName: '  Lucía ',
        lastName: 'Fernández',
        email: '  LUCIA@BLUEBIRDCOFFEE.EXAMPLE ',
        phone: '+34 611 222 333',
        role: 'Accounting',
      })
      .expect(201)

    expect(res.body.data.firstName).toBe('Lucía') // trimmed
    expect(res.body.data.lastName).toBe('Fernández')
    expect(res.body.data.email).toBe('lucia@bluebirdcoffee.example') // normalized (ADR-002)
    expect(res.body.data.isPrimary).toBe(false)
    expect(res.body.data.client).toEqual({ id: CLIENT_A_ID, companyName: 'Bluebird Coffee Co.' })
    expect(res.body.data).not.toHaveProperty('clientId') // resolved ref, never the raw FK
    expect(res.headers.location).toBe(`/api/v1/contacts/${res.body.data.id}`)

    const stored = await db.prisma.contact.findUnique({ where: { id: res.body.data.id } })
    expect(stored?.clientId).toBe(CLIENT_A_ID)
  })

  it('forbids a MEMBER from creating a contact (403 FORBIDDEN)', async () => {
    const res = await member.agent
      .post('/api/v1/contacts')
      .set('X-CSRF-Token', member.csrfToken)
      .send({ clientId: CLIENT_A_ID, firstName: 'Sneaky', lastName: 'Contact' })
      .expect(403)
    expect(res.body).toMatchObject({ code: 'FORBIDDEN', status: 403 })
    expect(await db.prisma.contact.count()).toBe(0)
  })

  it('404s when the client does not exist (CLIENT_NOT_FOUND)', async () => {
    const res = await admin.agent
      .post('/api/v1/contacts')
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ clientId: 'ffffffff-ffff-4000-8000-0000000000ff', firstName: 'Orphan', lastName: 'Contact' })
      .expect(404)
    expect(res.body).toMatchObject({ code: 'CLIENT_NOT_FOUND', status: 404 })
    expect(await db.prisma.contact.count()).toBe(0)
  })

  it('validates the payload with 400 (missing names, bad email, unknown property)', async () => {
    const missingName = await admin.agent
      .post('/api/v1/contacts')
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ clientId: CLIENT_A_ID, lastName: 'Solo' })
      .expect(400)
    expect(missingName.body).toMatchObject({ code: 'VALIDATION_ERROR', status: 400 })
    expect(missingName.body.errors?.[0]).toMatchObject({ field: 'firstName' })

    const badEmail = await admin.agent
      .post('/api/v1/contacts')
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ clientId: CLIENT_A_ID, firstName: 'A', lastName: 'B', email: 'not-an-email' })
      .expect(400)
    expect(badEmail.body.errors?.[0]).toMatchObject({ field: 'email' })

    // NFR-SEC-005 mass-assignment guard: unknown properties are rejected.
    const extraField = await admin.agent
      .post('/api/v1/contacts')
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ clientId: CLIENT_A_ID, firstName: 'A', lastName: 'B', isPrimary: true, createdAt: 'hack' })
      .expect(400)
    expect(extraField.body.errors?.map((e: { code: string }) => e.code)).toContain('UNKNOWN_PROPERTY')

    // No contact was persisted by any of the rejected requests.
    expect(await db.prisma.contact.count()).toBe(0)
  })

  // --- CONT-API-002: paginated list with q/clientId/isPrimary filters ---

  it('returns an empty list with pagination meta when no contacts exist', async () => {
    const res = await member.agent.get('/api/v1/contacts').expect(200)
    expect(res.body).toEqual({ data: [], meta: { page: 1, limit: 25, total: 0 } })
  })

  it('lists contacts paginated with page/limit (primary first)', async () => {
    await seedDefaultContacts(db)

    const res = await member.agent.get('/api/v1/contacts').query({ page: 1, limit: 2 }).expect(200)
    expect(res.body.meta).toEqual({ page: 1, limit: 2, total: 3 })
    expect(res.body.data).toHaveLength(2)
    // Contractual sort: isPrimary desc, then lastName asc — the two primaries
    // (Lindqvist, Okafor) come first, alphabetically by lastName.
    expect(res.body.data.map((c: { id: string }) => c.id)).toEqual([CONTACT_A_ID, CONTACT_C_ID])

    const page2 = await member.agent.get('/api/v1/contacts').query({ page: 2, limit: 2 }).expect(200)
    expect(page2.body.meta).toEqual({ page: 2, limit: 2, total: 3 })
    expect(page2.body.data).toHaveLength(1)
    expect(page2.body.data[0].id).toBe(CONTACT_B_ID) // no overlap with page 1

    const tooBig = await member.agent.get('/api/v1/contacts').query({ limit: 101 }).expect(400)
    expect(tooBig.body).toMatchObject({ code: 'VALIDATION_ERROR', status: 400 })
  })

  it('filters by clientId', async () => {
    await seedDefaultContacts(db)

    const res = await member.agent.get('/api/v1/contacts').query({ clientId: CLIENT_A_ID }).expect(200)
    expect(res.body.meta.total).toBe(2)
    expect(res.body.data.every((c: { client: { id: string } }) => c.client.id === CLIENT_A_ID)).toBe(true)

    const none = await member.agent.get('/api/v1/contacts').query({ clientId: CLIENT_B_ID }).query({ isPrimary: false }).expect(200)
    expect(none.body.meta.total).toBe(0)
  })

  it('searches by firstName, lastName and email, case-insensitive', async () => {
    await seedDefaultContacts(db)

    const byLast = await member.agent.get('/api/v1/contacts').query({ q: 'lindqvist' }).expect(200)
    expect(byLast.body.meta.total).toBe(1)
    expect(byLast.body.data[0].id).toBe(CONTACT_A_ID)

    const byEmail = await member.agent.get('/api/v1/contacts').query({ q: 'BLUEBIRDCOFFEE' }).expect(200)
    expect(byEmail.body.meta.total).toBe(2)

    const byFirst = await member.agent.get('/api/v1/contacts').query({ q: 'daniel' }).expect(200)
    expect(byFirst.body.meta.total).toBe(1)
    expect(byFirst.body.data[0].id).toBe(CONTACT_C_ID)
  })

  it('filters by isPrimary=true (exactly one per client)', async () => {
    await seedDefaultContacts(db)

    const res = await member.agent.get('/api/v1/contacts').query({ isPrimary: true }).expect(200)
    expect(res.body.meta.total).toBe(2)
    expect(res.body.data.map((c: { id: string }) => c.id)).toEqual([CONTACT_A_ID, CONTACT_C_ID])

    // A malformed boolean is a 400, never silently ignored.
    const bad = await member.agent.get('/api/v1/contacts').query({ isPrimary: 'yes' }).expect(400)
    expect(bad.body).toMatchObject({ code: 'VALIDATION_ERROR', status: 400 })
  })

  // --- CONT-API-003: detail ---

  it('returns the contact detail for any authenticated user', async () => {
    await seedDefaultContacts(db)

    const res = await member.agent.get(`/api/v1/contacts/${CONTACT_B_ID}`).expect(200)
    expect(res.body.data).toMatchObject({
      id: CONTACT_B_ID,
      firstName: 'Marta',
      lastName: 'González',
      isPrimary: false,
      client: { id: CLIENT_A_ID, companyName: 'Bluebird Coffee Co.' },
    })
  })

  it('404s for an unknown contact id (CONTACT_NOT_FOUND)', async () => {
    const res = await member.agent.get('/api/v1/contacts/ffffffff-ffff-4000-8000-0000000000ff').expect(404)
    expect(res.body).toMatchObject({ code: 'CONTACT_NOT_FOUND', status: 404 })
  })

  // --- CONT-API-004: update (ADMIN only, allowlist) ---

  it('updates editable fields as ADMIN (normalized email)', async () => {
    await seedDefaultContacts(db)

    const res = await admin.agent
      .patch(`/api/v1/contacts/${CONTACT_B_ID}`)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ email: '  MARTA@BLUEBIRDCOFFEE.EXAMPLE ', role: 'Creative Director' })
      .expect(200)

    expect(res.body.data.email).toBe('marta@bluebirdcoffee.example') // normalized (ADR-002)
    expect(res.body.data.role).toBe('Creative Director')
    expect(res.body.data.firstName).toBe('Marta') // untouched fields preserved
    expect(res.body.data.isPrimary).toBe(false) // not editable via PATCH
  })

  it('forbids a MEMBER from updating (403 FORBIDDEN)', async () => {
    await seedDefaultContacts(db)

    const res = await member.agent
      .patch(`/api/v1/contacts/${CONTACT_A_ID}`)
      .set('X-CSRF-Token', member.csrfToken)
      .send({ role: 'sneaky' })
      .expect(403)
    expect(res.body).toMatchObject({ code: 'FORBIDDEN', status: 403 })
  })

  it('400s an empty PATCH body (nothing to update)', async () => {
    await seedDefaultContacts(db)

    const res = await admin.agent
      .patch(`/api/v1/contacts/${CONTACT_A_ID}`)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({})
      .expect(400)
    expect(res.body).toMatchObject({ code: 'VALIDATION_ERROR', status: 400 })
  })

  // --- CONT-001: no duplicate emails per client ---

  it('409s a duplicate email within the same client (CONTACT_EMAIL_EXISTS)', async () => {
    await seedDefaultContacts(db)

    const res = await admin.agent
      .post('/api/v1/contacts')
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ clientId: CLIENT_A_ID, firstName: 'Twin', lastName: 'Account', email: 'sofia@bluebirdcoffee.example' })
      .expect(409)
    expect(res.body).toMatchObject({ code: 'CONTACT_EMAIL_EXISTS', status: 409 })
    expect(res.body.errors?.[0]).toMatchObject({ field: 'email' })

    // The same email is fine on a different client.
    const otherClient = await admin.agent
      .post('/api/v1/contacts')
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ clientId: CLIENT_B_ID, firstName: 'Sofia', lastName: 'Copy', email: 'sofia@bluebirdcoffee.example' })
      .expect(201)
    expect(otherClient.body.data.client.id).toBe(CLIENT_B_ID)

    // Updating an existing contact onto a taken email also 409s.
    const clash = await admin.agent
      .patch(`/api/v1/contacts/${CONTACT_B_ID}`)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({ email: 'sofia@bluebirdcoffee.example' })
      .expect(409)
    expect(clash.body).toMatchObject({ code: 'CONTACT_EMAIL_EXISTS', status: 409 })
  })

  // --- CONT-API-005: primary transition ---

  it('marks a contact as primary, unsetting the previous one (CONT-001)', async () => {
    await seedDefaultContacts(db)

    const res = await admin.agent
      .post(`/api/v1/contacts/${CONTACT_B_ID}/primary`)
      .set('X-CSRF-Token', admin.csrfToken)
      .expect(200)
    expect(res.body.data.id).toBe(CONTACT_B_ID)
    expect(res.body.data.isPrimary).toBe(true)

    // The previous primary is unset in the same transaction.
    const previous = await admin.agent.get(`/api/v1/contacts/${CONTACT_A_ID}`).expect(200)
    expect(previous.body.data.isPrimary).toBe(false)

    // Exactly one primary per client at the row level.
    const primaryCount = await db.prisma.contact.count({
      where: { clientId: CLIENT_A_ID, isPrimary: true },
    })
    expect(primaryCount).toBe(1)

    // The other client's primary is untouched.
    const other = await admin.agent.get(`/api/v1/contacts/${CONTACT_C_ID}`).expect(200)
    expect(other.body.data.isPrimary).toBe(true)
  })

  it('treats marking the current primary as an idempotent 200 no-op', async () => {
    await seedDefaultContacts(db)

    const res = await admin.agent
      .post(`/api/v1/contacts/${CONTACT_A_ID}/primary`)
      .set('X-CSRF-Token', admin.csrfToken)
      .expect(200)
    expect(res.body.data.isPrimary).toBe(true)

    const primaryCount = await db.prisma.contact.count({
      where: { clientId: CLIENT_A_ID, isPrimary: true },
    })
    expect(primaryCount).toBe(1) // unchanged
  })

  it('forbids a MEMBER from marking primary (403 FORBIDDEN)', async () => {
    await seedDefaultContacts(db)

    const res = await member.agent
      .post(`/api/v1/contacts/${CONTACT_B_ID}/primary`)
      .set('X-CSRF-Token', member.csrfToken)
      .expect(403)
    expect(res.body).toMatchObject({ code: 'FORBIDDEN', status: 403 })
  })

  // --- CONT-API-006: delete (ADMIN only, physical) ---

  it('deletes a contact as ADMIN (physical delete)', async () => {
    await seedDefaultContacts(db)

    const res = await admin.agent
      .delete(`/api/v1/contacts/${CONTACT_B_ID}`)
      .set('X-CSRF-Token', admin.csrfToken)
      .expect(200)
    expect(res.body.data.id).toBe(CONTACT_B_ID)

    expect(await db.prisma.contact.findUnique({ where: { id: CONTACT_B_ID } })).toBeNull()
    // The remaining rows are intact.
    expect(await db.prisma.contact.count({ where: { clientId: CLIENT_A_ID } })).toBe(1)
  })

  it('forbids a MEMBER from deleting (403 FORBIDDEN)', async () => {
    await seedDefaultContacts(db)

    const res = await member.agent
      .delete(`/api/v1/contacts/${CONTACT_A_ID}`)
      .set('X-CSRF-Token', member.csrfToken)
      .expect(403)
    expect(res.body).toMatchObject({ code: 'FORBIDDEN', status: 403 })
    expect(await db.prisma.contact.count()).toBe(3) // nothing deleted
  })

  it('404s deleting an unknown contact', async () => {
    const res = await admin.agent
      .delete('/api/v1/contacts/ffffffff-ffff-4000-8000-0000000000ff')
      .set('X-CSRF-Token', admin.csrfToken)
      .expect(404)
    expect(res.body).toMatchObject({ code: 'CONTACT_NOT_FOUND', status: 404 })
  })

  // --- PC-01: client detail includes its contacts (primary first) ---

  it('includes the contact list in the client detail, primary first', async () => {
    await seedDefaultContacts(db)

    const res = await member.agent.get(`/api/v1/clients/${CLIENT_A_ID}`).expect(200)
    expect(res.body.data.contacts).toHaveLength(2)
    expect(res.body.data.contacts.map((c: { id: string; isPrimary: boolean }) => [c.id, c.isPrimary])).toEqual([
      [CONTACT_A_ID, true],
      [CONTACT_B_ID, false],
    ])
    expect(res.body.data.contacts[0]).toMatchObject({
      firstName: 'Sofia',
      client: { id: CLIENT_A_ID, companyName: 'Bluebird Coffee Co.' },
    })
  })

  it('returns an empty contacts array for a client without contacts', async () => {
    await db.prisma.client.create({
      data: {
        id: 'bbbbbbbb-bbbb-4000-8000-000000000104',
        companyName: 'Fresh Client Ltd',
        contactName: 'New Contact',
        contactEmail: 'new@freshclient.example',
        createdById: USERS.admin1.id,
      },
    })
    const res = await member.agent.get('/api/v1/clients/bbbbbbbb-bbbb-4000-8000-000000000104').expect(200)
    expect(res.body.data.contacts).toEqual([])
  })
})

/** 2 ACTIVE clients + 3 contacts (A has 2, one primary; B has 1 primary). */
async function seedDefaultContacts(db: TestDb): Promise<void> {
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
    ],
  })
  await db.prisma.contact.createMany({
    data: [
      {
        id: CONTACT_A_ID,
        clientId: CLIENT_A_ID,
        firstName: 'Sofia',
        lastName: 'Lindqvist',
        email: 'sofia@bluebirdcoffee.example',
        phone: '+34 600 123 456',
        role: 'CEO',
        isPrimary: true,
      },
      {
        id: CONTACT_B_ID,
        clientId: CLIENT_A_ID,
        firstName: 'Marta',
        lastName: 'González',
        email: 'marta@bluebirdcoffee.example',
        phone: null,
        role: 'Design Lead',
        isPrimary: false,
      },
      {
        id: CONTACT_C_ID,
        clientId: CLIENT_B_ID,
        firstName: 'Daniel',
        lastName: 'Okafor',
        email: 'daniel@vela.example',
        phone: null,
        role: 'CEO',
        isPrimary: true,
      },
    ],
  })
}
