# OpenAPI v1 & Error Catalogue — Briefline CRM

**Date:** 2026-08-11
**Status:** PH-01 Draft
**Owner:** ARCH/BE (API-001, API-002)
**References:** `docs/02-prd.en.md` (§11–13, BR-001–020), `docs/plans/04-development-plan.en.md` (PH-01, PH-04/05/06), `adrs.md` (ADR-001..005), `permission-matrix.md`, `consolidated-api-baseline.md`, `backend-api-verification.md`, RFC 9457

---

## 0. Conventions (recap — normative)

| Convention | Value |
|---|---|
| API prefix | `/api/v1` (global prefix `/api` + URI version `v1`; Swagger UI served at `GET /api/docs`) |
| IDs | UUID v4 strings |
| Dates | ISO 8601 — date-only `YYYY-MM-DD` for deadlines, datetime `YYYY-MM-DDTHH:mm:ss.sssZ` (UTC) for timestamps |
| Pagination | `?page=1&limit=25` (default page=1, limit=25; max limit=100; `limit>100` → 400) |
| Response envelope | Collection `{ "data": [...], "meta": { "page", "limit", "total" } }` · Single `{ "data": { ... } }` |
| Errors | `application/problem+json` (RFC 9457) with `type`, `title`, `status`, `detail`, `instance`, `traceId`, `code`, optional `errors[]` |
| Auth | HttpOnly cookie `briefline-token` (production: `__Host-briefline-token`) + `X-CSRF-Token` header on POST/PATCH/PUT/DELETE |
| Sort (contractual) | Board and My Tasks: priority desc (URGENT→LOW), due date asc nulls last, updatedAt desc — deterministic server-side, no manual card order |
| Rate limiting | Global 100 req/60 s per IP · Login 5 req/60 s with 300 s block (429 contractual) |
| Length limits | name 100 · email 254 · company 160 · industry 80 · contact name 100 · phone 32 · notes 2000 · task title 160 · description 5000 · blocked reason 500 · search 100 · password 8–72 |
| Optimistic locking | Every task mutation (`PATCH` update, `PATCH` status, `POST` archive) requires `expectedVersion`; stale → 409 `STALE_VERSION` with `currentVersion` + `currentState` |

**Naming alignment (supersedes earlier drafts):** the permission-matrix draft codes `VERSION_CONFLICT` / `EMAIL_CONFLICT` / `ASSIGNEE_INACTIVE` / `ACTIVE_TASK_REQUIRES_ASSIGNEE` / `CSRF_FAILED` are superseded by the canonical codes below (`STALE_VERSION`, `EMAIL_ALREADY_EXISTS`, `INACTIVE_ASSIGNEE`, `ASSIGNEE_REQUIRED`, `CSRF_INVALID`) per ADR-002/ADR-004 and the error catalogue (§3). ADRs win over the matrix; the catalogue is the single source of truth.

---

## 1. OpenAPI v1 Specification

