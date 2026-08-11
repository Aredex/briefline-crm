// PROF-001 integration (PH-04).
//
// GET /profile returns the session user (never passwordHash); PATCH /profile
// only accepts `name` — any other field (email, role, status) is a 400
// VALIDATION_ERROR via the strict whitelist (mass assignment impossible).
import type { INestApplication } from '@nestjs/common'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createTestApp } from '../helpers/test-app'
import { USERS, dockerAvailable, seedBaseUsers, startTestDb, truncateAll, type TestDb } from '../helpers/fixtures'
import { loginAs, newAgent, type AuthSession } from '../helpers/auth-flow'

describe.skipIf(!dockerAvailable())('profile (postgres:17-alpine)', () => {
  let db: TestDb
  let app: INestApplication
  let session: AuthSession

  beforeAll(async () => {
    db = await startTestDb()
    app = await createTestApp(db.uri)
    // ONE login for the whole suite (auth tier is 5/min): beforeAll against the
    // seeded DB, then beforeEach only reseeds — the reseed recreates the same
    // ids so the JWT stays valid (same pattern as users.spec.ts).
    await seedBaseUsers(db.prisma)
    session = await loginAs(newAgent(app.getHttpServer()), USERS.admin1.email)
  }, 180_000)

  afterAll(async () => {
    await app?.close()
    await db?.stop()
  })

  beforeEach(async () => {
    await truncateAll(db.prisma)
    await seedBaseUsers(db.prisma)
  })

  it('GET /profile returns the session user WITHOUT passwordHash', async () => {
    const res = await session.agent.get('/api/v1/profile').expect(200)
    expect(res.body.data).toMatchObject({
      id: USERS.admin1.id,
      email: USERS.admin1.email,
      name: 'Admin One',
      role: 'ADMIN',
      status: 'ACTIVE',
    })
    expect(res.body.data).not.toHaveProperty('passwordHash')
    expect(JSON.stringify(res.body)).not.toContain('passwordHash')
  })

  it('PATCH /profile updates the own name', async () => {
    const res = await session.agent
      .patch('/api/v1/profile')
      .set('X-CSRF-Token', session.csrfToken)
      .send({ name: '  Renamed Admin  ' }) // trimmed by the DTO transform
      .expect(200)
    expect(res.body.data.name).toBe('Renamed Admin')
    expect(res.body.data).not.toHaveProperty('passwordHash')
  })

  it('PATCH /profile rejects a non-editable field (email) with 400 VALIDATION_ERROR', async () => {
    const res = await session.agent
      .patch('/api/v1/profile')
      .set('X-CSRF-Token', session.csrfToken)
      .send({ email: 'hacked@briefline.demo' })
      .expect(400)
    expect(res.body).toMatchObject({ code: 'VALIDATION_ERROR', status: 400 })
    expect(res.body.errors?.[0]).toMatchObject({ field: 'email', code: 'UNKNOWN_PROPERTY' })
  })

  it('PATCH /profile rejects an invalid name length with 400 VALIDATION_ERROR', async () => {
    const res = await session.agent
      .patch('/api/v1/profile')
      .set('X-CSRF-Token', session.csrfToken)
      .send({ name: 'A' })
      .expect(400)
    expect(res.body).toMatchObject({ code: 'VALIDATION_ERROR', status: 400 })
    expect(res.body.errors?.[0]).toMatchObject({ field: 'name', code: 'INVALID_LENGTH' })
  })

  it('GET /profile requires auth (no cookie -> 401 TOKEN_INVALID)', async () => {
    const res = await newAgent(app.getHttpServer()).get('/api/v1/profile').expect(401)
    expect(res.body).toMatchObject({ code: 'TOKEN_INVALID', status: 401 })
  })

  it('GET /profile with a deactivated user -> 401 INACTIVE_USER', async () => {
    // The beforeEach session is reused (no extra login — a 6th POST /auth/login
    // in the same minute would trip the auth tier throttle). The JWT guard
    // re-loads the user from the DB on EVERY request, so deactivating the user
    // mid-session makes the very next request fail with INACTIVE_USER.
    await db.prisma.user.update({
      where: { id: USERS.admin1.id },
      data: { status: 'INACTIVE' },
    })
    const res = await session.agent.get('/api/v1/profile').expect(401)
    expect(res.body).toMatchObject({ code: 'INACTIVE_USER', status: 401 })
  })
})
