// Auth flow helpers for supertest agents (PH-04 specs).
//
// The CSRF middleware (global, applies to every POST/PATCH/PUT/DELETE) makes
// the login flow two-step: GET /api/v1/auth/csrf for a token bound to the
// anonymous session, then POST login echoing it in X-CSRF-Token. Login
// ROTATES the token (bound to the fresh JWT session) — the rotated token from
// the response body is what later unsafe requests must echo.
import request from 'supertest'
import { DEMO_PASSWORD } from './fixtures'

export type TestAgent = request.Agent

export interface AuthSession {
  agent: TestAgent
  csrfToken: string
}

export async function fetchCsrfToken(agent: TestAgent): Promise<string> {
  const res = await agent.get('/api/v1/auth/csrf').expect(200)
  return res.body.data.csrfToken as string
}

/** GET csrf -> POST login. Returns the ROTATED token for subsequent requests. */
export async function loginAs(
  agent: TestAgent,
  email: string,
  password: string = DEMO_PASSWORD,
): Promise<AuthSession> {
  const preAuthToken = await fetchCsrfToken(agent)
  const res = await agent
    .post('/api/v1/auth/login')
    .set('X-CSRF-Token', preAuthToken)
    .send({ email, password })
    .expect(200)
  return { agent, csrfToken: res.body.data.csrfToken as string }
}

export function newAgent(app: Parameters<typeof request.agent>[0]): TestAgent {
  return request.agent(app)
}