```yaml
openapi: 3.1.0
info:
  title: Briefline CRM API
  version: 1.0.0
  description: |
    Internal CRM for small digital agencies. Connects clients, owners, and tasks with
    simple permissions, a visual board, useful filters, and automatic traceability.

    Authentication: HttpOnly cookie JWT (`briefline-token`, `__Host-briefline-token` in
    production). CSRF: signed double-submit — fetch `GET /auth/csrf`, keep the token in
    memory, send it as `X-CSRF-Token` on every unsafe method. 401 = invalid session
    (frontend clears session and redirects to /login). 403 = valid session, insufficient
    permission (frontend renders a forbidden state, never logs out).
  license:
    name: Proprietary — Briefline CRM demo
  contact:
    name: Briefline CRM Team
    url: https://briefline-crm.demo
externalDocs:
  description: RFC 9457 Problem Details for HTTP APIs
  url: https://www.rfc-editor.org/rfc/rfc9457.html
servers:
  - url: /api/v1
    description: 'Same-origin (production: Nest serves the SPA) or Vite proxy in development'

security:
  - cookieAuth: []

tags:
  - name: auth
    description: Session, CSRF token, current user
  - name: users
    description: Administrator user management (admin only)
  - name: profile
    description: Own profile (self)
  - name: clients
    description: Client catalogue
  - name: tasks
    description: Board, tasks, history
  - name: dashboard
    description: KPIs, my tasks, recent activity
  - name: system
    description: Health checks

paths:
  /health:
    get:
      tags: [system]
      summary: Health check
      description: Public. Used by the hosting platform health probe. Returns 200 only when the API and database are reachable; 503 while initializing or when the DB is down.
      operationId: getHealth
      security: []
      responses:
        '200':
          description: API and database are healthy
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/HealthResponse'
              example:
                status: ok
                db: up
                timestamp: '2026-08-11T08:00:00.000Z'
        '503':
          $ref: '#/components/responses/InternalError'

  /auth/csrf:
    get:
      tags: [auth]
      summary: Get CSRF token
      description: |
        Public. Issues a fresh signed double-submit CSRF token bound to the current
        session identifier (the JWT cookie value, or 'anonymous' pre-auth). Sets/refreshes
        the `csrf-token` HttpOnly cookie and returns the token in the body. The frontend
        keeps the token in memory only — the cookie value is never exposed to JS.
        Call before login (login is CSRF-protected) and again after any 403 CSRF failure.
      operationId: getCsrfToken
      security: []
      responses:
        '200':
          description: CSRF token issued; `csrf-token` cookie set
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/CsrfTokenResponse'
              example:
                data:
                  csrfToken: 9f2c1d3e4b5a6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d

  /auth/login:
    post:
      tags: [auth]
      summary: Log in
      description: |
        Public. Rate-limited (5 attempts / 60 s per IP, 300 s block → 429). Any failure —
        unknown email, wrong password, or inactive user — returns the identical generic 401
        `INVALID_CREDENTIALS` (no account-status enumeration, FR-AUTH-002/003).
        On success sets the HttpOnly JWT cookie (`briefline-token`; `__Host-briefline-token`
        in production; HttpOnly, SameSite=Lax, Path=/, Max-Age=28800, Secure in production),
        rotates the CSRF binding, updates `lastLoginAt`, and returns a fresh CSRF token
        bound to the new session.
      operationId: login
      security:
        - csrfHeader: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/LoginRequest'
            example:
              email: admin@northstar.digital
              password: Briefline2026!
      responses:
        '200':
          description: Logged in; JWT cookie and rotated CSRF token set
          headers:
            Set-Cookie:
              description: 'Sets `briefline-token` (JWT, HttpOnly) and `csrf-token` (HMAC) cookies'
              schema:
                type: string
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/CsrfTokenResponse'
              example:
                data:
                  csrfToken: 4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f
        '400':
          $ref: '#/components/responses/BadRequest'
        '401':
          description: Invalid credentials or inactive user (generic, no enumeration)
          content:
            application/problem+json:
              schema:
                $ref: '#/components/schemas/ProblemDetails'
              example:
                type: https://briefline-crm.demo/errors/invalid-credentials
                title: Invalid credentials
                status: 401
                detail: The email or password is incorrect.
                instance: /api/v1/auth/login
                traceId: a1b2c3d4-e5f6-7890-abcd-ef1234567890
                code: INVALID_CREDENTIALS
        '403':
          description: Missing or invalid X-CSRF-Token, or Origin not allowed
          content:
            application/problem+json:
              schema:
                $ref: '#/components/schemas/ProblemDetails'
              example:
                type: https://briefline-crm.demo/errors/csrf-invalid
                title: CSRF token invalid
                status: 403
                detail: The security token is invalid or missing. Refresh the page and try again.
                instance: /api/v1/auth/login
                traceId: b2c3d4e5-f6a7-8901-bcde-f23456789012
                code: CSRF_INVALID
        '429':
          $ref: '#/components/responses/RateLimited'

  /auth/logout:
    post:
      tags: [auth]
      summary: Log out
      description: |
        Authenticated. Clears the JWT cookie and rotates the CSRF binding so the old
        session-bound HMAC is no longer reusable. Idempotent — safe to double-click.
        Local logout only; there is no server-side session store.
      operationId: logout
      security:
        - cookieAuth: []
          csrfHeader: []
      responses:
        '200':
          description: Logged out; cookies cleared
          headers:
            Set-Cookie:
              description: Clears `briefline-token` and rotates `csrf-token`
              schema:
                type: string
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/OkResponse'
              example:
                data:
                  ok: true
        '401':
          $ref: '#/components/responses/Unauthorized'
        '403':
          $ref: '#/components/responses/Forbidden'

  /auth/me:
    get:
      tags: [auth]
      summary: Get current user
      description: |
        Authenticated. Returns the current user resolved from the JWT cookie — the DB is
        re-read on every request and the user must still be ACTIVE (a deactivated user
        receives 401 even with a valid token). Never exposes passwordHash.
      operationId: getMe
      responses:
        '200':
          description: Current user
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/UserResponse'
              example:
                data:
                  id: 11111111-1111-4111-8111-111111111111
                  email: admin@northstar.digital
                  name: Alicia Martin
                  role: ADMIN
                  status: ACTIVE
                  lastLoginAt: '2026-08-11T07:42:18.000Z'
                  createdAt: '2026-01-05T09:00:00.000Z'
                  updatedAt: '2026-08-11T07:42:18.000Z'
        '401':
          $ref: '#/components/responses/Unauthorized'

  /users:
    get:
      tags: [users]
      summary: List users
      description: |
        Admin only (member → 403). Returns ACTIVE and INACTIVE users, never passwordHash.
        Flat filters: `q` (email/name, case-insensitive, max 100), `status`, `role`.
        Offset pagination.
      operationId: listUsers
      parameters:
        - $ref: '#/components/parameters/SearchParam'
        - $ref: '#/components/parameters/UserStatusFilterParam'
        - $ref: '#/components/parameters/UserRoleFilterParam'
        - $ref: '#/components/parameters/PageParam'
        - $ref: '#/components/parameters/LimitParam'
      responses:
        '200':
          description: Paginated user list
          content:
            application/json:
              schema:
                type: object
                required: [data, meta]
                properties:
                  data:
                    type: array
                    items:
                      $ref: '#/components/schemas/UserResponse'
                  meta:
                    $ref: '#/components/schemas/PaginationMeta'
              example:
                data:
                  - id: 11111111-1111-4111-8111-111111111111
                    email: admin@northstar.digital
                    name: Alicia Martin
                    role: ADMIN
                    status: ACTIVE
                    lastLoginAt: '2026-08-11T07:42:18.000Z'
                    createdAt: '2026-01-05T09:00:00.000Z'
                    updatedAt: '2026-08-11T07:42:18.000Z'
                  - id: 22222222-2222-4222-8222-222222222222
                    email: marco.ruiz@northstar.digital
                    name: Marco Ruiz
                    role: MEMBER
                    status: ACTIVE
                    lastLoginAt: '2026-08-10T16:20:03.000Z'
                    createdAt: '2026-01-05T09:00:00.000Z'
                    updatedAt: '2026-08-01T10:00:00.000Z'
                meta:
                  page: 1
                  limit: 25
                  total: 8
        '400':
          $ref: '#/components/responses/BadRequest'
        '401':
          $ref: '#/components/responses/Unauthorized'
        '403':
          $ref: '#/components/responses/Forbidden'

    post:
      tags: [users]
      summary: Create user
      description: |
        Admin only (member → 403). Creates a user with an initial password (Argon2id-hashed).
        Email is normalized (`trim().toLowerCase()`, ADR-002) and must be case-insensitively
        unique — duplicates → 409 `EMAIL_ALREADY_EXISTS`. May create ACTIVE or INACTIVE.
        No public registration.
      operationId: createUser
      security:
        - cookieAuth: []
          csrfHeader: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateUserRequest'
            example:
              name: Elena García
              email: elena.garcia@northstar.digital
              password: Briefline2026!
              role: MEMBER
      responses:
        '201':
          description: User created
          headers:
            Location:
              description: URL of the created user
              schema:
                type: string
                example: /api/v1/users/55555555-5555-4555-8555-555555555555
          content:
            application/json:
              schema:
                type: object
                required: [data]
                properties:
                  data:
                    $ref: '#/components/schemas/UserResponse'
              example:
                data:
                  id: 55555555-5555-4555-8555-555555555555
                  email: elena.garcia@northstar.digital
                  name: Elena García
                  role: MEMBER
                  status: ACTIVE
                  lastLoginAt: null
                  createdAt: '2026-08-11T09:15:00.000Z'
                  updatedAt: '2026-08-11T09:15:00.000Z'
        '400':
          $ref: '#/components/responses/BadRequest'
        '401':
          $ref: '#/components/responses/Unauthorized'
        '403':
          $ref: '#/components/responses/Forbidden'
        '409':
          description: Normalized email already in use (BR-002)
          content:
            application/problem+json:
              schema:
                $ref: '#/components/schemas/ProblemDetails'
              example:
                type: https://briefline-crm.demo/errors/email-already-exists
                title: Email already exists
                status: 409
                detail: An account with this email already exists.
                instance: /api/v1/users
                traceId: c3d4e5f6-a7b8-9012-cdef-345678901234
                code: EMAIL_ALREADY_EXISTS
                errors:
                  - field: email
                    message: An account with this email already exists.
                    code: EMAIL_ALREADY_EXISTS

  /users/{userId}:
    parameters:
      - $ref: '#/components/parameters/UserIdParam'
    get:
      tags: [users]
      summary: Get user by ID
      description: Admin only (member → 403). Returns the user with both statuses; unknown id → 404 `USER_NOT_FOUND`. Never exposes passwordHash.
      operationId: getUser
      responses:
        '200':
          description: User
          content:
            application/json:
              schema:
                type: object
                required: [data]
                properties:
                  data:
                    $ref: '#/components/schemas/UserResponse'
              example:
                data:
                  id: 22222222-2222-4222-8222-222222222222
                  email: marco.ruiz@northstar.digital
                  name: Marco Ruiz
                  role: MEMBER
                  status: ACTIVE
                  lastLoginAt: '2026-08-10T16:20:03.000Z'
                  createdAt: '2026-01-05T09:00:00.000Z'
                  updatedAt: '2026-08-01T10:00:00.000Z'
        '401':
          $ref: '#/components/responses/Unauthorized'
        '403':
          $ref: '#/components/responses/Forbidden'
        '404':
          description: User not found
          content:
            application/problem+json:
              schema:
                $ref: '#/components/schemas/ProblemDetails'
              example:
                type: https://briefline-crm.demo/errors/user-not-found
                title: User not found
                status: 404
                detail: The requested user does not exist.
                instance: /api/v1/users/99999999-9999-4999-8999-999999999999
                traceId: d4e5f6a7-b8c9-0123-def4-567890123456
                code: USER_NOT_FOUND
    patch:
      tags: [users]
      summary: Update user
      description: |
        Admin only (member → 403). Editable: `name`, `role`, `status` (FR-USR-003).
        Demoting or deactivating the last active ADMIN runs in a serializable transaction
        with bounded P2034 retry — violation → 409 `LAST_ADMIN` (BR-003); retries exhausted
        → 409 `CONCURRENT_MODIFICATION`. Re-activation is allowed (admin only). Relational
        history and authorship are preserved on status change.
      operationId: updateUser
      security:
        - cookieAuth: []
          csrfHeader: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/UpdateUserRequest'
            examples:
              deactivate:
                summary: Deactivate a member
                value:
                  status: INACTIVE
              changeRole:
                summary: Promote to administrator
                value:
                  role: ADMIN
      responses:
        '200':
          description: User updated
          content:
            application/json:
              schema:
                type: object
                required: [data]
                properties:
                  data:
                    $ref: '#/components/schemas/UserResponse'
              example:
                data:
                  id: 22222222-2222-4222-8222-222222222222
                  email: marco.ruiz@northstar.digital
                  name: Marco Ruiz
                  role: ADMIN
                  status: ACTIVE
                  lastLoginAt: '2026-08-10T16:20:03.000Z'
                  createdAt: '2026-01-05T09:00:00.000Z'
                  updatedAt: '2026-08-11T09:30:00.000Z'
        '400':
          $ref: '#/components/responses/BadRequest'
        '401':
          $ref: '#/components/responses/Unauthorized'
        '403':
          $ref: '#/components/responses/Forbidden'
        '404':
          description: User not found
          content:
            application/problem+json:
              schema:
                $ref: '#/components/schemas/ProblemDetails'
              example:
                type: https://briefline-crm.demo/errors/user-not-found
                title: User not found
                status: 404
                detail: The requested user does not exist.
                instance: /api/v1/users/99999999-9999-4999-8999-999999999999
                traceId: e5f6a7b8-c9d0-1234-ef56-789012345678
                code: USER_NOT_FOUND
        '409':
          description: Last active admin protection or concurrent modification
          content:
            application/problem+json:
              schema:
                $ref: '#/components/schemas/ProblemDetails'
              example:
                type: https://briefline-crm.demo/errors/last-admin
                title: Last administrator
                status: 409
                detail: At least one active administrator must remain.
                instance: /api/v1/users/11111111-1111-4111-8111-111111111111
                traceId: f6a7b8c9-d0e1-2345-f678-901234567890
                code: LAST_ADMIN

  /users/{userId}/deactivation-impact:
    parameters:
      - $ref: '#/components/parameters/UserIdParam'
    get:
      tags: [users]
      summary: Get deactivation impact
      description: |
        Admin only (member → 403). Returns the impact of deactivating the target user
        (FR-USR-005): counts of active tasks assigned to and created by the target, plus
        the list of assigned active tasks that would require reassignment. Call this before
        confirming deactivation so the UI can collect reassignment choices.
      operationId: getDeactivationImpact
      responses:
        '200':
          description: Deactivation impact
          content:
            application/json:
              schema:
                type: object
                required: [data]
                properties:
                  data:
                    $ref: '#/components/schemas/DeactivationImpact'
              example:
                data:
                  userId: 22222222-2222-4222-8222-222222222222
                  assignedCount: 3
                  createdCount: 5
                  requiresReassignment: true
                  assignedTasks:
                    - id: 44444444-4444-4444-8444-444444444444
                      title: Revamp landing page
                      status: IN_PROGRESS
                      priority: URGENT
                      assignee:
                        id: 22222222-2222-4222-8222-222222222222
                        name: Marco Ruiz
                      client:
                        id: 33333333-3333-4333-8333-333333333333
                        companyName: Bluebird Coffee Co.
                      dueDate: '2026-08-14'
                      version: 4
                      updatedAt: '2026-08-11T08:12:00.000Z'
                    - id: 66666666-6666-4666-8666-666666666666
                      title: Q3 email campaign
                      status: BLOCKED
                      priority: HIGH
                      assignee:
                        id: 22222222-2222-4222-8222-222222222222
                        name: Marco Ruiz
                      client:
                        id: 77777777-7777-4777-8777-777777777777
                        companyName: Vela Analytics
                      dueDate: '2026-08-31'
                      version: 2
                      updatedAt: '2026-08-09T11:00:00.000Z'
                    - id: 88888888-8888-4888-8888-888888888888
                      title: Migrate CMS
                      status: PENDING
                      priority: MEDIUM
                      assignee:
                        id: 22222222-2222-4222-8222-222222222222
                        name: Marco Ruiz
                      client: null
                      dueDate: '2026-09-15'
                      version: 1
                      updatedAt: '2026-08-05T14:30:00.000Z'
        '401':
          $ref: '#/components/responses/Unauthorized'
        '403':
          $ref: '#/components/responses/Forbidden'
        '404':
          description: User not found
          content:
            application/problem+json:
              schema:
                $ref: '#/components/schemas/ProblemDetails'
              example:
                type: https://briefline-crm.demo/errors/user-not-found
                title: User not found
                status: 404
                detail: The requested user does not exist.
                instance: /api/v1/users/99999999-9999-4999-8999-999999999999
                traceId: a7b8c9d0-e1f2-3456-7890-123456789012
                code: USER_NOT_FOUND

  /users/{userId}/deactivate:
    parameters:
      - $ref: '#/components/parameters/UserIdParam'
    post:
      tags: [users]
      summary: Deactivate user
      description: |
        Admin only (member → 403). Deactivates the target user and applies the provided
        reassignments in one transaction (USR-005). If the impact shows active tasks
        assigned to the target (`requiresReassignment: true`), `reassignments` is
        REQUIRED — otherwise → 422 `REASSIGNMENT_REQUIRED` with the impact list in
        extensions. Self-deactivation is allowed unless the actor is the last active
        admin (→ 409 `LAST_ADMIN`). After deactivation the target's next request is 401
        (session invalidated, AUTH-002) and the user can no longer receive assignments
        (BR-004). Already INACTIVE → 200 no-op. No physical delete.
      operationId: deactivateUser
      security:
        - cookieAuth: []
          csrfHeader: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/DeactivateUserRequest'
            examples:
              withReassignments:
                summary: Deactivate with reassignments
                value:
                  reassignments:
                    - taskId: 44444444-4444-4444-8444-444444444444
                      assigneeId: 11111111-1111-4111-8111-111111111111
                    - taskId: 66666666-6666-4666-8666-666666666666
                      assigneeId: 99999999-9999-4999-8999-999999999999
                    - taskId: 88888888-8888-4888-8888-888888888888
                      assigneeId: 99999999-9999-4999-8999-999999999999
              noWork:
                summary: Deactivate a user with no assigned active tasks
                value:
                  reassignments: []
      responses:
        '200':
          description: User deactivated; reassignments applied
          content:
            application/json:
              schema:
                type: object
                required: [data]
                properties:
                  data:
                    $ref: '#/components/schemas/DeactivationImpact'
              example:
                data:
                  userId: 22222222-2222-4222-8222-222222222222
                  assignedCount: 0
                  createdCount: 5
                  requiresReassignment: false
                  assignedTasks: []
        '400':
          $ref: '#/components/responses/BadRequest'
        '401':
          $ref: '#/components/responses/Unauthorized'
        '403':
          $ref: '#/components/responses/Forbidden'
        '404':
          description: User not found
          content:
            application/problem+json:
              schema:
                $ref: '#/components/schemas/ProblemDetails'
              example:
                type: https://briefline-crm.demo/errors/user-not-found
                title: User not found
                status: 404
                detail: The requested user does not exist.
                instance: /api/v1/users/99999999-9999-4999-8999-999999999999
                traceId: b8c9d0e1-f2a3-4567-8901-234567890123
                code: USER_NOT_FOUND
        '409':
          description: Last active admin protection or concurrent modification
          content:
            application/problem+json:
              schema:
                $ref: '#/components/schemas/ProblemDetails'
              example:
                type: https://briefline-crm.demo/errors/last-admin
                title: Last administrator
                status: 409
                detail: At least one active administrator must remain.
                instance: /api/v1/users/11111111-1111-4111-8111-111111111111
                traceId: c9d0e1f2-a3b4-5678-9012-345678901234
                code: LAST_ADMIN
        '422':
          description: Reassignment required before deactivation
          content:
            application/problem+json:
              schema:
                $ref: '#/components/schemas/ProblemDetails'
              example:
                type: https://briefline-crm.demo/errors/reassignment-required
                title: Reassignment required
                status: 422
                detail: Assign the user's active tasks to another active member before deactivating.
                instance: /api/v1/users/22222222-2222-4222-8222-222222222222/deactivate
                traceId: d0e1f2a3-b4c5-6789-0123-456789012345
                code: REASSIGNMENT_REQUIRED
                errors:
                  - field: reassignments
                    message: 3 active tasks are assigned to this user and require reassignment.
                    code: REASSIGNMENT_REQUIRED

  /profile:
    get:
      tags: [profile]
      summary: Get own profile
      description: Authenticated. Returns the current user (same shape as /auth/me). Never exposes passwordHash.
      operationId: getProfile
      responses:
        '200':
          description: Own profile
          content:
            application/json:
              schema:
                type: object
                required: [data]
                properties:
                  data:
                    $ref: '#/components/schemas/UserResponse'
              example:
                data:
                  id: 22222222-2222-4222-8222-222222222222
                  email: marco.ruiz@northstar.digital
                  name: Marco Ruiz
                  role: MEMBER
                  status: ACTIVE
                  lastLoginAt: '2026-08-10T16:20:03.000Z'
                  createdAt: '2026-01-05T09:00:00.000Z'
                  updatedAt: '2026-08-01T10:00:00.000Z'
        '401':
          $ref: '#/components/responses/Unauthorized'
    patch:
      tags: [profile]
      summary: Update own name
      description: |
        Authenticated. Only `name` is editable (PROF-001). Any other field (`role`,
        `status`, `email`) in the body is rejected with 400 (DTO allowlist — mass
        assignment guard, NFR-SEC-005).
      operationId: updateProfile
      security:
        - cookieAuth: []
          csrfHeader: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/UpdateProfileRequest'
            example:
              name: Marco Ruiz-Herrera
      responses:
        '200':
          description: Profile updated
          content:
            application/json:
              schema:
                type: object
                required: [data]
                properties:
                  data:
                    $ref: '#/components/schemas/UserResponse'
              example:
                data:
                  id: 22222222-2222-4222-8222-222222222222
                  email: marco.ruiz@northstar.digital
                  name: Marco Ruiz-Herrera
                  role: MEMBER
                  status: ACTIVE
                  lastLoginAt: '2026-08-10T16:20:03.000Z'
                  createdAt: '2026-01-05T09:00:00.000Z'
                  updatedAt: '2026-08-11T09:45:00.000Z'
        '400':
          $ref: '#/components/responses/BadRequest'
        '401':
          $ref: '#/components/responses/Unauthorized'

  /clients:
    get:
      tags: [clients]
      summary: List clients
      description: |
        Authenticated. Team-wide view (BR-005). Flat filters: `q` (company/contact,
        case-insensitive, max 100), `status`. ARCHIVED clients are excluded by default;
        members may never receive archived clients (the filter yields an empty page for
        members, no 403). Offset pagination.
      operationId: listClients
      parameters:
        - $ref: '#/components/parameters/SearchParam'
        - $ref: '#/components/parameters/ClientStatusFilterParam'
        - $ref: '#/components/parameters/PageParam'
        - $ref: '#/components/parameters/LimitParam'
      responses:
        '200':
          description: Paginated client list
          content:
            application/json:
              schema:
                type: object
                required: [data, meta]
                properties:
                  data:
                    type: array
                    items:
                      $ref: '#/components/schemas/ClientResponse'
                  meta:
                    $ref: '#/components/schemas/PaginationMeta'
              example:
                data:
                  - id: 33333333-3333-4333-8333-333333333333
                    companyName: Bluebird Coffee Co.
                    industry: Retail
                    primaryContactName: Sofia Lindqvist
                    primaryContactEmail: sofia@bluebirdcoffee.example
                    phone: +34 600 123 456
                    notes: Rebranding discussion scheduled for September.
                    status: ACTIVE
                    createdBy:
                      id: 11111111-1111-4111-8111-111111111111
                      name: Alicia Martin
                    createdAt: '2026-02-10T10:00:00.000Z'
                    updatedAt: '2026-08-02T09:00:00.000Z'
                  - id: 77777777-7777-4777-8777-777777777777
                    companyName: Vela Analytics
                    industry: SaaS
                    primaryContactName: Daniel Okafor
                    primaryContactEmail: daniel@vela.example
                    phone: null
                    notes: Enterprise plan; annual review in Q4.
                    status: ACTIVE
                    createdBy:
                      id: 11111111-1111-4111-8111-111111111111
                      name: Alicia Martin
                    createdAt: '2026-03-22T15:30:00.000Z'
                    updatedAt: '2026-07-18T12:00:00.000Z'
                meta:
                  page: 1
                  limit: 25
                  total: 12
        '400':
          $ref: '#/components/responses/BadRequest'
        '401':
          $ref: '#/components/responses/Unauthorized'
    post:
      tags: [clients]
      summary: Create client
      description: Any active user may create a client (BR-006, FR-CLI-003). The creator is recorded. Lengths and contact email are validated (400).
      operationId: createClient
      security:
        - cookieAuth: []
          csrfHeader: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateClientRequest'
            example:
              companyName: Casa Verde Bakery
              industry: Food & Beverage
              primaryContactName: Lucia Fernández
              primaryContactEmail: lucia@casaverde.example
              phone: +34 611 222 333
              notes: New client from the July referral program.
      responses:
        '201':
          description: Client created
          headers:
            Location:
              description: URL of the created client
              schema:
                type: string
                example: /api/v1/clients/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa
          content:
            application/json:
              schema:
                type: object
                required: [data]
                properties:
                  data:
                    $ref: '#/components/schemas/ClientResponse'
              example:
                data:
                  id: aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa
                  companyName: Casa Verde Bakery
                  industry: Food & Beverage
                  primaryContactName: Lucia Fernández
                  primaryContactEmail: lucia@casaverde.example
                  phone: +34 611 222 333
                  notes: New client from the July referral program.
                  status: ACTIVE
                  createdBy:
                    id: 22222222-2222-4222-8222-222222222222
                    name: Marco Ruiz
                  createdAt: '2026-08-11T10:00:00.000Z'
                  updatedAt: '2026-08-11T10:00:00.000Z'
        '400':
          $ref: '#/components/responses/BadRequest'
        '401':
          $ref: '#/components/responses/Unauthorized'

  /clients/{clientId}:
    parameters:
      - $ref: '#/components/parameters/ClientIdParam'
    get:
      tags: [clients]
      summary: Get client by ID
      description: |
        Authenticated. Team-wide view for non-archived clients (BR-005). An archived
        client is visible only to admins; a member requesting it receives 404 (BOLA-safe,
        indistinguishable from an unknown id). Includes a paginated related-task summary
        (no N+1, CLI-API-003).
      operationId: getClient
      parameters:
        - $ref: '#/components/parameters/PageParam'
        - $ref: '#/components/parameters/LimitParam'
      responses:
        '200':
          description: Client with related tasks
          content:
            application/json:
              schema:
                type: object
                required: [data]
                properties:
                  data:
                    $ref: '#/components/schemas/ClientWithTasksResponse'
              example:
                data:
                  client:
                    id: 33333333-3333-4333-8333-333333333333
                    companyName: Bluebird Coffee Co.
                    industry: Retail
                    primaryContactName: Sofia Lindqvist
                    primaryContactEmail: sofia@bluebirdcoffee.example
                    phone: +34 600 123 456
                    notes: Rebranding discussion scheduled for September.
                    status: ACTIVE
                    createdBy:
                      id: 11111111-1111-4111-8111-111111111111
                      name: Alicia Martin
                    createdAt: '2026-02-10T10:00:00.000Z'
                    updatedAt: '2026-08-02T09:00:00.000Z'
                  relatedTasks:
                    data:
                      - id: 44444444-4444-4444-8444-444444444444
                        title: Revamp landing page
                        status: IN_PROGRESS
                        priority: URGENT
                        assignee:
                          id: 22222222-2222-4222-8222-222222222222
                          name: Marco Ruiz
                        client:
                          id: 33333333-3333-4333-8333-333333333333
                          companyName: Bluebird Coffee Co.
                        dueDate: '2026-08-14'
                        version: 4
                        updatedAt: '2026-08-11T08:12:00.000Z'
                    meta:
                      page: 1
                      limit: 25
                      total: 2
        '401':
          $ref: '#/components/responses/Unauthorized'
        '404':
          description: Client not found or not visible to the caller
          content:
            application/problem+json:
              schema:
                $ref: '#/components/schemas/ProblemDetails'
              example:
                type: https://briefline-crm.demo/errors/client-not-found
                title: Client not found
                status: 404
                detail: The requested client does not exist or is not visible to you.
                instance: /api/v1/clients/99999999-9999-4999-8999-999999999999
                traceId: e1f2a3b4-c5d6-7890-1234-567890123456
                code: CLIENT_NOT_FOUND
    patch:
      tags: [clients]
      summary: Update client
      description: |
        Admin only (member → 403, BR-006). Editable: `companyName`, `industry`,
        `primaryContactName`, `primaryContactEmail`, `phone`, `notes` (field-level DTO
        allowlist, CLI-API-004). Writing to an ARCHIVED client → 409 `CLIENT_ARCHIVED`.
      operationId: updateClient
      security:
        - cookieAuth: []
          csrfHeader: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/UpdateClientRequest'
            example:
              notes: Rebranding confirmed — kickoff moved to September 1.
      responses:
        '200':
          description: Client updated
          content:
            application/json:
              schema:
                type: object
                required: [data]
                properties:
                  data:
                    $ref: '#/components/schemas/ClientResponse'
              example:
                data:
                  id: 33333333-3333-4333-8333-333333333333
                  companyName: Bluebird Coffee Co.
                  industry: Retail
                  primaryContactName: Sofia Lindqvist
                  primaryContactEmail: sofia@bluebirdcoffee.example
                  phone: +34 600 123 456
                  notes: Rebranding confirmed — kickoff moved to September 1.
                  status: ACTIVE
                  createdBy:
                    id: 11111111-1111-4111-8111-111111111111
                    name: Alicia Martin
                  createdAt: '2026-02-10T10:00:00.000Z'
                  updatedAt: '2026-08-11T10:15:00.000Z'
        '400':
          $ref: '#/components/responses/BadRequest'
        '401':
          $ref: '#/components/responses/Unauthorized'
        '403':
          $ref: '#/components/responses/Forbidden'
        '404':
          description: Client not found or not visible to the caller
          content:
            application/problem+json:
              schema:
                $ref: '#/components/schemas/ProblemDetails'
              example:
                type: https://briefline-crm.demo/errors/client-not-found
                title: Client not found
                status: 404
                detail: The requested client does not exist or is not visible to you.
                instance: /api/v1/clients/99999999-9999-4999-8999-999999999999
                traceId: f2a3b4c5-d6e7-8901-2345-678901234567
                code: CLIENT_NOT_FOUND
        '409':
          description: Client is archived (immutable)
          content:
            application/problem+json:
              schema:
                $ref: '#/components/schemas/ProblemDetails'
              example:
                type: https://briefline-crm.demo/errors/client-archived
                title: Client archived
                status: 409
                detail: This client is archived and can no longer be modified.
                instance: /api/v1/clients/33333333-3333-4333-8333-333333333333
                traceId: a3b4c5d6-e7f8-9012-3456-789012345678
                code: CLIENT_ARCHIVED

  /clients/{clientId}/deactivate:
    parameters:
      - $ref: '#/components/parameters/ClientIdParam'
    post:
      tags: [clients]
      summary: Deactivate client
      description: |
        Admin only (member → 403, BR-006). ACTIVE → INACTIVE. Already INACTIVE → 200 no-op.
        ARCHIVED → 409 `CLIENT_ARCHIVED`. Relationships are retained; there is no physical
        delete (CLI-API-005).
      operationId: deactivateClient
      security:
        - cookieAuth: []
          csrfHeader: []
      responses:
        '200':
          description: Client deactivated (or already inactive)
          content:
            application/json:
              schema:
                type: object
                required: [data]
                properties:
                  data:
                    $ref: '#/components/schemas/ClientResponse'
              example:
                data:
                  id: 77777777-7777-4777-8777-777777777777
                  companyName: Vela Analytics
                  industry: SaaS
                  primaryContactName: Daniel Okafor
                  primaryContactEmail: daniel@vela.example
                  phone: null
                  notes: Enterprise plan; annual review in Q4.
                  status: INACTIVE
                  createdBy:
                    id: 11111111-1111-4111-8111-111111111111
                    name: Alicia Martin
                  createdAt: '2026-03-22T15:30:00.000Z'
                  updatedAt: '2026-08-11T10:30:00.000Z'
        '401':
          $ref: '#/components/responses/Unauthorized'
        '403':
          $ref: '#/components/responses/Forbidden'
        '404':
          description: Client not found or not visible to the caller
          content:
            application/problem+json:
              schema:
                $ref: '#/components/schemas/ProblemDetails'
              example:
                type: https://briefline-crm.demo/errors/client-not-found
                title: Client not found
                status: 404
                detail: The requested client does not exist or is not visible to you.
                instance: /api/v1/clients/99999999-9999-4999-8999-999999999999
                traceId: b4c5d6e7-f8a9-0123-4567-890123456789
                code: CLIENT_NOT_FOUND
        '409':
          description: Client is archived (immutable)
          content:
            application/problem+json:
              schema:
                $ref: '#/components/schemas/ProblemDetails'
              example:
                type: https://briefline-crm.demo/errors/client-archived
                title: Client archived
                status: 409
                detail: This client is archived and can no longer be modified.
                instance: /api/v1/clients/33333333-3333-4333-8333-333333333333
                traceId: c5d6e7f8-a9b0-1234-5678-901234567890
                code: CLIENT_ARCHIVED

  /clients/{clientId}/archive:
    parameters:
      - $ref: '#/components/parameters/ClientIdParam'
    post:
      tags: [clients]
      summary: Archive client
      description: |
        Admin only (member → 403, BR-006). ACTIVE/INACTIVE → ARCHIVED. Already ARCHIVED
        → 409 `CLIENT_ARCHIVED`. After archiving, new task associations to this client are
        rejected with 422 `CANNOT_ASSIGN_ARCHIVED_CLIENT` (FR-CLI-006); existing task
        links remain intact. No un-archive route exists.
      operationId: archiveClient
      security:
        - cookieAuth: []
          csrfHeader: []
      responses:
        '200':
          description: Client archived
          content:
            application/json:
              schema:
                type: object
                required: [data]
                properties:
                  data:
                    $ref: '#/components/schemas/ClientResponse'
              example:
                data:
                  id: 33333333-3333-4333-8333-333333333333
                  companyName: Bluebird Coffee Co.
                  industry: Retail
                  primaryContactName: Sofia Lindqvist
                  primaryContactEmail: sofia@bluebirdcoffee.example
                  phone: +34 600 123 456
                  notes: Rebranding confirmed — kickoff moved to September 1.
                  status: ARCHIVED
                  createdBy:
                    id: 11111111-1111-4111-8111-111111111111
                    name: Alicia Martin
                  createdAt: '2026-02-10T10:00:00.000Z'
                  updatedAt: '2026-08-11T10:45:00.000Z'
        '401':
          $ref: '#/components/responses/Unauthorized'
        '403':
          $ref: '#/components/responses/Forbidden'
        '404':
          description: Client not found or not visible to the caller
          content:
            application/problem+json:
              schema:
                $ref: '#/components/schemas/ProblemDetails'
              example:
                type: https://briefline-crm.demo/errors/client-not-found
                title: Client not found
                status: 404
                detail: The requested client does not exist or is not visible to you.
                instance: /api/v1/clients/99999999-9999-4999-8999-999999999999
                traceId: d6e7f8a9-b0c1-2345-6789-012345678901
                code: CLIENT_NOT_FOUND
        '409':
          description: Client is already archived (no state change)
          content:
            application/problem+json:
              schema:
                $ref: '#/components/schemas/ProblemDetails'
              example:
                type: https://briefline-crm.demo/errors/client-archived
                title: Client archived
                status: 409
                detail: This client is already archived.
                instance: /api/v1/clients/33333333-3333-4333-8333-333333333333
                traceId: e7f8a9b0-c1d2-3456-7890-123456789012
                code: CLIENT_ARCHIVED

  /tasks/board:
    get:
      tags: [tasks]
      summary: Get task board
      description: |
        Authenticated. Returns the separate backlog plus the four active columns
        (PENDING, IN_PROGRESS, BLOCKED, COMPLETED). Archived tasks are excluded (BR-016).
        Flat filters combine with AND: `status` (single column), `priority`,
        `assigneeId`, `clientId`, `dueBefore`, `dueAfter`, `q` (title/description, max 100).
        Contractual sort within each group: priority desc (URGENT→LOW), due date asc
        (nulls last), updatedAt desc — deterministic server-side; there is no manual card
        order (DEC-035). Response is bounded by a server-enforced data cap.
      operationId: getBoard
      parameters:
        - $ref: '#/components/parameters/TaskStatusFilterParam'
        - $ref: '#/components/parameters/TaskPriorityFilterParam'
        - $ref: '#/components/parameters/AssigneeIdParam'
        - $ref: '#/components/parameters/ClientIdFilterParam'
        - $ref: '#/components/parameters/DueBeforeParam'
        - $ref: '#/components/parameters/DueAfterParam'
        - $ref: '#/components/parameters/SearchParam'
      responses:
        '200':
          description: Board with backlog and active columns
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/BoardResponse'
              example:
                data:
                  backlog:
                    - id: 88888888-8888-4888-8888-888888888888
                      title: Migrate CMS
                      status: BACKLOG
                      priority: MEDIUM
                      assignee: null
                      client: null
                      dueDate: '2026-09-15'
                      version: 1
                      updatedAt: '2026-08-05T14:30:00.000Z'
                    - id: 12121212-1212-4121-8121-121212121212
                      title: Content calendar Q4
                      status: BACKLOG
                      priority: LOW
                      assignee: null
                      client:
                        id: 77777777-7777-4777-8777-777777777777
                        companyName: Vela Analytics
                      dueDate: null
                      version: 1
                      updatedAt: '2026-07-30T09:00:00.000Z'
                  columns:
                    PENDING:
                      - id: 13131313-1313-4131-8131-131313131313
                        title: Design system audit
                        status: PENDING
                        priority: HIGH
                        assignee:
                          id: 99999999-9999-4999-8999-999999999999
                          name: Ana Reyes
                        client:
                          id: 33333333-3333-4333-8333-333333333333
                          companyName: Bluebird Coffee Co.
                        dueDate: '2026-08-20'
                        version: 2
                        updatedAt: '2026-08-08T10:00:00.000Z'
                    IN_PROGRESS:
                      - id: 44444444-4444-4444-8444-444444444444
                        title: Revamp landing page
                        status: IN_PROGRESS
                        priority: URGENT
                        assignee:
                          id: 22222222-2222-4222-8222-222222222222
                          name: Marco Ruiz
                        client:
                          id: 33333333-3333-4333-8333-333333333333
                          companyName: Bluebird Coffee Co.
                        dueDate: '2026-08-14'
                        version: 4
                        updatedAt: '2026-08-11T08:12:00.000Z'
                      - id: 14141414-1414-4141-8141-141414141414
                        title: Accessibility pass on checkout
                        status: IN_PROGRESS
                        priority: HIGH
                        assignee:
                          id: 11111111-1111-4111-8111-111111111111
                          name: Alicia Martin
                        client: null
                        dueDate: null
                        version: 3
                        updatedAt: '2026-08-10T16:00:00.000Z'
                    BLOCKED:
                      - id: 66666666-6666-4666-8666-666666666666
                        title: Q3 email campaign
                        status: BLOCKED
                        priority: HIGH
                        assignee:
                          id: 22222222-2222-4222-8222-222222222222
                          name: Marco Ruiz
                        client:
                          id: 77777777-7777-4777-8777-777777777777
                          companyName: Vela Analytics
                        dueDate: '2026-08-31'
                        version: 2
                        updatedAt: '2026-08-09T11:00:00.000Z'
                    COMPLETED:
                      - id: 15151515-1515-4151-8151-151515151515
                        title: Fix checkout bug
                        status: COMPLETED
                        priority: URGENT
                        assignee:
                          id: 11111111-1111-4111-8111-111111111111
                          name: Alicia Martin
                        client:
                          id: 77777777-7777-4777-8777-777777777777
                          companyName: Vela Analytics
                        dueDate: '2026-08-01'
                        version: 5
                        updatedAt: '2026-08-01T17:45:00.000Z'
                meta:
                  total: 7
        '400':
          $ref: '#/components/responses/BadRequest'
        '401':
          $ref: '#/components/responses/Unauthorized'

  /tasks/archived:
    get:
      tags: [tasks]
      summary: List archived tasks
      description: |
        Admin only (member → 403, BR-015/016, FR-TASK-011). Separate paginated view of
        ARCHIVED tasks; archived tasks are immutable and excluded from all active views.
      operationId: listArchivedTasks
      parameters:
        - $ref: '#/components/parameters/SearchParam'
        - $ref: '#/components/parameters/PageParam'
        - $ref: '#/components/parameters/LimitParam'
      responses:
        '200':
          description: Paginated archived task list
          content:
            application/json:
              schema:
                type: object
                required: [data, meta]
                properties:
                  data:
                    type: array
                    items:
                      $ref: '#/components/schemas/TaskResponse'
                  meta:
                    $ref: '#/components/schemas/PaginationMeta'
              example:
                data:
                  - id: 16161616-1616-4161-8161-161616161616
                    title: Newsletter June
                    description: June issue layout and send.
                    status: COMPLETED
                    priority: MEDIUM
                    assignee:
                      id: 11111111-1111-4111-8111-111111111111
                      name: Alicia Martin
                    client:
                      id: 77777777-7777-4777-8777-777777777777
                      companyName: Vela Analytics
                    dueDate: '2026-06-28'
                    blockedReason: null
                    creator:
                      id: 11111111-1111-4111-8111-111111111111
                      name: Alicia Martin
                    version: 6
                    archivedAt: '2026-07-02T08:00:00.000Z'
                    archivedBy:
                      id: 11111111-1111-4111-8111-111111111111
                      name: Alicia Martin
                    createdAt: '2026-06-01T09:00:00.000Z'
                    updatedAt: '2026-07-02T08:00:00.000Z'
                meta:
                  page: 1
                  limit: 25
                  total: 4
        '400':
          $ref: '#/components/responses/BadRequest'
        '401':
          $ref: '#/components/responses/Unauthorized'
        '403':
          $ref: '#/components/responses/Forbidden'

  /tasks:
    post:
      tags: [tasks]
      summary: Create task
      description: |
        Authenticated (creator = actor, stored). Backlog tasks may be unassigned (BR-008);
        creating an active task without an assignee → 422 `ASSIGNEE_REQUIRED` (BR-009);
        inactive assignee → 422 `INACTIVE_ASSIGNEE` (BR-004); blocked without reason →
        422 `BLOCKED_REASON_REQUIRED` (BR-010); archived client association →
        422 `CANNOT_ASSIGN_ARCHIVED_CLIENT` (FR-CLI-006). Task create and its CREATED
        history event are atomic (BR-017/018). Version starts at 1.
      operationId: createTask
      security:
        - cookieAuth: []
          csrfHeader: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateTaskRequest'
            examples:
              backlogTask:
                summary: Backlog task, unassigned
                value:
                  title: Set up analytics dashboards
                  description: Configure GA4 + Looker Studio reporting for Q4.
                  status: BACKLOG
                  priority: MEDIUM
                  assigneeId: null
                  clientId: 77777777-7777-4777-8777-777777777777
                  dueDate: '2026-09-30'
              activeTask:
                summary: Active task with assignee
                value:
                  title: Implement contact form
                  description: Add accessible contact form to the marketing site.
                  status: IN_PROGRESS
                  priority: HIGH
                  assigneeId: 99999999-9999-4999-8999-999999999999
                  clientId: 33333333-3333-4333-8333-333333333333
                  dueDate: '2026-08-21'
              blockedTask:
                summary: Blocked task with reason
                value:
                  title: Draft brand guidelines
                  description: Initial visual guidelines for the rebrand.
                  status: BLOCKED
                  priority: HIGH
                  assigneeId: 11111111-1111-4111-8111-111111111111
                  clientId: 33333333-3333-4333-8333-333333333333
                  blockedReason: Awaiting final logo from the client.
                  dueDate: null
      responses:
        '201':
          description: Task created with history event
          headers:
            Location:
              description: URL of the created task
              schema:
                type: string
                example: /api/v1/tasks/17171717-1717-4171-8171-171717171717
          content:
            application/json:
              schema:
                type: object
                required: [data]
                properties:
                  data:
                    $ref: '#/components/schemas/TaskResponse'
              example:
                data:
                  id: 17171717-1717-4171-8171-171717171717
                  title: Set up analytics dashboards
                  description: Configure GA4 + Looker Studio reporting for Q4.
                  status: BACKLOG
                  priority: MEDIUM
                  assignee: null
                  client:
                    id: 77777777-7777-4777-8777-777777777777
                    companyName: Vela Analytics
                  dueDate: '2026-09-30'
                  blockedReason: null
                  creator:
                    id: 11111111-1111-4111-8111-111111111111
                    name: Alicia Martin
                  version: 1
                  archivedAt: null
                  archivedBy: null
                  createdAt: '2026-08-11T11:00:00.000Z'
                  updatedAt: '2026-08-11T11:00:00.000Z'
        '400':
          $ref: '#/components/responses/BadRequest'
        '401':
          $ref: '#/components/responses/Unauthorized'
        '404':
          description: Assignee or client reference not found
          content:
            application/problem+json:
              schema:
                $ref: '#/components/schemas/ProblemDetails'
              example:
                type: https://briefline-crm.demo/errors/user-not-found
                title: Assignee not found
                status: 404
                detail: The requested assignee does not exist.
                instance: /api/v1/tasks
                traceId: f8a9b0c1-d2e3-4567-8901-234567890123
                code: USER_NOT_FOUND
        '422':
          description: Business rule violation (BR-004/008/009/010, FR-CLI-006)
          content:
            application/problem+json:
              schema:
                $ref: '#/components/schemas/ProblemDetails'
              example:
                type: https://briefline-crm.demo/errors/assignee-required
                title: Assignee required
                status: 422
                detail: Tasks outside the backlog must have an active assignee.
                instance: /api/v1/tasks
                traceId: a9b0c1d2-e3f4-5678-9012-345678901234
                code: ASSIGNEE_REQUIRED
                errors:
                  - field: assigneeId
                    message: Tasks outside the backlog must have an active assignee.
                    code: ASSIGNEE_REQUIRED

  /tasks/{taskId}:
    parameters:
      - $ref: '#/components/parameters/TaskIdParam'
    get:
      tags: [tasks]
      summary: Get task by ID
      description: |
        Authenticated. Team-wide view for active tasks. An archived task is visible only
        to admins; a member requesting it receives 404 (BOLA-safe, BR-016). Use
        `GET /tasks/{taskId}/history` for the append-only timeline.
      operationId: getTask
      responses:
        '200':
          description: Task
          content:
            application/json:
              schema:
                type: object
                required: [data]
                properties:
                  data:
                    $ref: '#/components/schemas/TaskResponse'
              example:
                data:
                  id: 44444444-4444-4444-8444-444444444444
                  title: Revamp landing page
                  description: Redesign homepage, improve CTA hierarchy, ship with the new brand.
                  status: IN_PROGRESS
                  priority: URGENT
                  assignee:
                    id: 22222222-2222-4222-8222-222222222222
                    name: Marco Ruiz
                  client:
                    id: 33333333-3333-4333-8333-333333333333
                    companyName: Bluebird Coffee Co.
                  dueDate: '2026-08-14'
                  blockedReason: null
                  creator:
                    id: 11111111-1111-4111-8111-111111111111
                    name: Alicia Martin
                  version: 4
                  archivedAt: null
                  archivedBy: null
                  createdAt: '2026-08-02T09:30:00.000Z'
                  updatedAt: '2026-08-11T08:12:00.000Z'
        '401':
          $ref: '#/components/responses/Unauthorized'
        '404':
          description: Task not found or not visible to the caller
          content:
            application/problem+json:
              schema:
                $ref: '#/components/schemas/ProblemDetails'
              example:
                type: https://briefline-crm.demo/errors/task-not-found
                title: Task not found
                status: 404
                detail: The requested task does not exist or is not visible to you.
                instance: /api/v1/tasks/99999999-9999-4999-8999-999999999999
                traceId: b0c1d2e3-f4a5-6789-0123-456789012345
                code: TASK_NOT_FOUND
    patch:
      tags: [tasks]
      summary: Update task
      description: |
        Authenticated. Field-level allowlist (TASK-API-003): `title`, `description`,
        `priority`, `assigneeId`, `clientId`, `dueDate`, `blockedReason`.
        Authorization: admins may edit any task (BR-014); members may edit tasks they
        created or are assigned to (BR-013) — otherwise 403 (FLOW-003).
        `expectedVersion` is REQUIRED; a stale value → 409 `STALE_VERSION` with
        `currentVersion` and a safe `currentState` (ADR-004). `assigneeId: null`
        unassigns (only allowed in backlog, else 422 `ASSIGNEE_REQUIRED`, BR-009).
        `dueDate: null` clears the deadline. `blockedReason` is only accepted while
        status is BLOCKED; leaving BLOCKED clears the active reason while the old value
        remains in history (BR-011). A failed mutation changes neither Task nor
        TaskChange (TASK-API-013).
      operationId: updateTask
      security:
        - cookieAuth: []
          csrfHeader: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/UpdateTaskRequest'
            example:
              title: Revamp landing page and hero
              priority: URGENT
              dueDate: '2026-08-16'
              expectedVersion: 4
      responses:
        '200':
          description: Task updated (version incremented, history event written)
          content:
            application/json:
              schema:
                type: object
                required: [data]
                properties:
                  data:
                    $ref: '#/components/schemas/TaskResponse'
              example:
                data:
                  id: 44444444-4444-4444-8444-444444444444
                  title: Revamp landing page and hero
                  description: Redesign homepage, improve CTA hierarchy, ship with the new brand.
                  status: IN_PROGRESS
                  priority: URGENT
                  assignee:
                    id: 22222222-2222-4222-8222-222222222222
                    name: Marco Ruiz
                  client:
                    id: 33333333-3333-4333-8333-333333333333
                    companyName: Bluebird Coffee Co.
                  dueDate: '2026-08-16'
                  blockedReason: null
                  creator:
                    id: 11111111-1111-4111-8111-111111111111
                    name: Alicia Martin
                  version: 5
                  archivedAt: null
                  archivedBy: null
                  createdAt: '2026-08-02T09:30:00.000Z'
                  updatedAt: '2026-08-11T11:20:00.000Z'
        '400':
          $ref: '#/components/responses/BadRequest'
        '401':
          $ref: '#/components/responses/Unauthorized'
        '403':
          description: Member is neither creator nor assignee (BR-013)
          content:
            application/problem+json:
              schema:
                $ref: '#/components/schemas/ProblemDetails'
              example:
                type: https://briefline-crm.demo/errors/forbidden
                title: Forbidden
                status: 403
                detail: You do not have permission to modify this task.
                instance: /api/v1/tasks/44444444-4444-4444-8444-444444444444
                traceId: c1d2e3f4-a5b6-7890-1234-567890123456
                code: FORBIDDEN
        '404':
          description: Task not found, or archived task requested by a member
          content:
            application/problem+json:
              schema:
                $ref: '#/components/schemas/ProblemDetails'
              example:
                type: https://briefline-crm.demo/errors/task-not-found
                title: Task not found
                status: 404
                detail: The requested task does not exist or is not visible to you.
                instance: /api/v1/tasks/99999999-9999-4999-8999-999999999999
                traceId: d2e3f4a5-b6c7-8901-2345-678901234567
                code: TASK_NOT_FOUND
        '409':
          description: Stale expectedVersion or archived task
          content:
            application/problem+json:
              schema:
                $ref: '#/components/schemas/ProblemDetails'
              example:
                type: https://briefline-crm.demo/errors/stale-version
                title: Stale version
                status: 409
                detail: This task was modified by someone else. Review the current state and retry.
                instance: /api/v1/tasks/44444444-4444-4444-8444-444444444444
                traceId: e3f4a5b6-c7d8-9012-3456-789012345678
                code: STALE_VERSION
                currentVersion: 5
                currentState:
                  title: Revamp landing page and hero
                  description: Redesign homepage, improve CTA hierarchy, ship with the new brand.
                  status: IN_PROGRESS
                  priority: URGENT
                  assigneeId: 22222222-2222-4222-8222-222222222222
                  clientId: 33333333-3333-4333-8333-333333333333
                  dueDate: '2026-08-16'
                  blockedReason: null
        '422':
          description: Business rule violation (BR-004/009/010, FR-CLI-006)
          content:
            application/problem+json:
              schema:
                $ref: '#/components/schemas/ProblemDetails'
              example:
                type: https://briefline-crm.demo/errors/cannot-assign-archived-client
                title: Archived client
                status: 422
                detail: Archived clients cannot receive new task associations.
                instance: /api/v1/tasks/44444444-4444-4444-8444-444444444444
                traceId: f4a5b6c7-d8e9-0123-4567-890123456789
                code: CANNOT_ASSIGN_ARCHIVED_CLIENT
                errors:
                  - field: clientId
                    message: Archived clients cannot receive new task associations.
                    code: CANNOT_ASSIGN_ARCHIVED_CLIENT

  /tasks/{taskId}/status:
    parameters:
      - $ref: '#/components/parameters/TaskIdParam'
    patch:
      tags: [tasks]
      summary: Change task status
      description: |
        Authenticated. Free transitions between all statuses (DEC-024), including
        reopening COMPLETED tasks (BR-012). Authorization per BR-013/014 (same as update).
        `expectedVersion` is REQUIRED (stale → 409 `STALE_VERSION`).
        Entering BLOCKED requires a non-empty `blockedReason` → 422 `BLOCKED_REASON_REQUIRED`
        (BR-010). Transitioning to an active status requires an active assignee → 422
        `ASSIGNEE_REQUIRED` (BR-009). Leaving BLOCKED clears the active reason but keeps it
        in history (BR-011). Drag-and-drop in the UI maps to this endpoint (status change
        only, inter-column).
      operationId: changeTaskStatus
      security:
        - cookieAuth: []
          csrfHeader: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/ChangeTaskStatusRequest'
            examples:
              block:
                summary: Block a task with a reason
                value:
                  status: BLOCKED
                  blockedReason: Waiting for client feedback on the mockups.
                  expectedVersion: 5
              reopen:
                summary: Reopen a completed task
                value:
                  status: IN_PROGRESS
                  expectedVersion: 6
      responses:
        '200':
          description: Status changed (version incremented, status history event written)
          content:
            application/json:
              schema:
                type: object
                required: [data]
                properties:
                  data:
                    $ref: '#/components/schemas/TaskResponse'
              example:
                data:
                  id: 44444444-4444-4444-8444-444444444444
                  title: Revamp landing page and hero
                  description: Redesign homepage, improve CTA hierarchy, ship with the new brand.
                  status: BLOCKED
                  priority: URGENT
                  assignee:
                    id: 22222222-2222-4222-8222-222222222222
                    name: Marco Ruiz
                  client:
                    id: 33333333-3333-4333-8333-333333333333
                    companyName: Bluebird Coffee Co.
                  dueDate: '2026-08-16'
                  blockedReason: Waiting for client feedback on the mockups.
                  creator:
                    id: 11111111-1111-4111-8111-111111111111
                    name: Alicia Martin
                  version: 6
                  archivedAt: null
                  archivedBy: null
                  createdAt: '2026-08-02T09:30:00.000Z'
                  updatedAt: '2026-08-11T11:30:00.000Z'
        '400':
          $ref: '#/components/responses/BadRequest'
        '401':
          $ref: '#/components/responses/Unauthorized'
        '403':
          description: Member is neither creator nor assignee (BR-013)
          content:
            application/problem+json:
              schema:
                $ref: '#/components/schemas/ProblemDetails'
              example:
                type: https://briefline-crm.demo/errors/forbidden
                title: Forbidden
                status: 403
                detail: You do not have permission to modify this task.
                instance: /api/v1/tasks/44444444-4444-4444-8444-444444444444
                traceId: a5b6c7d8-e9f0-1234-5678-901234567890
                code: FORBIDDEN
        '404':
          description: Task not found, or archived task requested by a member
          content:
            application/problem+json:
              schema:
                $ref: '#/components/schemas/ProblemDetails'
              example:
                type: https://briefline-crm.demo/errors/task-not-found
                title: Task not found
                status: 404
                detail: The requested task does not exist or is not visible to you.
                instance: /api/v1/tasks/99999999-9999-4999-8999-999999999999
                traceId: b6c7d8e9-f0a1-2345-6789-012345678901
                code: TASK_NOT_FOUND
        '409':
          description: Stale expectedVersion or archived task
          content:
            application/problem+json:
              schema:
                $ref: '#/components/schemas/ProblemDetails'
              example:
                type: https://briefline-crm.demo/errors/stale-version
                title: Stale version
                status: 409
                detail: This task was modified by someone else. Review the current state and retry.
                instance: /api/v1/tasks/44444444-4444-4444-8444-444444444444
                traceId: c7d8e9f0-a1b2-3456-7890-123456789012
                code: STALE_VERSION
                currentVersion: 6
                currentState:
                  title: Revamp landing page and hero
                  status: BLOCKED
                  priority: URGENT
                  assigneeId: 22222222-2222-4222-8222-222222222222
                  clientId: 33333333-3333-4333-8333-333333333333
                  dueDate: '2026-08-16'
                  blockedReason: Waiting for client feedback on the mockups.
        '422':
          description: Business rule violation (BR-009/010)
          content:
            application/problem+json:
              schema:
                $ref: '#/components/schemas/ProblemDetails'
              example:
                type: https://briefline-crm.demo/errors/blocked-reason-required
                title: Blocked reason required
                status: 422
                detail: A blocked task requires a non-empty reason.
                instance: /api/v1/tasks/44444444-4444-4444-8444-444444444444
                traceId: d8e9f0a1-b2c3-4567-8901-234567890123
                code: BLOCKED_REASON_REQUIRED
                errors:
                  - field: blockedReason
                    message: A blocked task requires a non-empty reason.
                    code: BLOCKED_REASON_REQUIRED

  /tasks/{taskId}/archive:
    parameters:
      - $ref: '#/components/parameters/TaskIdParam'
    post:
      tags: [tasks]
      summary: Archive task
      description: |
        Admin only (member → 403, BR-015, FR-TASK-010). Records `archivedAt`/`archivedBy`
        and writes an ARCHIVED history event. Already archived → 409 `TASK_ARCHIVED`
        (defined idempotency: no state change, no second event, TASK-API-006). Archived
        tasks are immutable (BR-016); there is no un-archive route.
      operationId: archiveTask
      security:
        - cookieAuth: []
          csrfHeader: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/ArchiveTaskRequest'
            example:
              expectedVersion: 6
      responses:
        '200':
          description: Task archived
          content:
            application/json:
              schema:
                type: object
                required: [data]
                properties:
                  data:
                    $ref: '#/components/schemas/TaskResponse'
              example:
                data:
                  id: 44444444-4444-4444-8444-444444444444
                  title: Revamp landing page and hero
                  description: Redesign homepage, improve CTA hierarchy, ship with the new brand.
                  status: IN_PROGRESS
                  priority: URGENT
                  assignee:
                    id: 22222222-2222-4222-8222-222222222222
                    name: Marco Ruiz
                  client:
                    id: 33333333-3333-4333-8333-333333333333
                    companyName: Bluebird Coffee Co.
                  dueDate: '2026-08-16'
                  blockedReason: null
                  creator:
                    id: 11111111-1111-4111-8111-111111111111
                    name: Alicia Martin
                  version: 7
                  archivedAt: '2026-08-11T11:45:00.000Z'
                  archivedBy:
                    id: 11111111-1111-4111-8111-111111111111
                    name: Alicia Martin
                  createdAt: '2026-08-02T09:30:00.000Z'
                  updatedAt: '2026-08-11T11:45:00.000Z'
        '400':
          $ref: '#/components/responses/BadRequest'
        '401':
          $ref: '#/components/responses/Unauthorized'
        '403':
          $ref: '#/components/responses/Forbidden'
        '404':
          description: Task not found, or archived task requested by a member
          content:
            application/problem+json:
              schema:
                $ref: '#/components/schemas/ProblemDetails'
              example:
                type: https://briefline-crm.demo/errors/task-not-found
                title: Task not found
                status: 404
                detail: The requested task does not exist or is not visible to you.
                instance: /api/v1/tasks/99999999-9999-4999-8999-999999999999
                traceId: e9f0a1b2-c3d4-5678-9012-345678901234
                code: TASK_NOT_FOUND
        '409':
          description: Stale expectedVersion or task already archived
          content:
            application/problem+json:
              schema:
                $ref: '#/components/schemas/ProblemDetails'
              example:
                type: https://briefline-crm.demo/errors/task-archived
                title: Task archived
                status: 409
                detail: This task is archived and can no longer be modified.
                instance: /api/v1/tasks/44444444-4444-4444-8444-444444444444
                traceId: f0a1b2c3-d4e5-6789-0123-456789012345
                code: TASK_ARCHIVED
                currentVersion: 7

  /tasks/{taskId}/history:
    parameters:
      - $ref: '#/components/parameters/TaskIdParam'
    get:
      tags: [tasks]
      summary: Get task history
      description: |
        Authenticated. Append-only change timeline (FR-HIST-001..004), stable order
        (oldest first), one entry per successful mutation carrying the post-mutation
        version. An archived task's history is visible only to admins (member → 404).
        There are no update or delete routes for history.
      operationId: getTaskHistory
      responses:
        '200':
          description: Append-only history
          content:
            application/json:
              schema:
                type: object
                required: [data]
                properties:
                  data:
                    type: array
                    items:
                      $ref: '#/components/schemas/TaskChange'
              example:
                data:
                  - id: 18181818-1818-4181-8181-181818181818
                    taskId: 44444444-4444-4444-8444-444444444444
                    version: 1
                    event: CREATED
                    field: null
                    oldValue: null
                    newValue: '{"title":"Revamp landing page"}'
                    actor:
                      id: 11111111-1111-4111-8111-111111111111
                      name: Alicia Martin
                    createdAt: '2026-08-02T09:30:00.000Z'
                  - id: 19191919-1919-4191-8191-191919191919
                    taskId: 44444444-4444-4444-8444-444444444444
                    version: 2
                    event: ASSIGNEE_CHANGED
                    field: assigneeId
                    oldValue: null
                    newValue: '"22222222-2222-4222-8222-222222222222"'
                    actor:
                      id: 11111111-1111-4111-8111-111111111111
                      name: Alicia Martin
                    createdAt: '2026-08-02T10:00:00.000Z'
                  - id: 20202020-2020-4202-8202-202020202020
                    taskId: 44444444-4444-4444-8444-444444444444
                    version: 3
                    event: STATUS_CHANGED
                    field: status
                    oldValue: '"PENDING"'
                    newValue: '"IN_PROGRESS"'
                    actor:
                      id: 22222222-2222-4222-8222-222222222222
                      name: Marco Ruiz
                    createdAt: '2026-08-04T15:00:00.000Z'
        '401':
          $ref: '#/components/responses/Unauthorized'
        '404':
          description: Task not found, or archived task requested by a member
          content:
            application/problem+json:
              schema:
                $ref: '#/components/schemas/ProblemDetails'
              example:
                type: https://briefline-crm.demo/errors/task-not-found
                title: Task not found
                status: 404
                detail: The requested task does not exist or is not visible to you.
                instance: /api/v1/tasks/99999999-9999-4999-8999-999999999999
                traceId: a1b2c3d4-e5f6-7890-abcd-ef1234567890
                code: TASK_NOT_FOUND

  /dashboard/kpis:
    get:
      tags: [dashboard]
      summary: Get dashboard KPIs
      description: |
        Authenticated. Counts over all active tasks (both roles see the same numbers —
        team-wide view, FR-DASH-001): open (non-completed, non-archived), overdue (due
        date fully ended in Europe/Madrid, BR-019/020), blocked, and completed in the
        last 7 days. Archived tasks are excluded. Computed server-side (DASH-001); the
        frontend never duplicates the calculation.
      operationId: getKpis
      responses:
        '200':
          description: KPI counts
          content:
            application/json:
              schema:
                type: object
                required: [data]
                properties:
                  data:
                    $ref: '#/components/schemas/Kpis'
              example:
                data:
                  open: 12
                  overdue: 3
                  blocked: 4
                  completedLast7Days: 5
        '401':
          $ref: '#/components/responses/Unauthorized'

  /dashboard/my-tasks:
    get:
      tags: [dashboard]
      summary: Get my tasks
      description: |
        Authenticated. Tasks assigned to the current user (FR-DASH-002), active only.
        Contractual sort (DASH-002): priority desc, due date asc nulls last, updatedAt
        desc. Offset pagination.
      operationId: getMyTasks
      parameters:
        - $ref: '#/components/parameters/PageParam'
        - $ref: '#/components/parameters/LimitParam'
      responses:
        '200':
          description: Prioritized task list assigned to the caller
          content:
            application/json:
              schema:
                type: object
                required: [data, meta]
                properties:
                  data:
                    type: array
                    items:
                      $ref: '#/components/schemas/TaskSummary'
                  meta:
                    $ref: '#/components/schemas/PaginationMeta'
              example:
                data:
                  - id: 44444444-4444-4444-8444-444444444444
                    title: Revamp landing page
                    status: IN_PROGRESS
                    priority: URGENT
                    assignee:
                      id: 22222222-2222-4222-8222-222222222222
                      name: Marco Ruiz
                    client:
                      id: 33333333-3333-4333-8333-333333333333
                      companyName: Bluebird Coffee Co.
                    dueDate: '2026-08-14'
                    version: 4
                    updatedAt: '2026-08-11T08:12:00.000Z'
                  - id: 66666666-6666-4666-8666-666666666666
                    title: Q3 email campaign
                    status: BLOCKED
                    priority: HIGH
                    assignee:
                      id: 22222222-2222-4222-8222-222222222222
                      name: Marco Ruiz
                    client:
                      id: 77777777-7777-4777-8777-777777777777
                      companyName: Vela Analytics
                    dueDate: '2026-08-31'
                    version: 2
                    updatedAt: '2026-08-09T11:00:00.000Z'
                meta:
                  page: 1
                  limit: 25
                  total: 5
        '400':
          $ref: '#/components/responses/BadRequest'
        '401':
          $ref: '#/components/responses/Unauthorized'

  /dashboard/recent-activity:
    get:
      tags: [dashboard]
      summary: Get recent activity
      description: |
        Authenticated. Recent history events on tasks the caller can see (FR-DASH-003).
        Members only receive events on active visible tasks; archived-task events are
        admin-only (no hidden-resource activity leak, DASH-003). Bounded, newest first.
      operationId: getRecentActivity
      parameters:
        - $ref: '#/components/parameters/PageParam'
        - $ref: '#/components/parameters/LimitParam'
      responses:
        '200':
          description: Recent activity feed
          content:
            application/json:
              schema:
                type: object
                required: [data, meta]
                properties:
                  data:
                    type: array
                    items:
                      $ref: '#/components/schemas/ActivityItem'
                  meta:
                    $ref: '#/components/schemas/PaginationMeta'
              example:
                data:
                  - id: 20202020-2020-4202-8202-202020202020
                    type: TASK_STATUS_CHANGED
                    taskId: 44444444-4444-4444-8444-444444444444
                    taskTitle: Revamp landing page
                    actorName: Marco Ruiz
                    occurredAt: '2026-08-04T15:00:00.000Z'
                  - id: 21212121-2121-4212-8212-212121212121
                    type: TASK_CREATED
                    taskId: 17171717-1717-4171-8171-171717171717
                    taskTitle: Set up analytics dashboards
                    actorName: Alicia Martin
                    occurredAt: '2026-08-11T11:00:00.000Z'
                meta:
                  page: 1
                  limit: 25
                  total: 18
        '400':
          $ref: '#/components/responses/BadRequest'
        '401':
          $ref: '#/components/responses/Unauthorized'

components:
  securitySchemes:
    cookieAuth:
      type: apiKey
      in: cookie
      name: briefline-token
      description: |
        HttpOnly session cookie holding the JWT (HS256, 8 h). Local development uses
        `briefline-token`; production uses `__Host-briefline-token` (Secure, Path=/,
        no Domain). A Bearer header fallback is accepted for API clients.
    csrfHeader:
      type: apiKey
      in: header
      name: X-CSRF-Token
      description: |
        Signed double-submit CSRF token issued by GET /auth/csrf, kept in memory by the
        frontend and sent on every POST/PATCH/PUT/DELETE. Bound to the session HMAC.
        Missing or invalid → 403 CSRF_INVALID.

  parameters:
    UserIdParam:
      name: userId
      in: path
      required: true
      description: UUID of the user
      schema:
        type: string
        format: uuid
        example: 22222222-2222-4222-8222-222222222222
    ClientIdParam:
      name: clientId
      in: path
      required: true
      description: UUID of the client
      schema:
        type: string
        format: uuid
        example: 33333333-3333-4333-8333-333333333333
    TaskIdParam:
      name: taskId
      in: path
      required: true
      description: UUID of the task
      schema:
        type: string
        format: uuid
        example: 44444444-4444-4444-8444-444444444444
    PageParam:
      name: page
      in: query
      description: 1-based page number
      schema:
        type: integer
        minimum: 1
        default: 1
    LimitParam:
      name: limit
      in: query
      description: Page size (max 100; values above 100 are rejected with 400)
      schema:
        type: integer
        minimum: 1
        maximum: 100
        default: 25
    SearchParam:
      name: q
      in: query
      description: Case-insensitive search (max 100 characters)
      schema:
        type: string
        maxLength: 100
    UserStatusFilterParam:
      name: status
      in: query
      description: Filter users by status
      schema:
        $ref: '#/components/schemas/UserStatus'
    UserRoleFilterParam:
      name: role
      in: query
      description: Filter users by role
      schema:
        $ref: '#/components/schemas/UserRole'
    ClientStatusFilterParam:
      name: status
      in: query
      description: Filter clients by status (archived results are admin-only)
      schema:
        $ref: '#/components/schemas/ClientStatus'
    TaskStatusFilterParam:
      name: status
      in: query
      description: Filter board by a single column
      schema:
        $ref: '#/components/schemas/TaskStatus'
    TaskPriorityFilterParam:
      name: priority
      in: query
      description: Filter by priority
      schema:
        $ref: '#/components/schemas/TaskPriority'
    AssigneeIdParam:
      name: assigneeId
      in: query
      description: Filter by assignee (UUID)
      schema:
        type: string
        format: uuid
    ClientIdFilterParam:
      name: clientId
      in: query
      description: Filter by client (UUID)
      schema:
        type: string
        format: uuid
    DueBeforeParam:
      name: dueBefore
      in: query
      description: Only tasks with dueDate on or before this date (inclusive)
      schema:
        type: string
        format: date
    DueAfterParam:
      name: dueAfter
      in: query
      description: Only tasks with dueDate on or after this date (inclusive)
      schema:
        type: string
        format: date

  responses:
    BadRequest:
      description: Syntactic validation failed (400) — RFC 9457 with field errors
      content:
        application/problem+json:
          schema:
            $ref: '#/components/schemas/ValidationProblemDetails'
          example:
            type: https://briefline-crm.demo/errors/validation-error
            title: Validation failed
            status: 400
            detail: One or more fields failed validation.
            instance: /api/v1/users
            traceId: a1b2c3d4-e5f6-7890-abcd-ef1234567890
            code: VALIDATION_ERROR
            errors:
              - field: email
                message: Email must be a valid email address.
                code: INVALID_FORMAT
              - field: password
                message: Password must be between 8 and 72 characters.
                code: INVALID_LENGTH
    Unauthorized:
      description: Missing, invalid, or expired session; or user deactivated after token issue (401)
      content:
        application/problem+json:
          schema:
            $ref: '#/components/schemas/ProblemDetails'
          example:
            type: https://briefline-crm.demo/errors/token-invalid
            title: Authentication required
            status: 401
            detail: Your session is not valid. Please log in again.
            instance: /api/v1/tasks
            traceId: b2c3d4e5-f6a7-8901-bcde-f23456789012
            code: TOKEN_INVALID
    Forbidden:
      description: Authenticated but insufficient role or object permission; CSRF/Origin failure (403)
      content:
        application/problem+json:
          schema:
            $ref: '#/components/schemas/ProblemDetails'
          example:
            type: https://briefline-crm.demo/errors/forbidden
            title: Forbidden
            status: 403
            detail: You do not have permission to perform this action.
            instance: /api/v1/users
            traceId: c3d4e5f6-a7b8-9012-cdef-345678901234
            code: FORBIDDEN
    NotFound:
      description: Resource not found or not visible to the caller (404, BOLA-safe)
      content:
        application/problem+json:
          schema:
            $ref: '#/components/schemas/ProblemDetails'
          example:
            type: https://briefline-crm.demo/errors/not-found
            title: Not found
            status: 404
            detail: The requested resource does not exist or is not visible to you.
            instance: /api/v1/tasks/99999999-9999-4999-8999-999999999999
            traceId: d4e5f6a7-b8c9-0123-def4-567890123456
            code: NOT_FOUND
    Conflict:
      description: State conflict (409) — stale version, last admin, duplicate email, archived resource
      content:
        application/problem+json:
          schema:
            $ref: '#/components/schemas/ProblemDetails'
          example:
            type: https://briefline-crm.demo/errors/stale-version
            title: Conflict
            status: 409
            detail: The resource was modified by someone else.
            instance: /api/v1/tasks/44444444-4444-4444-8444-444444444444
            traceId: e5f6a7b8-c9d0-1234-ef56-789012345678
            code: STALE_VERSION
    Unprocessable:
      description: Business rule violation (422) — BR-004/008/009/010/012, FR-CLI-006
      content:
        application/problem+json:
          schema:
            $ref: '#/components/schemas/ProblemDetails'
          example:
            type: https://briefline-crm.demo/errors/blocked-reason-required
            title: Unprocessable
            status: 422
            detail: A blocked task requires a non-empty reason.
            instance: /api/v1/tasks/44444444-4444-4444-8444-444444444444
            traceId: f6a7b8c9-d0e1-2345-f678-901234567890
            code: BLOCKED_REASON_REQUIRED
    RateLimited:
      description: 'Rate limit exceeded (429) — login: 5/60 s with 300 s block; global: 100/60 s'
      headers:
        Retry-After:
          description: Seconds to wait before retrying
          schema:
            type: integer
            example: 60
      content:
        application/problem+json:
          schema:
            $ref: '#/components/schemas/ProblemDetails'
          example:
            type: https://briefline-crm.demo/errors/rate-limited
            title: Too many requests
            status: 429
            detail: Too many attempts. Please wait a moment and try again.
            instance: /api/v1/auth/login
            traceId: a7b8c9d0-e1f2-3456-7890-123456789012
            code: RATE_LIMITED
            retryAfterSeconds: 60
    InternalError:
      description: Unexpected server error (500) — no stack, SQL, or secrets in the body
      content:
        application/problem+json:
          schema:
            $ref: '#/components/schemas/ProblemDetails'
          example:
            type: https://briefline-crm.demo/errors/internal-error
            title: Internal server error
            status: 500
            detail: Something went wrong on our side. Please try again later.
            instance: /api/v1/tasks
            traceId: b8c9d0e1-f2a3-4567-8901-234567890123
            code: INTERNAL_ERROR

  schemas:
    UserRole:
      type: string
      enum: [ADMIN, MEMBER]
      example: MEMBER
    UserStatus:
      type: string
      enum: [ACTIVE, INACTIVE]
      example: ACTIVE
    ClientStatus:
      type: string
      enum: [ACTIVE, INACTIVE, ARCHIVED]
      example: ACTIVE
    TaskStatus:
      type: string
      enum: [BACKLOG, PENDING, IN_PROGRESS, BLOCKED, COMPLETED]
      example: IN_PROGRESS
    TaskPriority:
      type: string
      enum: [LOW, MEDIUM, HIGH, URGENT]
      example: MEDIUM
    UserRef:
      type: object
      description: Minimal user representation for rendering (no per-user lookup needed)
      required: [id, name]
      properties:
        id:
          type: string
          format: uuid
          example: 22222222-2222-4222-8222-222222222222
        name:
          type: string
          maxLength: 100
          example: Marco Ruiz
    ClientRef:
      type: object
      description: Minimal client representation for rendering
      required: [id, companyName]
      properties:
        id:
          type: string
          format: uuid
          example: 33333333-3333-4333-8333-333333333333
        companyName:
          type: string
          maxLength: 160
          example: Bluebird Coffee Co.
    UserResponse:
      type: object
      description: Public user representation — passwordHash is never exposed
      required: [id, email, name, role, status, createdAt, updatedAt]
      properties:
        id:
          type: string
          format: uuid
        email:
          type: string
          format: email
          maxLength: 254
        name:
          type: string
          maxLength: 100
        role:
          $ref: '#/components/schemas/UserRole'
        status:
          $ref: '#/components/schemas/UserStatus'
        lastLoginAt:
          type: [string, 'null']
          format: date-time
        createdAt:
          type: string
          format: date-time
        updatedAt:
          type: string
          format: date-time
    ClientResponse:
      type: object
      required:
        - id
        - companyName
        - industry
        - primaryContactName
        - primaryContactEmail
        - status
        - createdBy
        - createdAt
        - updatedAt
      properties:
        id:
          type: string
          format: uuid
        companyName:
          type: string
          maxLength: 160
        industry:
          type: string
          maxLength: 80
        primaryContactName:
          type: string
          maxLength: 100
        primaryContactEmail:
          type: string
          format: email
          maxLength: 254
        phone:
          type: [string, 'null']
          maxLength: 32
        notes:
          type: [string, 'null']
          maxLength: 2000
        status:
          $ref: '#/components/schemas/ClientStatus'
        createdBy:
          $ref: '#/components/schemas/UserRef'
        createdAt:
          type: string
          format: date-time
        updatedAt:
          type: string
          format: date-time
    ClientWithTasksResponse:
      type: object
      required: [client, relatedTasks]
      properties:
        client:
          $ref: '#/components/schemas/ClientResponse'
        relatedTasks:
          type: object
          required: [data, meta]
          properties:
            data:
              type: array
              items:
                $ref: '#/components/schemas/TaskSummary'
            meta:
              $ref: '#/components/schemas/PaginationMeta'
    TaskSummary:
      type: object
      description: Compact task card (board, lists, my tasks) — no description or history
      required: [id, title, status, priority, version, updatedAt]
      properties:
        id:
          type: string
          format: uuid
        title:
          type: string
          maxLength: 160
        status:
          $ref: '#/components/schemas/TaskStatus'
        priority:
          $ref: '#/components/schemas/TaskPriority'
        assignee:
          oneOf:
            - $ref: '#/components/schemas/UserRef'
            - type: 'null'
        client:
          oneOf:
            - $ref: '#/components/schemas/ClientRef'
            - type: 'null'
        dueDate:
          type: [string, 'null']
          format: date
        version:
          type: integer
          minimum: 1
        updatedAt:
          type: string
          format: date-time
    TaskResponse:
      type: object
      description: Full task representation
      required: [id, title, status, priority, creator, version, createdAt, updatedAt]
      properties:
        id:
          type: string
          format: uuid
        title:
          type: string
          maxLength: 160
        description:
          type: [string, 'null']
          maxLength: 5000
        status:
          $ref: '#/components/schemas/TaskStatus'
        priority:
          $ref: '#/components/schemas/TaskPriority'
        assignee:
          oneOf:
            - $ref: '#/components/schemas/UserRef'
            - type: 'null'
        client:
          oneOf:
            - $ref: '#/components/schemas/ClientRef'
            - type: 'null'
        dueDate:
          type: [string, 'null']
          format: date
          description: Date-only deadline; expires at the end of that day in Europe/Madrid (BR-020)
        blockedReason:
          type: [string, 'null']
          maxLength: 500
          description: Only non-null while the task is BLOCKED (BR-010/011)
        creator:
          $ref: '#/components/schemas/UserRef'
        version:
          type: integer
          minimum: 1
          description: Optimistic-lock version; every successful mutation increments it
        archivedAt:
          type: [string, 'null']
          format: date-time
        archivedBy:
          oneOf:
            - $ref: '#/components/schemas/UserRef'
            - type: 'null'
        createdAt:
          type: string
          format: date-time
        updatedAt:
          type: string
          format: date-time
    TaskChange:
      type: object
      description: Append-only history entry; one per successful mutation, carrying the post-mutation version
      required: [id, taskId, version, event, actor, createdAt]
      properties:
        id:
          type: string
          format: uuid
        taskId:
          type: string
          format: uuid
        version:
          type: integer
          description: Task version after this mutation
        event:
          $ref: '#/components/schemas/TaskChangeEvent'
        field:
          type: [string, 'null']
          description: Changed field for FIELD_UPDATED events (title, priority, dueDate, blockedReason, ...)
        oldValue:
          type: [string, 'null']
          description: Previous value, JSON-encoded
        newValue:
          type: [string, 'null']
          description: New value, JSON-encoded
        actor:
          $ref: '#/components/schemas/UserRef'
        createdAt:
          type: string
          format: date-time
    TaskChangeEvent:
      type: string
      enum: [CREATED, FIELD_UPDATED, STATUS_CHANGED, ASSIGNEE_CHANGED, ARCHIVED]
      example: STATUS_CHANGED
    ActivityItem:
      type: object
      description: Dashboard feed item derived from TaskChange
      required: [id, type, taskId, taskTitle, actorName, occurredAt]
      properties:
        id:
          type: string
          format: uuid
        type:
          $ref: '#/components/schemas/TaskChangeEvent'
        taskId:
          type: string
          format: uuid
        taskTitle:
          type: string
          maxLength: 160
        actorName:
          type: string
          maxLength: 100
        occurredAt:
          type: string
          format: date-time
    Kpis:
      type: object
      required: [open, overdue, blocked, completedLast7Days]
      properties:
        open:
          type: integer
          description: Non-completed, non-archived active tasks
          example: 12
        overdue:
          type: integer
          description: Due date fully ended in Europe/Madrid (BR-019/020)
          example: 3
        blocked:
          type: integer
          description: Tasks currently BLOCKED
          example: 4
        completedLast7Days:
          type: integer
          description: Tasks completed within the last 7 days
          example: 5
    Board:
      type: object
      required: [backlog, columns]
      properties:
        backlog:
          type: array
          items:
            $ref: '#/components/schemas/TaskSummary'
          description: BACKLOG tasks (may be unassigned)
        columns:
          type: object
          required: [PENDING, IN_PROGRESS, BLOCKED, COMPLETED]
          properties:
            PENDING:
              type: array
              items:
                $ref: '#/components/schemas/TaskSummary'
            IN_PROGRESS:
              type: array
              items:
                $ref: '#/components/schemas/TaskSummary'
            BLOCKED:
              type: array
              items:
                $ref: '#/components/schemas/TaskSummary'
            COMPLETED:
              type: array
              items:
                $ref: '#/components/schemas/TaskSummary'
          additionalProperties: false
    BoardMeta:
      type: object
      required: [total]
      properties:
        total:
          type: integer
          description: Total cards returned across backlog and columns
    BoardResponse:
      type: object
      required: [data, meta]
      properties:
        data:
          $ref: '#/components/schemas/Board'
        meta:
          $ref: '#/components/schemas/BoardMeta'
    PaginationMeta:
      type: object
      required: [page, limit, total]
      properties:
        page:
          type: integer
          minimum: 1
        limit:
          type: integer
          minimum: 1
          maximum: 100
        total:
          type: integer
          description: Total items matching the query before pagination
    LoginRequest:
      type: object
      required: [email, password]
      properties:
        email:
          type: string
          format: email
          maxLength: 254
          description: Normalized with trim().toLowerCase() before lookup (ADR-002)
        password:
          type: string
          minLength: 8
          maxLength: 72
          format: password
    CsrfTokenResponse:
      type: object
      required: [data]
      properties:
        data:
          type: object
          required: [csrfToken]
          properties:
            csrfToken:
              type: string
              description: Keep in memory; send as X-CSRF-Token on unsafe methods
    OkResponse:
      type: object
      required: [data]
      properties:
        data:
          type: object
          required: [ok]
          properties:
            ok:
              type: boolean
              example: true
    CreateUserRequest:
      type: object
      required: [name, email, password]
      properties:
        name:
          type: string
          maxLength: 100
        email:
          type: string
          format: email
          maxLength: 254
          description: Stored normalized (trim().toLowerCase()); unique case-insensitively
        password:
          type: string
          minLength: 8
          maxLength: 72
          format: password
          description: Initial password, Argon2id-hashed; never returned
        role:
          $ref: '#/components/schemas/UserRole'
    UpdateUserRequest:
      type: object
      description: At least one field required; only name, role, and status are editable
      minProperties: 1
      properties:
        name:
          type: string
          maxLength: 100
        role:
          $ref: '#/components/schemas/UserRole'
        status:
          $ref: '#/components/schemas/UserStatus'
    DeactivateUserRequest:
      type: object
      required: [reassignments]
      properties:
        reassignments:
          type: array
          description: Required when the target has active assigned tasks; each entry moves one task to an ACTIVE user (BR-004). Empty array allowed when there is no assigned work.
          items:
            type: object
            required: [taskId, assigneeId]
            properties:
              taskId:
                type: string
                format: uuid
              assigneeId:
                type: string
                format: uuid
    DeactivationImpact:
      type: object
      required: [userId, assignedCount, createdCount, requiresReassignment, assignedTasks]
      properties:
        userId:
          type: string
          format: uuid
        assignedCount:
          type: integer
          description: Active tasks assigned to the target (require reassignment before deactivation)
        createdCount:
          type: integer
          description: Active tasks created by the target
        requiresReassignment:
          type: boolean
        assignedTasks:
          type: array
          items:
            $ref: '#/components/schemas/TaskSummary'
    UpdateProfileRequest:
      type: object
      required: [name]
      properties:
        name:
          type: string
          maxLength: 100
          description: Only the own name is editable (PROF-001); any other field is rejected with 400
    CreateClientRequest:
      type: object
      required: [companyName, primaryContactName, primaryContactEmail]
      properties:
        companyName:
          type: string
          maxLength: 160
        industry:
          type: string
          maxLength: 80
        primaryContactName:
          type: string
          maxLength: 100
        primaryContactEmail:
          type: string
          format: email
          maxLength: 254
        phone:
          type: [string, 'null']
          maxLength: 32
        notes:
          type: [string, 'null']
          maxLength: 2000
    UpdateClientRequest:
      type: object
      description: Admin only; field-level allowlist (CLI-API-004). At least one field required.
      minProperties: 1
      properties:
        companyName:
          type: string
          maxLength: 160
        industry:
          type: string
          maxLength: 80
        primaryContactName:
          type: string
          maxLength: 100
        primaryContactEmail:
          type: string
          format: email
          maxLength: 254
        phone:
          type: [string, 'null']
          maxLength: 32
        notes:
          type: [string, 'null']
          maxLength: 2000
    CreateTaskRequest:
      type: object
      required: [title]
      properties:
        title:
          type: string
          minLength: 1
          maxLength: 160
        description:
          type: [string, 'null']
          maxLength: 5000
        status:
          $ref: '#/components/schemas/TaskStatus'
        priority:
          $ref: '#/components/schemas/TaskPriority'
        assigneeId:
          type: [string, 'null']
          format: uuid
          description: Required for non-backlog creation (BR-009); must reference an ACTIVE user (BR-004)
        clientId:
          type: [string, 'null']
          format: uuid
          description: Archived clients are rejected with 422 (FR-CLI-006)
        dueDate:
          type: [string, 'null']
          format: date
        blockedReason:
          type: [string, 'null']
          maxLength: 500
          description: Required when status is BLOCKED (BR-010)
        expectedVersion:
          type: integer
          const: 0
          description: Optional for create (no prior state exists); if present, MUST be 0. The server starts version at 1.
    UpdateTaskRequest:
      type: object
      description: Field-level allowlist (TASK-API-003). expectedVersion is REQUIRED on every mutation.
      required: [expectedVersion]
      minProperties: 2
      properties:
        title:
          type: string
          minLength: 1
          maxLength: 160
        description:
          type: [string, 'null']
          maxLength: 5000
        priority:
          $ref: '#/components/schemas/TaskPriority'
        assigneeId:
          type: [string, 'null']
          format: uuid
          description: null unassigns — only allowed while BACKLOG, else 422 (BR-009); target must be ACTIVE (BR-004)
        clientId:
          type: [string, 'null']
          format: uuid
          description: null removes the association; archived clients are rejected with 422 (FR-CLI-006)
        dueDate:
          type: [string, 'null']
          format: date
        blockedReason:
          type: [string, 'null']
          maxLength: 500
          description: Only accepted while status is BLOCKED; cleared by the server when leaving BLOCKED (BR-011)
        expectedVersion:
          type: integer
          minimum: 1
          description: Version the client last saw; stale values are rejected with 409 STALE_VERSION
    ChangeTaskStatusRequest:
      type: object
      required: [status, expectedVersion]
      properties:
        status:
          $ref: '#/components/schemas/TaskStatus'
          description: Free transitions (DEC-024); COMPLETED may be reopened (BR-012)
        blockedReason:
          type: string
          maxLength: 500
          description: Required when status is BLOCKED (BR-010)
        expectedVersion:
          type: integer
          minimum: 1
    ArchiveTaskRequest:
      type: object
      required: [expectedVersion]
      properties:
        expectedVersion:
          type: integer
          minimum: 1
    ProblemDetails:
      type: object
      description: RFC 9457 problem details. type, title, status, detail, instance, traceId, code are always present on errors.
      required: [type, title, status, detail, instance, traceId, code]
      properties:
        type:
          type: string
          format: uri-reference
          description: Stable error URI, e.g. https://briefline-crm.demo/errors/<code-slug>
        title:
          type: string
        status:
          type: integer
          minimum: 400
          maximum: 599
        detail:
          type: string
          description: Safe, user-presentable message — never leaks internals
        instance:
          type: string
          description: Request path that produced the error
        traceId:
          type: string
          format: uuid
          description: Correlation id, also present in structured logs
        code:
          type: string
          description: Stable machine-readable code (see the RFC 9457 catalogue)
    ValidationProblemDetails:
      allOf:
        - $ref: '#/components/schemas/ProblemDetails'
        - type: object
          properties:
            errors:
              type: array
              description: Field-level validation failures
              items:
                $ref: '#/components/schemas/FieldError'
    FieldError:
      type: object
      required: [field, message, code]
      properties:
        field:
          type: string
          description: DTO property name (dot notation for nested)
        message:
          type: string
        code:
          type: string
          description: Field-level code — INVALID_FORMAT, INVALID_ENUM, INVALID_LENGTH, or a business code
    HealthResponse:
      type: object
      required: [status, db, timestamp]
      properties:
        status:
          type: string
          enum: [ok]
        db:
          type: string
          enum: [up]
        timestamp:
          type: string
          format: date-time
```

