// AUTH-001 integration: login/logout/me + rate limiting (PH-04).
//
// Budget discipline for the /auth/login throttle (5/min per IP, AUTH-004):
// every login POST in THIS file counts — the 6th MUST be a 429, so the 429
// case is declared LAST. GETs (/me, /auth/csrf) hit the default 100/min
// throttle, never the auth one. fileParallelism:false + one app per spec file
// keeps the in-memory throttle storage isolated from the other spec files.
//
// The CSRF middleware applies to POSTs too — every login request first does
// GET /api/v1/auth/csrf and echoes the token (helpers/auth-flow.ts).
import { JwtService } from '@nestjs/jwt'
import type { INestApplication } from '@nestjs/common'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { JWT_ALGORITHM, JWT_AUDIENCE, JWT_ISSUER } from '../../../src/modules/auth/auth.constants'
import { createTestApp } from '../helpers/test-app'
import {
  DEMO_PASSWORD,
  USERS,
  dockerAvailable,
  seedBaseUsers,
  startTestDb,
  truncateAll,
  type TestDb,
} from '../helpers/fixtures'
import { fetchCsrfToken, loginAs, newAgent } from '../helpers/auth-flow'

const COOKIE = 'briefline-token' // getJwtCookieName('test') — ADR-001

const CREDENTIALS_BODY = { code: 'INVALID_CREDENTIALS', status: 401, detail: 'Invalid email or password.' }

describe.skipIf(!dockerAvailable())('auth (postgres:17-alpine)', () => {
  let db: TestDb
  let app: INestApplication

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
  })

  it('logs in an ACTIVE admin with valid credentials (200 + HttpOnly cookie)', async () => {
    const client = newAgent(app.getHttpServer())
    const csrfToken = await fetchCsrfToken(client)
    const res = await client
      .post('/api/v1/auth/login')
      .set('X-CSRF-Token', csrfToken)
      .send({ email: USERS.admin1.email, password: DEMO_PASSWORD })
      .expect(200)

    expect(res.body.data.csrfToken).toBeTypeOf('string')
    expect(res.body.data.csrfToken.length).toBeGreaterThan(20)

    const setCookies = (res.headers['set-cookie'] as string[] | undefined) ?? []
    const tokenCookie = setCookies.find((c) => c.startsWith(`${COOKIE}=`))
    expect(tokenCookie).toBeDefined()
    expect(tokenCookie).toContain('HttpOnly')
    expect(tokenCookie).toContain('Path=/')
    expect(tokenCookie).toContain('SameSite=Lax')
    expect(tokenCookie).toContain('Max-Age=28800') // 8h (ADR-001)
    expect(tokenCookie).not.toContain('Secure') // NODE_ENV=test (ADR-001)
    // No credential or JWT ever reaches the response body.
    expect(JSON.stringify(res.body)).not.toContain('eyJ')
  })

  it('rejects a wrong password with 401 INVALID_CREDENTIALS (no cookie)', async () => {
    const client = newAgent(app.getHttpServer())
    const csrfToken = await fetchCsrfToken(client)
    const res = await client
      .post('/api/v1/auth/login')
      .set('X-CSRF-Token', csrfToken)
      .send({ email: USERS.admin1.email, password: 'wrong-password-123' })
      .expect(401)

    expect(res.body).toMatchObject(CREDENTIALS_BODY)
    expect(res.body.traceId).toBeTypeOf('string')
    const setCookies = (res.headers['set-cookie'] as string[] | undefined) ?? []
    expect(setCookies.find((c) => c.startsWith(`${COOKIE}=`))).toBeUndefined()
  })

  it('rejects an unknown email with the IDENTICAL 401 (no user enumeration)', async () => {
    const client = newAgent(app.getHttpServer())
    const csrfToken = await fetchCsrfToken(client)
    const res = await client
      .post('/api/v1/auth/login')
      .set('X-CSRF-Token', csrfToken)
      .send({ email: 'ghost@briefline.demo', password: 'wrong-password-123' })
      .expect(401)

    expect(res.body).toMatchObject(CREDENTIALS_BODY)
  })

  it('rejects an INACTIVE user with the IDENTICAL 401 (no status enumeration)', async () => {
    const client = newAgent(app.getHttpServer())
    const csrfToken = await fetchCsrfToken(client)
    const res = await client
      .post('/api/v1/auth/login')
      .set('X-CSRF-Token', csrfToken)
      .send({ email: USERS.member6.email, password: DEMO_PASSWORD })
      .expect(401)

    expect(res.body).toMatchObject(CREDENTIALS_BODY)
  })

  it('GET /auth/me without a cookie -> 401 TOKEN_INVALID', async () => {
    const client = newAgent(app.getHttpServer())
    const res = await client.get('/api/v1/auth/me').expect(401)
    expect(res.body).toMatchObject({ code: 'TOKEN_INVALID', status: 401 })
  })

  it('GET /auth/me with an EXPIRED token -> 401 TOKEN_EXPIRED', async () => {
    const jwtService = app.get(JwtService)
    const expired = await jwtService.signAsync(
      { sub: USERS.admin1.id, role: 'ADMIN' },
      { algorithm: JWT_ALGORITHM, issuer: JWT_ISSUER, audience: JWT_AUDIENCE, expiresIn: -60 },
    )
    const client = newAgent(app.getHttpServer())
    const res = await client.get('/api/v1/auth/me').set('Cookie', `${COOKIE}=${expired}`).expect(401)
    expect(res.body).toMatchObject({ code: 'TOKEN_EXPIRED', status: 401 })
  })

  it('GET /auth/me with a token minted for another audience -> 401 TOKEN_INVALID', async () => {
    const jwtService = app.get(JwtService)
    const wrongAudience = await jwtService.signAsync(
      { sub: USERS.admin1.id, role: 'ADMIN' },
      { algorithm: JWT_ALGORITHM, issuer: JWT_ISSUER, audience: 'evil-web', expiresIn: 3600 },
    )
    const client = newAgent(app.getHttpServer())
    const res = await client.get('/api/v1/auth/me').set('Cookie', `${COOKIE}=${wrongAudience}`).expect(401)
    expect(res.body).toMatchObject({ code: 'TOKEN_INVALID', status: 401 })
  })

  it('supports a second login on the same account (fresh session works)', async () => {
    const client = newAgent(app.getHttpServer())
    await loginAs(client, USERS.admin1.email)
    const me = await client.get('/api/v1/auth/me').expect(200)
    expect(me.body.data).toMatchObject({ email: USERS.admin1.email, role: 'ADMIN' })
  })

  it('blocks the 6th login POST in a minute with 429 RATE_LIMITED + Retry-After', async () => {
    // Five logins above (cases 1-4 + second-login) already consumed the
    // 5/min auth budget for this IP — this request MUST be throttled.
    const client = newAgent(app.getHttpServer())
    const csrfToken = await fetchCsrfToken(client)
    const res = await client
      .post('/api/v1/auth/login')
      .set('X-CSRF-Token', csrfToken)
      .send({ email: USERS.admin1.email, password: DEMO_PASSWORD })
      .expect(429)

    expect(res.body).toMatchObject({ code: 'RATE_LIMITED', status: 429, retryAfterSeconds: 300 })
    expect(res.headers['retry-after']).toBe('300')
    expect(res.headers['x-trace-id']).toBeTypeOf('string')
  })
})
