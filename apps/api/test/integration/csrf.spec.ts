// AUTH-003 integration: signed double-submit CSRF (PH-04).
//
// The global CsrfMiddleware validates every POST/PATCH/PUT/DELETE (GET/HEAD/
// OPTIONS exempt): no X-CSRF-Token header -> 403 CSRF_INVALID. The login flow
// ROTATES the token — the pre-auth token (bound to 'anonymous') stops working
// once the JWT session exists; the rotated token from the login body is the
// one unsafe requests must echo. Logout clears the JWT and re-binds the token
// to 'anonymous'.
import type { INestApplication } from '@nestjs/common'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createTestApp } from './helpers/test-app'
import { DEMO_PASSWORD, USERS, dockerAvailable, seedBaseUsers, startTestDb, truncateAll, type TestDb } from './helpers/fixtures'
import { fetchCsrfToken, loginAs, newAgent, type TestAgent } from './helpers/auth-flow'

describe.skipIf(!dockerAvailable())('csrf (postgres:17-alpine)', () => {
  let db: TestDb
  let app: INestApplication
  let agent: TestAgent

  beforeAll(async () => {
    db = await startTestDb()
    app = await createTestApp(db.uri)
  }, 180_000)

  afterAll(async () => {
    await app?.close()
    await db?.stop()
  })

  beforeEach(async () => {
    await truncateAll(db.prisma)
    await seedBaseUsers(db.prisma)
    agent = newAgent(app.getHttpServer())
  })

  it('rejects an unsafe POST with no CSRF token -> 403 CSRF_INVALID', async () => {
    const res = await agent
      .post('/api/v1/auth/login')
      .send({ email: USERS.admin1.email, password: DEMO_PASSWORD })
      .expect(403)
    expect(res.body).toMatchObject({ code: 'CSRF_INVALID', status: 403 })
    expect(res.body.traceId).toBeTypeOf('string')
  })

  it('rejects a forged CSRF token -> 403 CSRF_INVALID', async () => {
    const csrfToken = await fetchCsrfToken(agent)
    const res = await agent
      .post('/api/v1/auth/login')
      .set('X-CSRF-Token', `forged-${csrfToken}`)
      .send({ email: USERS.admin1.email, password: DEMO_PASSWORD })
      .expect(403)
    expect(res.body).toMatchObject({ code: 'CSRF_INVALID', status: 403 })
  })

  it('rotates the token on login (new token in body + fresh csrf cookie)', async () => {
    const preAuthToken = await fetchCsrfToken(agent)
    const session = await loginAs(agent, USERS.admin1.email)

    expect(session.csrfToken).toBeTypeOf('string')
    expect(session.csrfToken).not.toBe(preAuthToken)
  })

  it('accepts the ROTATED token on an unsafe request (PATCH /profile)', async () => {
    const session = await loginAs(agent, USERS.admin1.email)
    const res = await agent
      .patch('/api/v1/profile')
      .set('X-CSRF-Token', session.csrfToken)
      .send({ name: 'Renamed Admin' })
      .expect(200)
    expect(res.body.data.name).toBe('Renamed Admin')
  })

  it('rejects the PRE-AUTH token after rotation -> 403 CSRF_INVALID', async () => {
    const preAuthToken = await fetchCsrfToken(agent)
    await loginAs(agent, USERS.admin1.email)

    const res = await agent
      .patch('/api/v1/profile')
      .set('X-CSRF-Token', preAuthToken) // bound to 'anonymous', stale now
      .send({ name: 'Should Not Apply' })
      .expect(403)
    expect(res.body).toMatchObject({ code: 'CSRF_INVALID', status: 403 })
  })

  it('logout clears the session (me -> 401) and re-binds the token', async () => {
    const session = await loginAs(agent, USERS.admin1.email)

    const logout = await agent
      .post('/api/v1/auth/logout')
      .set('X-CSRF-Token', session.csrfToken)
      .expect(200)
    expect(logout.body).toEqual({ data: { ok: true } })

    // Session is gone: /me now requires auth again.
    const me = await agent.get('/api/v1/auth/me').expect(401)
    expect(me.body).toMatchObject({ code: 'TOKEN_INVALID', status: 401 })
  })
})