> **Swagger UI:** the interactive docs are served at `GET /api/docs` (public, outside the
> permission matrix). CSP is relaxed for Swagger UI per the baseline (styleSrc
> `'unsafe-inline'`, imgSrc `validator.swagger.io`, scriptSrc `https:`).
>
> **Security note:** the global `security` applies `cookieAuth` to every operation; unsafe
> methods additionally declare `csrfHeader` at the operation level. Login is CSRF-protected
> with `csrfHeader` only (no session cookie yet — pre-auth CSRF rotation).

---

## 2. Examples for Key Scenarios

### 2.1 Login Success

```http
GET /api/v1/auth/csrf
```
```http
200 OK
Set-Cookie: csrf-token=1a2b3c4d...; Path=/; HttpOnly; SameSite=Strict
Content-Type: application/json
```
```json
{ "data": { "csrfToken": "9f2c1d3e4b5a6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d" } }
```

```http
POST /api/v1/auth/login
Content-Type: application/json
X-CSRF-Token: 9f2c1d3e4b5a6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d

{ "email": "admin@northstar.digital", "password": "Briefline2026!" }
```
```http
200 OK
Set-Cookie: __Host-briefline-token=eyJhbGciOiJIUzI1NiJ9...; Path=/; HttpOnly; SameSite=Lax; Max-Age=28800; Secure
Set-Cookie: csrf-token=4e5f6a7b...; Path=/; HttpOnly; SameSite=Strict
Content-Type: application/json
```
```json
{ "data": { "csrfToken": "4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f" } }
```

### 2.2 Login Failure (generic 401, no enumeration)

```http
POST /api/v1/auth/login
Content-Type: application/json
X-CSRF-Token: 9f2c1d3e...

{ "email": "admin@northstar.digital", "password": "wrong-password" }
```
```http
401 Unauthorized
Content-Type: application/problem+json
```
```json
{
  "type": "https://briefline-crm.demo/errors/invalid-credentials",
  "title": "Invalid credentials",
  "status": 401,
  "detail": "The email or password is incorrect.",
  "instance": "/api/v1/auth/login",
  "traceId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "code": "INVALID_CREDENTIALS"
}
```

The same body is returned for an unknown email, a wrong password, and an inactive user
(FR-AUTH-002/003 — no account-status enumeration).

### 2.3 Board Query

```http
GET /api/v1/tasks/board?priority=HIGH&dueBefore=2026-08-31&q=landing
Cookie: briefline-token=eyJhbGciOiJIUzI1NiJ9...
```
```http
200 OK
Content-Type: application/json
```
```json
{
  "data": {
    "backlog": [],
    "columns": {
      "PENDING": [],
      "IN_PROGRESS": [
        {
          "id": "44444444-4444-4444-8444-444444444444",
          "title": "Revamp landing page",
          "status": "IN_PROGRESS",
          "priority": "URGENT",
          "assignee": { "id": "22222222-2222-4222-8222-222222222222", "name": "Marco Ruiz" },
          "client": { "id": "33333333-3333-4333-8333-333333333333", "companyName": "Bluebird Coffee Co." },
          "dueDate": "2026-08-14",
          "version": 4,
          "updatedAt": "2026-08-11T08:12:00.000Z"
        }
      ],
      "BLOCKED": [],
      "COMPLETED": []
    }
  },
  "meta": { "total": 1 }
}
```

Contractual sort within each group: priority desc, due date asc nulls last, updatedAt
desc — never a manual card order.

### 2.4 Task Create

```http
POST /api/v1/tasks
Cookie: briefline-token=eyJhbGciOiJIUzI1NiJ9...
Content-Type: application/json
X-CSRF-Token: 4e5f6a7b...

{
  "title": "Set up analytics dashboards",
  "description": "Configure GA4 + Looker Studio reporting for Q4.",
  "status": "BACKLOG",
  "priority": "MEDIUM",
  "assigneeId": null,
  "clientId": "77777777-7777-4777-8777-777777777777",
  "dueDate": "2026-09-30"
}
```
```http
201 Created
Location: /api/v1/tasks/17171717-1717-4171-8171-171717171717
Content-Type: application/json
```
```json
{
  "data": {
    "id": "17171717-1717-4171-8171-171717171717",
    "title": "Set up analytics dashboards",
    "description": "Configure GA4 + Looker Studio reporting for Q4.",
    "status": "BACKLOG",
    "priority": "MEDIUM",
    "assignee": null,
    "client": { "id": "77777777-7777-4777-8777-777777777777", "companyName": "Vela Analytics" },
    "dueDate": "2026-09-30",
    "blockedReason": null,
    "creator": { "id": "11111111-1111-4111-8111-111111111111", "name": "Alicia Martin" },
    "version": 1,
    "archivedAt": null,
    "archivedBy": null,
    "createdAt": "2026-08-11T11:00:00.000Z",
    "updatedAt": "2026-08-11T11:00:00.000Z"
  }
}
```

A CREATED history event is committed in the same transaction (BR-017/018).

### 2.5 Stale Update (409)

```http
PATCH /api/v1/tasks/44444444-4444-4444-8444-444444444444
Cookie: briefline-token=eyJhbGciOiJIUzI1NiJ9...
Content-Type: application/json
X-CSRF-Token: 4e5f6a7b...

{ "title": "Revamp landing page v2", "expectedVersion": 4 }
```
The server's current version is 5 (another user updated the task in the meantime).
```http
409 Conflict
Content-Type: application/problem+json
```
```json
{
  "type": "https://briefline-crm.demo/errors/stale-version",
  "title": "Stale version",
  "status": 409,
  "detail": "This task was modified by someone else. Review the current state and retry.",
  "instance": "/api/v1/tasks/44444444-4444-4444-8444-444444444444",
  "traceId": "e3f4a5b6-c7d8-9012-3456-789012345678",
  "code": "STALE_VERSION",
  "currentVersion": 5,
  "currentState": {
    "title": "Revamp landing page and hero",
    "description": "Redesign homepage, improve CTA hierarchy, ship with the new brand.",
    "status": "IN_PROGRESS",
    "priority": "URGENT",
    "assigneeId": "22222222-2222-4222-8222-222222222222",
    "clientId": "33333333-3333-4333-8333-333333333333",
    "dueDate": "2026-08-16",
    "blockedReason": null
  }
}
```

FE behavior: roll back the optimistic update, render `currentState`, offer to retry on
top of `currentVersion` (TASK-FE-012). Neither Task nor TaskChange was modified.

### 2.6 Validation Error (400)

```http
POST /api/v1/users
Cookie: briefline-token=eyJhbGciOiJIUzI1NiJ9...
Content-Type: application/json
X-CSRF-Token: 4e5f6a7b...

{ "name": "E", "email": "not-an-email", "password": "short", "role": "OWNER" }
```
```http
400 Bad Request
Content-Type: application/problem+json
```
```json
{
  "type": "https://briefline-crm.demo/errors/validation-error",
  "title": "Validation failed",
  "status": 400,
  "detail": "One or more fields failed validation.",
  "instance": "/api/v1/users",
  "traceId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "code": "VALIDATION_ERROR",
  "errors": [
    { "field": "name", "message": "Name must be between 2 and 100 characters.", "code": "INVALID_LENGTH" },
    { "field": "email", "message": "Email must be a valid email address.", "code": "INVALID_FORMAT" },
    { "field": "password", "message": "Password must be between 8 and 72 characters.", "code": "INVALID_LENGTH" },
    { "field": "role", "message": "Role must be one of: ADMIN, MEMBER.", "code": "INVALID_ENUM" }
  ]
}
```

Unknown DTO properties are also rejected here (`forbidNonWhitelisted`, NFR-SEC-005).

### 2.7 Forbidden (403)

```http
PATCH /api/v1/tasks/44444444-4444-4444-8444-444444444444
Cookie: briefline-token=<member-session>
Content-Type: application/json
X-CSRF-Token: 4e5f6a7b...

{ "priority": "HIGH", "expectedVersion": 4 }
```
The member is neither the creator nor the assignee of this task (BR-013).
```http
403 Forbidden
Content-Type: application/problem+json
```
```json
{
  "type": "https://briefline-crm.demo/errors/forbidden",
  "title": "Forbidden",
  "status": 403,
  "detail": "You do not have permission to modify this task.",
  "instance": "/api/v1/tasks/44444444-4444-4444-8444-444444444444",
  "traceId": "c1d2e3f4-a5b6-7890-1234-567890123456",
  "code": "FORBIDDEN"
}
```

403 never logs the user out; the UI renders a forbidden state in place (AUTH-FE-002).

### 2.8 Deactivation Impact and Deactivate

```http
GET /api/v1/users/22222222-2222-4222-8222-222222222222/deactivation-impact
Cookie: briefline-token=<admin-session>
```
```http
200 OK
Content-Type: application/json
```
```json
{
  "data": {
    "userId": "22222222-2222-4222-8222-222222222222",
    "assignedCount": 3,
    "createdCount": 5,
    "requiresReassignment": true,
    "assignedTasks": [
      {
        "id": "44444444-4444-4444-8444-444444444444",
        "title": "Revamp landing page",
        "status": "IN_PROGRESS",
        "priority": "URGENT",
        "assignee": { "id": "22222222-2222-4222-8222-222222222222", "name": "Marco Ruiz" },
        "client": { "id": "33333333-3333-4333-8333-333333333333", "companyName": "Bluebird Coffee Co." },
        "dueDate": "2026-08-14",
        "version": 4,
        "updatedAt": "2026-08-11T08:12:00.000Z"
      }
    ]
  }
}
```

```http
POST /api/v1/users/22222222-2222-4222-8222-222222222222/deactivate
Cookie: briefline-token=<admin-session>
Content-Type: application/json
X-CSRF-Token: 4e5f6a7b...

{
  "reassignments": [
    { "taskId": "44444444-4444-4444-8444-444444444444", "assigneeId": "11111111-1111-4111-8111-111111111111" },
    { "taskId": "66666666-6666-4666-8666-666666666666", "assigneeId": "99999999-9999-4999-8999-999999999999" },
    { "taskId": "88888888-8888-4888-8888-888888888888", "assigneeId": "99999999-9999-4999-8999-999999999999" }
  ]
}
```
```http
200 OK
Content-Type: application/json
```
```json
{
  "data": {
    "userId": "22222222-2222-4222-8222-222222222222",
    "assignedCount": 0,
    "createdCount": 5,
    "requiresReassignment": false,
    "assignedTasks": []
  }
}
```

---

## 3. RFC 9457 Error Catalogue

### 3.1 Problem Details Structure

Every error response uses `application/problem+json` with the following shape. The
`code` is the stable machine-readable identifier; `errors[]` is present for validation
and some business conflicts; domain extensions (e.g. `currentVersion`) are allowed.

```json
{
  "type": "https://briefline-crm.demo/errors/invalid-credentials",
  "title": "Invalid credentials",
  "status": 401,
  "detail": "The email or password is incorrect.",
  "instance": "/api/v1/auth/login",
  "traceId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "code": "INVALID_CREDENTIALS",
  "errors": [
    {
      "field": "email",
      "message": "Invalid format",
      "code": "INVALID_FORMAT"
    }
  ]
}
```

Guarantees:
- `type` is a stable URI: `https://briefline-crm.demo/errors/<slug>` — never a doc page of
  a specific request instance.
- `detail` is always safe to display — no stack traces, SQL, internal ids, or secrets
  (API-004, NFR-OBS-001).
- `traceId` is a UUID correlated with the structured log entry for the request.
- Every 400/403/404/409/422 failure on a task mutation changes neither Task nor
  TaskChange (BR-018, TASK-API-013).

### 3.2 Error Codes — AUTH

#### INVALID_CREDENTIALS
- **Status:** 401
- **Trigger:** Login with an unknown email, a wrong password, or an inactive account — always the same generic response (FR-AUTH-002/003, BR-001).
- **Safe message:** "The email or password is incorrect."
- **Extensions:** none (deliberately no field-level distinction).
- **FE behavior:** Show the generic error on the login form; never distinguish "user not found" from "bad password". Clear the password field. Do not clear the session cache (there is no session).

#### INACTIVE_USER
- **Status:** 401
- **Trigger:** A request authenticated with a valid JWT whose user was deactivated after token issue (AUTH-002). Never emitted by login — login always returns INVALID_CREDENTIALS.
- **Safe message:** "Your session is no longer valid. Please log in again."
- **Extensions:** none (generic — must not reveal account status).
- **FE behavior:** Same as TOKEN_EXPIRED/TOKEN_INVALID: clear session state and cache, redirect to `/login` preserving the intended destination (AUTH-FE-002/003).

#### TOKEN_EXPIRED
- **Status:** 401
- **Trigger:** JWT `exp` is in the past (8 h lifetime; no renewal — DEC-011).
- **Safe message:** "Your session is no longer valid. Please log in again."
- **Extensions:** none.
- **FE behavior:** Clear session and cache, redirect to `/login` with the intended destination preserved. Do not display as an error — treat as "please log in again" (AUTH-FE-003).

#### TOKEN_INVALID
- **Status:** 401
- **Trigger:** Token missing, malformed, wrong signature, algorithm not HS256, wrong `iss`/`aud`, or any verification failure. Also the general 401 fallback.
- **Safe message:** "Your session is no longer valid. Please log in again."
- **Extensions:** none.
- **FE behavior:** Same as TOKEN_EXPIRED (401 is always logout).

#### CSRF_INVALID
- **Status:** 403
- **Trigger:** Unsafe method without `X-CSRF-Token`, or with a token whose signed HMAC does not match the session-bound secret (csrf-csrf 4.0.3; includes tokens from a previous session after login/logout rotation). Also covers Origin-validation failure as a 403 (defense in depth).
- **Safe message:** "The security token is invalid or missing. Refresh the page and try again."
- **Extensions:** none.
- **FE behavior:** Fetch a fresh token from `GET /auth/csrf` and retry once; if it fails again, show a security error with a reload action. Never logs out (403 semantics).

#### RATE_LIMITED
- **Status:** 429
- **Trigger:** Login throttle exceeded (5 attempts / 60 s, 300 s block) or global throttle (100 req / 60 s per IP) (AUTH-004, NFR-SEC-004).
- **Safe message:** "Too many attempts. Please wait a moment and try again."
- **Extensions:** `retryAfterSeconds` (integer); `Retry-After` header also set.
- **FE behavior:** Show rate-limit feedback on the login form (AUTH-FE-001); do not retry blindly; disable submit until `retryAfterSeconds` elapses.

### 3.3 Error Codes — VALIDATION

#### VALIDATION_ERROR
- **Status:** 400
- **Trigger:** Any DTO failure: wrong types, unknown properties (forbidNonWhitelisted, NFR-SEC-005), invalid pagination (`limit > 100`, `page < 1`), search `q` over 100 chars, or any field-level rule. Also mass-assignment attempts on `/profile` (role/status/email) — PROF-001.
- **Safe message:** "One or more fields failed validation."
- **Extensions:** `errors[]` with `{ field, message, code }` per failing property (dot notation for nested).
- **FE behavior:** Map each `errors[].field` to the form control via `setError(field, { type: 'manual', message })`; show an accessible summary; focus the first invalid field. Non-field errors surface in the form summary.

#### INVALID_FORMAT
- **Status:** 400 (field code inside `errors[]`)
- **Trigger:** A field's format is wrong: email not an email, UUID not a UUID, date not `YYYY-MM-DD`, datetime not ISO 8601, numeric where a number is expected.
- **Safe message:** e.g. "Email must be a valid email address."
- **Extensions:** none.
- **FE behavior:** Field-level inline error; do not submit until fixed.

#### INVALID_ENUM
- **Status:** 400 (field code inside `errors[]`)
- **Trigger:** A value is not one of the allowed enum values (role, status, priority, task status, event type, health status).
- **Safe message:** e.g. "Role must be one of: ADMIN, MEMBER."
- **Extensions:** none.
- **FE behavior:** Field-level inline error; the selector should have prevented it — treat as defensive.

#### INVALID_LENGTH
- **Status:** 400 (field code inside `errors[]`)
- **Trigger:** A value violates its length limits (name 100, email 254, company 160, industry 80, contact name 100, phone 32, notes 2000, title 160, description 5000, blocked reason 500, search 100, password 8–72).
- **Safe message:** e.g. "Password must be between 8 and 72 characters."
- **Extensions:** none.
- **FE behavior:** Field-level inline error; `maxLength` hints in the UI should match the contract.

### 3.4 Error Codes — USERS

#### EMAIL_ALREADY_EXISTS
- **Status:** 409
- **Trigger:** Creating (or, in future, updating) a user whose normalized email (`trim().toLowerCase()`, ADR-002) already exists — Prisma P2002 mapped, never a 500.
- **Safe message:** "An account with this email already exists."
- **Extensions:** `errors[]` with `{ field: "email", code: "EMAIL_ALREADY_EXISTS" }`.
- **FE behavior:** Field error on email; let the user edit the value; no retry loop.

#### LAST_ADMIN
- **Status:** 409
- **Trigger:** Demoting an ADMIN to MEMBER or deactivating (via update or deactivate) an ADMIN when they would leave fewer than 1 active admin (BR-003). Checked in a serializable transaction with bounded P2034 retry (USR-005, ADR-004).
- **Safe message:** "At least one active administrator must remain."
- **Extensions:** none.
- **FE behavior:** Block the action; show the current admin state; explain that another active admin is required first. No optimistic state change is kept.

#### USER_NOT_FOUND
- **Status:** 404
- **Trigger:** `userId` does not exist (admin module), or the target is not visible to the caller. Used for assignee lookups in task create/update as well.
- **Safe message:** "The requested user does not exist."
- **Extensions:** none.
- **FE behavior:** Empty/not-found state; on task forms, mark the assignee choice as invalid (stale reference).

#### CANNOT_DEACTIVATE_SELF
- **Status:** 409 (reserved)
- **Trigger:** Reserved code. Per the permission matrix (edge case 1), self-deactivation is ALLOWED unless the actor is the last active admin — that case emits `LAST_ADMIN`. This code is defined for catalogue completeness and future policy; it is NOT emitted in the MVP.
- **Safe message:** "You cannot deactivate your own account." (if ever emitted)
- **Extensions:** none.
- **FE behavior:** (n/a in MVP) Block with explanation; re-fetch current user.

### 3.5 Error Codes — CLIENTS

#### CLIENT_NOT_FOUND
- **Status:** 404
- **Trigger:** `clientId` does not exist, or an archived client is requested/patched by a member (BOLA-safe — indistinguishable from unknown id, BR-005/016).
- **Safe message:** "The requested client does not exist or is not visible to you."
- **Extensions:** none.
- **FE behavior:** Empty/not-found state; on task forms, mark the client choice as invalid (stale reference).

#### CLIENT_ARCHIVED
- **Status:** 409
- **Trigger:** Any write to an ARCHIVED client: update, deactivate, or archive (double archive — no state change, defined idempotency). Archive is permanent; there is no un-archive route.
- **Safe message:** "This client is archived and can no longer be modified."
- **Extensions:** none.
- **FE behavior:** Block editing; show the archived state; disable all client mutations.

#### CANNOT_ARCHIVE_WITH_ACTIVE_TASKS
- **Status:** 409 (reserved)
- **Trigger:** Reserved code. Per BR-006/CLI-API-006, archiving a client with active tasks IS allowed in the MVP — existing task links remain and only NEW associations are rejected (422). This code is defined for catalogue completeness if an integrity policy forbidding archive-with-active-work is adopted later; it is NOT emitted in the MVP.
- **Safe message:** "This client has active tasks and cannot be archived." (if ever emitted)
- **Extensions:** none.
- **FE behavior:** (n/a in MVP) Confirmation dialog listing the affected tasks.

### 3.6 Error Codes — TASKS

#### TASK_NOT_FOUND
- **Status:** 404
- **Trigger:** `taskId` does not exist, or an archived task is requested by a member (BOLA-safe, BR-016). Emitted at resolve time for any task operation.
- **Safe message:** "The requested task does not exist or is not visible to you."
- **Extensions:** none.
- **FE behavior:** Empty/not-found state; close stale side panels; invalidate board queries.

#### STALE_VERSION
- **Status:** 409
- **Trigger:** `expectedVersion` on a task mutation (PATCH update, PATCH status, POST archive) does not match the server's current `version` (ADR-004, DEC-034). Compare-and-swap inside the mutation transaction; neither Task nor TaskChange is written.
- **Safe message:** "This task was modified by someone else. Review the current state and retry."
- **Extensions:** `currentVersion` (integer) and `currentState` (safe public representation: title, description, status, priority, assigneeId, clientId, dueDate, blockedReason, archivedAt).
- **FE behavior:** Cancel the optimistic update (cancel → snapshot → rollback → invalidate, TASK-FE-012), render `currentState`, and offer to retry on top of `currentVersion`. Never destructive: user intent is preserved. One pending mutation per task (TASK-FE-013).

#### TASK_ARCHIVED
- **Status:** 409
- **Trigger:** Any mutation on an archived task by an admin (update, status, archive — double archive is a no-op with no second history event, TASK-API-006), or a write to an archived task's client association. Members never see archived tasks at all (404).
- **Safe message:** "This task is archived and can no longer be modified."
- **Extensions:** `currentVersion` (integer).
- **FE behavior:** Block all mutations; show the archived state and the archive view; no un-archive action exists.

#### ASSIGNEE_REQUIRED
- **Status:** 422
- **Trigger:** A task outside BACKLOG is created or transitioned without an assignee, or a non-backlog task is unassigned (BR-009). Also raised when a task leaves BACKLOG while unassigned.
- **Safe message:** "Tasks outside the backlog must have an active assignee."
- **Extensions:** `errors[]` with `{ field: "assigneeId", code: "ASSIGNEE_REQUIRED" }`.
- **FE behavior:** Field error on assignee; keep the optimistic move and let the user pick an assignee, then retry (FR-TASK-012). On the board, a move to an active column without assignee must be prevented client-side and explained server-side.

#### BLOCKED_REASON_REQUIRED
- **Status:** 422
- **Trigger:** Status set to BLOCKED (or task created BLOCKED) without a non-empty reason (BR-010). Reason trimmed; max 500 chars.
- **Safe message:** "A blocked task requires a non-empty reason."
- **Extensions:** `errors[]` with `{ field: "blockedReason", code: "BLOCKED_REASON_REQUIRED" }`.
- **FE behavior:** Open the blocked-reason input (dialog or inline), require a value, then resubmit with the same `expectedVersion` (nothing was written).

#### INACTIVE_ASSIGNEE
- **Status:** 422
- **Trigger:** Assigning a task to a user whose status is INACTIVE (BR-004) — on create, update, reassignment, or deactivation-impact reassignment.
- **Safe message:** "The selected assignee is inactive and cannot receive assignments."
- **Extensions:** `errors[]` with `{ field: "assigneeId", code: "INACTIVE_ASSIGNEE" }`.
- **FE behavior:** Field error on assignee; the assignee selector should already filter to ACTIVE users; treat as defensive and re-fetch the user list.

#### CANNOT_ASSIGN_ARCHIVED_CLIENT
- **Status:** 422
- **Trigger:** Creating or updating a task with a `clientId` whose client is ARCHIVED (FR-CLI-006). Existing links remain untouched.
- **Safe message:** "Archived clients cannot receive new task associations."
- **Extensions:** `errors[]` with `{ field: "clientId", code: "CANNOT_ASSIGN_ARCHIVED_CLIENT" }`.
- **FE behavior:** Field error on client; the client selector should exclude archived clients; treat as defensive.

### 3.7 Error Codes — GENERAL

#### NOT_FOUND
- **Status:** 404
- **Trigger:** Fallback for any unknown/non-visible resource path (BOLA-safe by default). Specific codes (USER_NOT_FOUND, CLIENT_NOT_FOUND, TASK_NOT_FOUND) are preferred when the resource type is known.
- **Safe message:** "The requested resource does not exist or is not visible to you."
- **Extensions:** none.
- **FE behavior:** Not-found page/state; no logout, no retry loop.

#### FORBIDDEN
- **Status:** 403
- **Trigger:** Authenticated but role or object permission denied: member on admin-only modules (users, task archive, client admin mutations, archived views — BR-006/015), member editing a task they neither created nor are assigned to (BR-013, FLOW-003), CSRF/Origin failures (see CSRF_INVALID).
- **Safe message:** "You do not have permission to perform this action."
- **Extensions:** none.
- **FE behavior:** Render a forbidden state in place (AUTH-FE-002); NO redirect and NO logout; hide the action where possible but never rely on hiding alone.

#### INTERNAL_ERROR
- **Status:** 500
- **Trigger:** Any unhandled server error. Never contains stack traces, SQL, or secrets (API-004, NFR-OBS-001). A Prisma P2002 is never a 500 (mapped to 409).
- **Safe message:** "Something went wrong on our side. Please try again later."
- **Extensions:** none.
- **FE behavior:** Error boundary with a retry action; log the `traceId` for support correlation.

### 3.8 Extra Codes (completeness — not in the minimum list)

#### CONCURRENT_MODIFICATION
- **Status:** 409
- **Trigger:** The bounded retry (max 3 attempts) on the serializable last-admin transaction is exhausted (Prisma P2034) — persistent concurrency on admin demotion/deactivation (USR-005, ADR-004).
- **Safe message:** "The account was modified concurrently. Please review the current state and try again."
- **Extensions:** none (UI may re-fetch the user).
- **FE behavior:** Show the current state; let the user retry the action deliberately; never auto-retry.

#### REASSIGNMENT_REQUIRED
- **Status:** 422
- **Trigger:** `POST /users/{userId}/deactivate` without `reassignments` while the target has active assigned tasks (FR-USR-005).
- **Safe message:** "Assign the user's active tasks to another active member before deactivating."
- **Extensions:** `errors[]` with `{ field: "reassignments", code: "REASSIGNMENT_REQUIRED" }`; the client should have already loaded the impact via `GET /users/{userId}/deactivation-impact`.
- **FE behavior:** Open the reassignment flow listing `assignedTasks` from the impact endpoint; collect a new active assignee per task; resubmit.

### 3.9 Traceability (permission-matrix draft codes → catalogue)

| Draft code (matrix/edge cases) | Canonical catalogue code |
|---|---|
| VERSION_CONFLICT | STALE_VERSION |
| EMAIL_CONFLICT | EMAIL_ALREADY_EXISTS |
| ASSIGNEE_INACTIVE | INACTIVE_ASSIGNEE |
| ACTIVE_TASK_REQUIRES_ASSIGNEE | ASSIGNEE_REQUIRED |
| CSRF_FAILED | CSRF_INVALID |
| TASK_ALREADY_ARCHIVED (double archive) | TASK_ARCHIVED (409, no-op, no second event) |
| (client write to archived) | CLIENT_ARCHIVED |

### 3.10 HTTP Status Semantics (recap)

- **400** syntactic validation (formats, lengths, unknown DTO properties, pagination limits).
- **401** unauthenticated or invalid session (absent/expired/invalid token, deactivated user with valid token) — FE logs out.
- **403** authenticated but denied (role, object relationship, CSRF/Origin) — FE renders forbidden, never logs out.
- **404** not found or not visible (BOLA-safe).
- **409** state conflict (stale version, last admin, duplicate email, write to archived resource, double archive, concurrent modification).
- **422** business-rule violation (BR-004/008/009/010/012, FR-CLI-006, REASSIGNMENT_REQUIRED).
- **429** rate limited (login 5/60 s + 300 s block; global 100/60 s).
- **500** unexpected (never leaks internals).
