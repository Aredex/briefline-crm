# Briefline CRM — API & Architecture Reference

**Date:** 2026-08-12
**Status:** Living document — reflects the current code (controllers, Prisma schema, router).
**Source of truth:** `apps/api/src/modules/*/*.controller.ts`, `apps/api/prisma/schema.prisma`, `packages/api-contract/openapi.yaml`, `apps/web/src/router.tsx`.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [API Conventions](#2-api-conventions)
3. [API Endpoints](#3-api-endpoints)
4. [Authentication Flow](#4-authentication-flow)
5. [Authorization (RBAC)](#5-authorization-rbac)
6. [Data Model](#6-data-model)
7. [Concurrency](#7-concurrency)
8. [Rate Limiting](#8-rate-limiting)
9. [Frontend Routes](#9-frontend-routes)
10. [API Contract & Error Catalog](#10-api-contract--error-catalog)

---

## 1. Architecture Overview

Briefline CRM is a task & client management system for small creative teams. It is a **pnpm monorepo** with a **NestJS REST API**, a **React SPA**, a **shared contract package**, and **PostgreSQL** persistence.

```
briefline-crm/
├── apps/
│   ├── api/          # NestJS 11 REST API (port 3000)
│   └── web/          # React 19 SPA (Vite 8, port 5173)
├── packages/
│   └── api-contract/ # OpenAPI 3.1 spec + generated Prisma client types
├── docker/
│   └── compose.yml   # PostgreSQL 17-alpine (dev)
├── scripts/
│   └── smoke-test.sh # Post-deploy verification
└── docs/             # PRD, decision log, plans, this reference
```

### 1.1 Technology Stack

| Layer | Technology |
|---|---|
| API framework | NestJS 11 (Express 5 platform), TypeScript |
| ORM / database | Prisma 7.9.1 (`prisma-client` generator + `@prisma/adapter-pg` driver adapter) / PostgreSQL 17 (Neon on production, Docker locally) |
| Frontend | React 19, Vite 8, TanStack Query 5, React Router 7 (data mode), dnd-kit, Zod 4 |
| Validation | class-validator / class-transformer via a global `AppValidationPipe` (`forbidNonWhitelisted`, 100 KB body limit) |
| Testing | Vitest (unit + Testcontainers integration), Playwright (E2E), MSW, axe-core |
| Security | Helmet, CORS allowlist, cookie-parser, csrf-csrf 4.0.3, @nestjs/throttler, Argon2id, JWT HS256 |

### 1.2 Request Pipeline

The global prefix is `/api` with **URI versioning** (`v1`), so all endpoints live under `/api/v1`. Middleware and guard order is fixed (see `main.ts` / `app.module.ts`):

```
helmet → Cache-Control: no-store (for /api) → CORS (credentials, allowlist)
  → cookie-parser → compression → trust proxy (1 hop)
  → [OriginValidation → CSRF] middlewares
  → ThrottlerGuard → JwtAuthGuard (@Public opt-out) → RolesGuard
  → routes (ProblemDetailsFilter renders every error as RFC 9457)
  → production only: ServeStaticModule (SPA) as final fallback
```

- **NestJS** serves the API; in production it also serves the built Vite SPA from a single origin (`apps/web/dist`), so API and UI share one domain and cookies work without CORS.
- In development, the Vite dev server proxies `/api` to `:3000`.
- Health checks are public; everything else requires a session unless marked `@Public()`.

---

## 2. API Conventions

| Convention | Value |
|---|---|
| Base URL | `/api/v1` |
| IDs | UUID v4 strings (`:id` params validated by `ParseUUIDPipe`; malformed → `400 INVALID_FORMAT`, never a Prisma 500) |
| Dates | ISO 8601 — date-only `YYYY-MM-DD` for deadlines (`dueDate`), datetime `YYYY-MM-DDTHH:mm:ss.sssZ` (UTC) for timestamps |
| Pagination | `?page=1&limit=25` (defaults `page=1`, `limit=25`; max `limit=100`; `limit > 100` → 400) |
| Response envelope | Collection: `{ "data": [...], "meta": { "page", "limit", "total" } }` · Single: `{ "data": { ... } }` |
| Errors | `application/problem+json` (RFC 9457): `type`, `title`, `status`, `detail`, `instance`, `traceId`, `code`, optional `errors[]` and domain extensions |
| Auth | HttpOnly cookie JWT (`briefline-token`; `__Host-briefline-token` in production) + `X-CSRF-Token` header on every unsafe method |
| Sort (contractual) | Board and My Tasks: priority desc (`URGENT`→`LOW`), due date asc (nulls last), `updatedAt` desc — deterministic server-side, no manual card order |
| Length limits | name 100 · email 254 · company 160 · industry 80 · contact name 100 · phone 32 · notes 2000 · task title 160 · description 5000 · blocked reason 500 · search `q` 100 · password 8–72 · comment 2000 · checklist item 500 · label name 50 · label color 7 (`#RRGGBB`) |
| Optimistic locking | Every task mutation requires `expectedVersion`; stale → `409 STALE_VERSION` with `currentVersion` + `currentState` |

### HTTP Status Semantics

| Status | Meaning |
|---|---|
| `400` | Syntactic validation: formats, lengths, unknown DTO properties, pagination limits |
| `401` | Unauthenticated or invalid session (absent/expired/invalid token, deactivated user with valid token). FE clears session and redirects to `/login` |
| `403` | Authenticated but denied (role, object relationship, CSRF/Origin). FE renders a forbidden state, **never** logs out |
| `404` | Not found **or not visible** (BOLA-safe — never distinguishes "missing" from "hidden") |
| `409` | State conflict: stale version, last active admin, duplicate email, write to archived resource, double archive, concurrent modification |
| `422` | Business-rule violation (BR-004/008/009/010, FR-CLI-006, reassignment required) |
| `429` | Rate limited (login 5/60 s + 300 s block; global 100/60 s) |
| `500` | Unexpected — never leaks stack traces, SQL, or secrets |

---

## 3. API Endpoints

### 3.1 Health

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/health` | Public | Liveness probe for the hosting platform. Returns `200 { status: "ok", timestamp }` whenever the process is up — deliberately **no database touch** (a liveness probe must report on the process, not external dependencies). |

### 3.2 Auth

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/auth/csrf` | Public | Issues a signed double-submit CSRF token bound to the session id (the JWT cookie value, or `anonymous` pre-auth). Sets/refreshes the `csrf-token` HttpOnly cookie and returns the raw token in the body. Call before login and again after any CSRF failure. |
| `POST` | `/auth/login` | Public (CSRF required, throttled) | Logs in. Body: `{ email, password }`. Sets the JWT HttpOnly cookie, rotates the CSRF binding, updates `lastLoginAt`, returns `{ data: { csrfToken, user } }`. Any failure — unknown email, wrong password, or inactive user — returns the identical generic `401 INVALID_CREDENTIALS` (no account-status enumeration). |
| `POST` | `/auth/logout` | Authenticated | Clears the JWT cookie and rotates the CSRF binding. Idempotent (safe to double-click). Returns `{ data: { ok: true } }`. Local logout only — no server-side session store. |
| `GET` | `/auth/me` | Authenticated | Current user resolved from the JWT cookie. The DB is re-read on every request and the user must still be `ACTIVE` (a deactivated user receives 401 even with a valid token). Never exposes `passwordHash`. |

**`AuthUser` / `UserResponse` shape:**

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "email": "admin@briefline.demo",
  "name": "Alicia Martin",
  "role": "ADMIN",
  "status": "ACTIVE",
  "lastLoginAt": "2026-08-11T07:42:18.000Z",
  "createdAt": "2026-01-05T09:00:00.000Z",
  "updatedAt": "2026-08-11T07:42:18.000Z"
}
```

**Errors:** `401 INVALID_CREDENTIALS` (login) · `403 CSRF_INVALID` · `429 RATE_LIMITED` · `400 VALIDATION_ERROR` · `401 TOKEN_EXPIRED/TOKEN_INVALID/INACTIVE_USER` (me/logout).

### 3.3 Users — Admin only

Class-level `@Roles(UserRole.ADMIN)` — every route in this controller is admin-only; a member receives `403`.

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/users` | Admin | Paginated user list. Filters: `q` (email/name, case-insensitive, max 100), `role`, `status`. Both ACTIVE and INACTIVE users returned. Never exposes `passwordHash`. |
| `POST` | `/users` | Admin | Creates a user with an initial password (Argon2id-hashed). Body: `{ name, email, password, role? }`. Email normalized (`trim().toLowerCase()`, ADR-002); duplicates → `409 EMAIL_ALREADY_EXISTS`. May create ACTIVE or INACTIVE. `201` + `Location: /api/v1/users/:id`. No public registration. |
| `PATCH` | `/users/:id` | Admin | Updates `name`, `role`, `status` only (allowlist DTO). Demoting or deactivating the **last active ADMIN** runs in a serializable transaction with bounded P2034 retry → `409 LAST_ADMIN`; retries exhausted → `409 CONCURRENT_MODIFICATION`. Deactivation is expressed as `{ status: "INACTIVE" }`; re-activation is allowed. |
| `GET` | `/users/:id/deactivation-impact` | Admin | Preview of deactivating the target (FR-USR-005): `{ userId, assignedCount, createdCount, requiresReassignment, assignedTasks: TaskSummary[] }`. Call this before confirming deactivation so the UI can collect reassignment choices. |

> Note: the PH-01 OpenAPI draft also documents `GET /users/{userId}` and `POST /users/{userId}/deactivate`; the current controller folded them into `PATCH /users/:id` (+ the impact endpoint). The controller is authoritative.

### 3.4 Profile — self only

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/profile` | Authenticated | Own profile (same shape as `/auth/me`). Never exposes `passwordHash`. |
| `PATCH` | `/profile` | Authenticated | Updates own `name` only (strict whitelist). Any other field (`role`, `status`, `email`) in the body → `400` (mass-assignment guard, NFR-SEC-005). |

### 3.5 Clients

Reads are team-wide (BR-005/006); mutations are admin-only.

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/clients` | Authenticated | Paginated list. Filters: `q` (company/contact, case-insensitive, max 100), `status`. ARCHIVED clients excluded by default; a member filtering for them gets an empty page (never 403). |
| `POST` | `/clients` | Authenticated | Creates a client; any active user may create (the creator is recorded). Body: `{ companyName, industry?, primaryContactName… }` — see shape below. `201` + `Location`. |
| `GET` | `/clients/:id` | Authenticated | Client detail **plus** paginated `relatedTasks` (no N+1), full `contacts` list (primary first) and last-5 `history` audit events, newest first. An archived client is visible only to admins; a member receives `404 CLIENT_NOT_FOUND` (BOLA-safe). |
| `GET` | `/clients/:id/history` | Authenticated | Append-only audit timeline (client mutations), newest first, paginated. Follows the detail view policy (member → 404 on ARCHIVED). |
| `PATCH` | `/clients/:id` | Admin | Updates `companyName`, `industry`, `contactName`, `contactEmail`, `phone`, `notes` (field-level allowlist). Writing to an ARCHIVED client → `409 CLIENT_ARCHIVED`. |
| `POST` | `/clients/:id/deactivate` | Admin | `ACTIVE → INACTIVE`. Already INACTIVE → 200 no-op. ARCHIVED → `409 CLIENT_ARCHIVED`. Relationships retained; no physical delete. |
| `POST` | `/clients/:id/archive` | Admin | `ACTIVE/INACTIVE → ARCHIVED`. Already ARCHIVED → `409 CLIENT_ARCHIVED` (defined idempotency). After archiving, new task associations are rejected with `422 CANNOT_ASSIGN_ARCHIVED_CLIENT`; existing task links remain. No un-archive route. |

**`ClientResponse` shape:**

```json
{
  "id": "33333333-3333-4333-8333-333333333333",
  "companyName": "Bluebird Coffee Co.",
  "industry": "Retail",
  "contactName": "Sofia Lindqvist",
  "contactEmail": "sofia@bluebirdcoffee.example",
  "phone": "+34 600 123 456",
  "notes": "Rebranding discussion scheduled for September.",
  "status": "ACTIVE",
  "createdBy": { "id": "11111111-1111-4111-8111-111111111111", "name": "Alicia Martin" },
  "createdAt": "2026-02-10T10:00:00.000Z",
  "updatedAt": "2026-08-02T09:00:00.000Z"
}
```

**`GET /clients/:id`** wraps it as `{ data: { client, relatedTasks: { data: TaskSummary[], meta }, contacts: ContactResponse[], history: ClientChangeResponse[] } }`.

**`ClientChangeResponse`:** `{ id, clientId, event, field, oldValue, newValue, actor: { id, name }, createdAt }` — `event` is a free-form string (`CREATED | FIELD_CHANGED | STATUS_CHANGED | ARCHIVED`), values JSON-serialized.

### 3.6 Contacts

Reads are team-wide; **every mutation is admin-only** (CONT-001).

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/contacts` | Authenticated | Paginated list. Filters: `q` (firstName/lastName/email, case-insensitive, max 100), `clientId` (UUID), `isPrimary` (`true`/`false`). Contractual sort: primary first, then lastName/firstName asc. |
| `POST` | `/contacts` | Admin | Creates a contact. Body: `{ clientId, firstName, lastName, email?, phone?, role? }`. Email optional, normalized, **unique per client** → `409 CONTACT_EMAIL_EXISTS`. Unknown client → `404 CLIENT_NOT_FOUND`. `isPrimary` not accepted here — use the primary route. `201` + `Location`. |
| `GET` | `/contacts/:id` | Authenticated | Contact detail. |
| `PATCH` | `/contacts/:id` | Admin | Updates `firstName`, `lastName`, `email`, `phone`, `role` (allowlist). |
| `POST` | `/contacts/:id/primary` | Admin | Marks the contact as primary for its client; the previous primary is unset in the same transaction (unique partial index per client). |
| `DELETE` | `/contacts/:id` | Admin | Physical delete (the MVP never deletes clients, but contacts are deletable child rows). Returns the deleted contact. |

**`ContactResponse` shape:**

```json
{
  "id": "55555555-5555-4555-8555-555555555555",
  "client": { "id": "33333333-3333-4333-8333-333333333333", "companyName": "Bluebird Coffee Co." },
  "firstName": "Sofia",
  "lastName": "Lindqvist",
  "email": "sofia@bluebirdcoffee.example",
  "phone": "+34 600 123 456",
  "role": "CEO",
  "isPrimary": true,
  "createdAt": "2026-05-04T09:30:00.000Z",
  "updatedAt": "2026-07-21T11:00:00.000Z"
}
```

### 3.7 Tasks

The controller is **not** class-level admin: reads and create are team-wide; object-level authorization lives in `tasks.policy.ts` and is enforced inside the mutation transaction. Only the archived view and the archive mutation carry `@Roles(UserRole.ADMIN)`.

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/tasks/board` | Authenticated | Board: separate `backlog` plus the four active columns (`PENDING`, `IN_PROGRESS`, `BLOCKED`, `COMPLETED`). Archived tasks excluded. Flat filters combine with AND: `status`, `priority`, `assigneeId`, `clientId`, `dueBefore`, `dueAfter`, `q` (title/description, max 100). Contractual sort per group (priority desc, due date asc nulls last, updatedAt desc). Response bounded by a server-enforced data cap. |
| `GET` | `/tasks/archived` | **Admin** | Separate paginated view of ARCHIVED tasks (FR-TASK-011). |
| `POST` | `/tasks` | Authenticated | Creates a task; creator = actor. Backlog tasks may be unassigned; creating an active task without an assignee → `422 ASSIGNEE_REQUIRED`; inactive assignee → `422 INACTIVE_ASSIGNEE`; BLOCKED without reason → `422 BLOCKED_REASON_REQUIRED`; archived client association → `422 CANNOT_ASSIGN_ARCHIVED_CLIENT`. Task create and its `CREATED` history event are atomic. `201` + `Location: /api/v1/tasks/:id`. Version starts at 1. |
| `GET` | `/tasks` | Authenticated | Paginated active task list (`TaskSummary[]`). |
| `GET` | `/tasks/:id` | Authenticated | Task detail (full `TaskResponse`) **plus** last-5 comments, newest first. Archived task → member 404, admin OK. |
| `PATCH` | `/tasks/:id` | Authenticated (object policy) | Field-level allowlist: `title`, `description`, `priority`, `assigneeId`, `clientId`, `dueDate`, `blockedReason`. `expectedVersion` **required** (stale → `409 STALE_VERSION` with `currentVersion` + `currentState`). Admins edit any task; members only tasks they created or are assigned to (else `403`). `assigneeId: null` unassigns (only in BACKLOG, else `422`). `blockedReason` only accepted while BLOCKED; leaving BLOCKED clears it (kept in history). A failed mutation changes neither Task nor TaskChange. |
| `PATCH` | `/tasks/:id/status` | Authenticated (object policy) | Free status transitions, including reopening COMPLETED. `expectedVersion` required. Entering BLOCKED needs a non-empty `blockedReason`; entering an active status needs an active assignee. UI drag-and-drop maps to this endpoint. |
| `POST` | `/tasks/:id/archive` | **Admin** | Records `archivedAt`/`archivedBy` and writes an `ARCHIVED` event. `expectedVersion` required. Already archived → `409 TASK_ARCHIVED` (no state change, no second event). Archived tasks are immutable; no un-archive route. |
| `GET` | `/tasks/:id/history` | Authenticated | Append-only change timeline, oldest first, one entry per successful mutation carrying the post-mutation version. Archived task history → member 404. No update/delete routes for history. |

**`TaskSummary`** (board cards, lists, my-tasks): `{ id, title, status, priority, assignee: UserRef|null, client: ClientRef|null, dueDate: string|null, version, updatedAt, labels: TaskLabelRef[] }`.

**`TaskResponse`** adds: `{ description, blockedReason, creator: UserRef, archivedAt, archivedBy: UserRef|null, createdAt, labels }`.

**`TaskDetailResponse`** = `TaskResponse` + `comments: TaskComment[]` (last 5, newest first).

**`BoardData`:** `{ backlog: TaskSummary[], columns: { PENDING, IN_PROGRESS, BLOCKED, COMPLETED } }`.

**`TaskChangeResponse`:** `{ id, taskId, version, event, field, oldValue, newValue, actor: { id, name }, createdAt }` — `event` ∈ `TaskChangeEvent` enum; `oldValue`/`newValue` JSON-serialized strings.

### 3.8 Comments (task-scoped)

**Append-only** — no PATCH/DELETE routes exist for comments (PC-03, COMM-001). Object-level authorization (task visibility, BOLA-safe) lives in `CommentsService` via `tasks.policy.canViewTask`.

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/tasks/:taskId/comments` | Authenticated | Appends a comment. Body: `{ content }` (1–2000 chars, trimmed). Author is always the authenticated actor — never accepted from the body. `201` + `Location`. |
| `GET` | `/tasks/:taskId/comments` | Authenticated | Paginated thread, newest first. |

**`CommentResponse`:** `{ id, taskId, content, author: { id, name }, createdAt }`.

### 3.9 Labels

A normalized team-wide catalogue (LAB-001) plus task-scoped assignment (LAB-002). Catalogue reads are team-wide; catalogue mutations are admin-only; assignment follows the task edit policy.

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/labels` | Authenticated | Full label catalogue. |
| `POST` | `/labels` | Admin | Creates a label. Body: `{ name, color? }` (name 1–50, unique → `409 LABEL_NAME_EXISTS`; color `#RRGGBB` regex-enforced, default `#6b7280`). `201` + `Location`. |
| `PATCH` | `/labels/:id` | Admin | Updates name/color. |
| `DELETE` | `/labels/:id` | Admin | Deletes the label; task assignments cascade (join rows vanish). |
| `POST` | `/tasks/:taskId/labels/:labelId` | Authenticated (task edit policy) | Assigns a label to a task (idempotent upsert — the composite PK makes duplicates impossible). Unknown label → `404 LABEL_NOT_FOUND`. |
| `DELETE` | `/tasks/:taskId/labels/:labelId` | Authenticated (task edit policy) | Removes the assignment. |

**`LabelResponse`:** `{ id, name, color, createdAt }` · **`TaskLabelRef`** (embedded in task payloads, alphabetical): `{ id, name, color }`.

### 3.10 Checklist (task-scoped)

Per-task checkbox list (PC-05, CHECK-001/002). Object-level authorization (task visibility for reads, task edit policy for mutations) lives in `ChecklistService` via `tasks.policy`. Note: the static `reorder` route must be declared before the parametric `:itemId` route (Express registration order).

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/tasks/:taskId/checklist` | Authenticated | Full item list, `sortOrder` ascending (id tiebreak). |
| `POST` | `/tasks/:taskId/checklist` | Authenticated | Appends an item. Body: `{ content }` (1–500 chars). `201` + `Location`. |
| `PATCH` | `/tasks/:taskId/checklist/reorder` | Authenticated (task edit policy) | Applies the full ordering atomically. Body: `{ items: [{ id, sortOrder }] }` (non-empty; `sortOrder >= 0`). |
| `PATCH` | `/tasks/:taskId/checklist/:itemId` | Authenticated (task edit policy) | Toggles `completed` and/or edits `content` — **compare-and-swap**: `expectedVersion` required, stale → `409 STALE_VERSION` (same pattern as `Task.version`). |
| `DELETE` | `/tasks/:taskId/checklist/:itemId` | Authenticated (task edit policy) | Removes the item. |

**`ChecklistItemResponse`:** `{ id, taskId, content, completed, sortOrder, version, createdAt, updatedAt }`.

### 3.11 Dashboard

All three are authenticated team-wide reads — no `@Roles` needed (permission-matrix rows 29–31).

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/dashboard/kpis` | Authenticated | Team-wide counts over all active tasks (both roles see the same numbers): `{ open, overdue, blocked, completedLast7Days }`. `overdue` = due date fully ended in Europe/Madrid. Archived excluded. Computed server-side only. |
| `GET` | `/dashboard/my-tasks` | Authenticated | Tasks assigned to the current user, active only, paginated. Contractual sort: priority desc, due date asc nulls last, updatedAt desc. |
| `GET` | `/dashboard/recent-activity` | Authenticated | Recent history events on tasks the caller can see, bounded, newest first. Members only receive events on active visible tasks; archived-task events are admin-only (no hidden-resource activity leak). |

**`ActivityItem`:** `{ id, type: TaskChangeEvent, taskId, taskTitle, actorName, occurredAt }`.

---

## 4. Authentication Flow

### 4.1 Session Cookie (JWT)

- **Token:** JWT, **HS256**, signed with `JWT_SECRET`, **8-hour lifetime** (no renewal — the user must log in again), issuer `briefline-api`, audience `briefline-web`.
- **Transport:** HttpOnly cookie.
  - Development / tests: `briefline-token`
  - Production: `__Host-briefline-token` (implies `Secure`, `Path=/`, no `Domain`)
  - Options: `HttpOnly; SameSite=Lax; Path=/; Max-Age=28800; Secure` (production).
- **Fallback:** a `Bearer` header is accepted for API clients that cannot manage cookies.
- `passwordHash` is Argon2id PHC and is **never** returned by the API.

### 4.2 CSRF — Signed Double-Submit

- `GET /auth/csrf` issues a signed token bound to the current session identifier (the JWT cookie value, or `anonymous` pre-auth). It sets the **`csrf-token` HttpOnly cookie** and returns the raw value in the body.
- The browser JS keeps the raw token **in memory only** — the cookie value is never exposed to JS.
- Every **unsafe method** (`POST`, `PATCH`, `PUT`, `DELETE`) must echo it in the **`X-CSRF-Token`** header. `GET`/`HEAD`/`OPTIONS` bypass the CSRF middleware.
- The token is **rotated on login and logout**, so a token from a previous session is invalid → `403 CSRF_INVALID`.
- **Origin validation** middleware runs before CSRF as defense in depth (a mismatched `Origin` also yields 403).
- CSRF semantics are `403` — never a logout.

### 4.3 Login / Logout / Me Sequence

```
1. GET  /api/v1/auth/csrf                    → { data: { csrfToken } }  (sets csrf-token cookie)
2. POST /api/v1/auth/login   X-CSRF-Token: <csrfToken>
     body: { email, password }
     → 200 { data: { csrfToken: <rotated>, user } }
     Set-Cookie: __Host-briefline-token=...; HttpOnly; SameSite=Lax; Max-Age=28800; Secure
     Set-Cookie: csrf-token=... (rotated binding)
3. All subsequent requests: cookie is sent automatically; unsafe methods add X-CSRF-Token.
4. GET  /api/v1/auth/me → current user; the DB is re-read every request and the user must be ACTIVE.
5. POST /api/v1/auth/logout (X-CSRF-Token) → { data: { ok: true } }; JWT cookie cleared, CSRF rotated.
```

### 4.4 Client-Side Semantics (contractual)

- **401** on any request → clear the session store and redirect to `/login?next=<original path>` (destination preserved). 401 is always treated as "please log in again", never as an error.
- **403** → render a forbidden state in place; never log out, never redirect.
- **429** → respect `retryAfterSeconds` before resubmitting.
- **409 STALE_VERSION** → roll back the optimistic update, render `currentState`, offer to retry on top of `currentVersion`.
- **5xx** → error boundary with retry; log the `traceId` for correlation.

---

## 5. Authorization (RBAC)

### 5.1 Roles and Status

- **Roles:** `ADMIN`, `MEMBER` (enum `UserRole`).
- **Status:** `ACTIVE`, `INACTIVE` (enum `UserStatus`). An INACTIVE user receives **401 on every request**, even with a valid token (checked by the global guard on each request).
- Guard chain: `ThrottlerGuard → JwtAuthGuard → RolesGuard`. Routes opt out of auth with `@Public()` (health, csrf, login).

### 5.2 Role Rules (Admin vs Member)

| Resource | ADMIN | MEMBER |
|---|---|---|
| Auth (login/logout/me/csrf) | ✅ | ✅ (me: must be ACTIVE) |
| Users (all routes) | ✅ | ❌ 403 (class-level `@Roles(ADMIN)`) |
| Profile (get/update own name) | ✅ | ✅ |
| Clients: list / get / create | ✅ | ✅ (team-wide reads; create by any active user) |
| Clients: update / deactivate / archive | ✅ | ❌ 403 |
| Contacts: list / get | ✅ | ✅ |
| Contacts: create / update / primary / delete | ✅ | ❌ 403 |
| Tasks: board / list / get / create / history | ✅ | ✅ (team-wide reads; create by any active user) |
| Tasks: update / status / labels assign / checklist mutations | ✅ any task | ✅ only tasks they **created or are assigned to** — otherwise `403 FORBIDDEN` (BR-013) |
| Tasks: archive / archived view | ✅ | ❌ 403 |
| Comments: create / list | ✅ | ✅ (on viewable tasks) |
| Labels: catalogue get | ✅ | ✅ |
| Labels: catalogue create / update / delete | ✅ | ❌ 403 |
| Dashboard (all three) | ✅ | ✅ (activity filtered to visible active tasks) |

### 5.3 Object-Level Permissions (`tasks.policy.ts`)

The single authorization surface for tasks — every read/write path routes through these pure predicates **inside the mutation transaction** (authorization and mutation commit atomically):

```typescript
canViewTask(actor, task):
  archived task  → actor.role === 'ADMIN'   // member gets 404 (BOLA-safe)
  active task    → true                     // team-wide view

canEditTask(actor, task):
  archived task  → false                    // admin → 409 TASK_ARCHIVED; member → 404
  admin          → true                     // BR-014
  member         → task.creatorId === actor.id || task.assigneeId === actor.id  // BR-013

canArchiveTask(actor, task):
  admin && !task.archivedAt
```

### 5.4 BOLA Protection

Hidden resources are indistinguishable from missing ones: a member requesting an archived task/client receives **404**, never 403 and never a hint that the resource exists. The same applies to activity feeds (no hidden-resource activity leak).

---

## 6. Data Model

Location: `apps/api/prisma/schema.prisma` (Prisma 7.9.1, generated client output to `apps/api/src/generated/prisma` — moved inside `apps/api` by the render-build-path-fix plan, ADR-005; it has no consumers outside this package, so the integration contract stays `openapi.yaml` + `api-types.ts` only).

### 6.1 Enums

| Enum | Values |
|---|---|
| `UserRole` | `ADMIN`, `MEMBER` |
| `UserStatus` | `ACTIVE`, `INACTIVE` |
| `ClientStatus` | `ACTIVE`, `INACTIVE`, `ARCHIVED` |
| `TaskStatus` | `BACKLOG`, `PENDING`, `IN_PROGRESS`, `BLOCKED`, `COMPLETED` |
| `TaskPriority` | `LOW`, `MEDIUM`, `HIGH`, `URGENT` |
| `TaskChangeEvent` | `CREATED`, `TITLE_CHANGED`, `STATUS_CHANGED`, `PRIORITY_CHANGED`, `ASSIGNEE_CHANGED`, `DUE_DATE_CHANGED`, `ARCHIVED`, `REOPENED` |

### 6.2 Models

#### User
| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | `@default(uuid())` |
| `email` | VarChar(254) **unique** | Normalized `trim().toLowerCase()` (ADR-002) |
| `name` | VarChar(100) | |
| `role` | `UserRole` | default `MEMBER` |
| `status` | `UserStatus` | default `ACTIVE` |
| `passwordHash` | VarChar(255) | Argon2id PHC string, never exposed |
| `lastLoginAt` | Timestamptz(6) | set only at login |
| `createdAt` / `updatedAt` | Timestamptz(6) | |

Relations: `createdClients` (creator), `createdTasks`, `assignedTasks`, `archivedTasks`, `taskChanges` (actor), `clientChanges` (actor), `comments` (author).

#### Client
| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `companyName` | VarChar(160) | |
| `industry` | VarChar(80) ? | |
| `contactName` | VarChar(100) | |
| `contactEmail` | VarChar(254) | normalized (ADR-002) |
| `phone` | VarChar(32) ? | |
| `status` | `ClientStatus` | default `ACTIVE` |
| `notes` | VarChar(2000) ? | |
| `createdById` | UUID FK → User | `onDelete: Restrict` |
| `createdAt` / `updatedAt` | | |

Relations: `creator`, `tasks`, `contacts`, `changes`. Indexes on `status`, `companyName`, `createdById`.

#### Contact
| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `clientId` | UUID FK → Client | `onDelete: Cascade` (child of client) |
| `firstName` / `lastName` | VarChar(100) | |
| `email` | VarChar(254) ? | normalized; `@@unique([clientId, email])` — no duplicate emails per client |
| `phone` | VarChar(32) ? | |
| `role` | VarChar(80) ? | e.g. "CEO", "Design Lead" |
| `isPrimary` | Boolean | default `false`; at most one per client (unique partial index added in migration) |
| `createdAt` / `updatedAt` | | |

#### Task
| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `title` | VarChar(160) | |
| `description` | VarChar(5000) ? | |
| `status` | `TaskStatus` | default `BACKLOG` |
| `priority` | `TaskPriority` | default `MEDIUM` |
| `assigneeId` | UUID FK → User ? | required when status ≠ BACKLOG (BR-009, app-enforced); `onDelete: SetNull` |
| `clientId` | UUID FK → Client ? | archived-client association rejected by the app (FR-CLI-006); `onDelete: Restrict` |
| `dueDate` | Date ? | date-only deadline (ADR-003) |
| `blockedReason` | VarChar(500) ? | required iff BLOCKED (BR-010); cleared on unblock (BR-011) |
| `creatorId` | UUID FK → User | `onDelete: Restrict` |
| `version` | Int | default 1; **optimistic lock** (ADR-004); `CHECK version >= 1` added in migration |
| `archivedAt` / `archivedById` | Timestamptz(6) ? / UUID FK ? | archived marker (BR-016) |
| `createdAt` / `updatedAt` | | |

Relations: `assignee`, `client`, `creator`, `archiver`, `changes`, `comments`, `labels` (through `TaskLabel`), `checklistItems`. Composite index `[status, priority, dueDate, updatedAt]` for the board slice + sort.

#### Label
| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `name` | VarChar(50) **unique** | normalized catalogue (LAB-001); duplicate → 409 `LABEL_NAME_EXISTS` (P2002 mapped) |
| `color` | VarChar(7) | default `#6b7280`; `#RRGGBB` regex-enforced at the DTO |
| `createdAt` | Timestamptz(6) | `@map("created_at")` |

#### TaskLabel (join table)
| Field | Type | Notes |
|---|---|---|
| `taskId` + `labelId` | UUIDs, **composite PK** | duplicate assignment impossible at the DB level; both FKs `onDelete: Cascade` |

#### Comment
| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `taskId` | UUID FK → Task | `onDelete: Cascade` (child of task) |
| `authorId` | UUID FK → User | `onUpdate: Cascade`; always the authenticated actor |
| `content` | VarChar(2000) | append-only — no update/delete routes |
| `createdAt` | Timestamptz(6) | `@map("created_at")` |

#### ChecklistItem
| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `taskId` | UUID FK → Task | `onDelete: Cascade` (child of task) |
| `content` | VarChar(500) | |
| `completed` | Boolean | default `false` |
| `sortOrder` | Int | default 0; display order (ascending, id tiebreak) |
| `version` | Int | default 1; optimistic lock (CAS + 409 `STALE_VERSION`, same pattern as Task) |
| `createdAt` / `updatedAt` | | `@map("created_at" / "updated_at")` |

#### TaskChange (append-only history)
| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `taskId` | UUID FK → Task | `onDelete: Restrict` — history survives task changes |
| `actorId` | UUID FK → User | `onDelete: Restrict` |
| `event` | `TaskChangeEvent` | |
| `field` | VarChar(50) ? | changed field name |
| `oldValue` / `newValue` | VarChar(2000) ? | JSON-serialized |
| `createdAt` | Timestamptz(6) | |

Index `[taskId, createdAt]` for the history timeline.

#### ClientChange (append-only client audit)
| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `clientId` | UUID FK → Client | `onDelete: Cascade` (child of client) |
| `actorId` | UUID FK → User | `onDelete: Restrict` |
| `event` | VarChar(50) | **free-form** (not an enum) so new event types need no DB migration: `CREATED | FIELD_CHANGED | STATUS_CHANGED | ARCHIVED` |
| `field` | VarChar(50) ? | |
| `oldValue` / `newValue` | Text ? | JSON-serialized |
| `createdAt` | Timestamptz(6) | |

### 6.3 Relationship Summary

```
User 1───* Client (creator, Restrict)        User 1───* Task (creator/assignee/archiver)
Client 1───* Task (Restrict on delete)       Client 1───* Contact (Cascade)
Task 1───* TaskChange (Restrict)             Client 1───* ClientChange (Cascade)
Task 1───* Comment (Cascade)                 Task 1───* ChecklistItem (Cascade)
Task *───* Label via TaskLabel (Cascade both)
```

---

## 7. Concurrency

### 7.1 Optimistic Locking (`expectedVersion`)

Every task mutation requires the version the client last saw (`expectedVersion`):

- `PATCH /tasks/:id` (update)
- `PATCH /tasks/:id/status` (status transition)
- `POST /tasks/:id/archive` (archive)

The compare-and-swap runs **inside the mutation transaction**. If `expectedVersion` does not match the current `Task.version`, the server returns:

```json
409 Conflict — application/problem+json
{
  "type": "https://briefline-crm.demo/errors/stale-version",
  "title": "Stale version",
  "status": 409,
  "detail": "This task was modified by someone else. Review the current state and retry.",
  "code": "STALE_VERSION",
  "currentVersion": 5,
  "currentState": { "title": "...", "status": "IN_PROGRESS", "priority": "URGENT", ... }
}
```

- **Neither `Task` nor `TaskChange` is written** on a failed mutation (guaranteed for every 400/403/404/409/422 failure, BR-018).
- The FE rolls back its optimistic update, renders `currentState`, and offers a retry on top of `currentVersion` (one pending mutation per task).
- On success the version increments by 1 and a history event records the post-mutation version.
- `ChecklistItem.version` uses the identical CAS pattern for toggle/content updates (`PATCH /tasks/:taskId/checklist/:itemId`).

### 7.2 Serializable Guard — Last Active Admin

Demoting or deactivating the last active ADMIN runs in a **serializable transaction with bounded P2034 retry** (max 3 attempts):

- Violation of the invariant → `409 LAST_ADMIN` ("At least one active administrator must remain.")
- Retries exhausted under persistent concurrency → `409 CONCURRENT_MODIFICATION`

### 7.3 DB-Level Guard Rails

- `CHECK version >= 1` on `Task.version` and `ChecklistItem.version` (added in the initial migration).
- `@@unique([clientId, email])` on Contact → duplicate contacts per client are impossible at the DB level (mapped to `409 CONTACT_EMAIL_EXISTS`).
- `@@unique([name])` on Label → duplicate catalogue entries are impossible (mapped to `409 LABEL_NAME_EXISTS`).
- Composite PK `(taskId, labelId)` on TaskLabel → duplicate label assignments are impossible (API upserts → idempotent no-op).

---

## 8. Rate Limiting

Configured in `AppModule` via `ThrottlerModule.forRoot` with the global `ThrottlerGuard` as an `APP_GUARD`:

| Tier | Limit | Window | Notes |
|---|---|---|---|
| `default` (global, per IP) | 100 requests | 60 s | Applies to every route |
| `auth` | 100 requests (placeholder) | 60 s | Exists only so the per-route login override can reference it — named throttlers apply to all routes, so a hard global cap here would starve `GET /auth/csrf` |

**Per-route override — `POST /auth/login`** (`@Throttle`):

| Environment | Limit | Window | Block |
|---|---|---|---|
| Production | 5 attempts | 60 s | 300 s |
| Development | 50 attempts | 60 s | 5 s |

Exceeding the limit returns `429 RATE_LIMITED` (RFC 9457) with `retryAfterSeconds` in the body and the `Retry-After` header. `trust proxy` is set to 1 hop so IP attribution stays accurate behind the reverse proxy.

---

## 9. Frontend Routes

React Router v7 data mode (`apps/web/src/router.tsx`). Loaders run outside React and consult the module-level session store; on deep-link refreshes (empty in-memory session) they hit `GET /auth/me`.

**Auth gates:** `requireAuth` → redirect `/login?next=<original path>` when signed out · `requireAdmin` → redirect `/403` (never logout) when a MEMBER.

| Path | Page | Auth |
|---|---|---|
| `/` | Landing | Public |
| `/login` | Login | Public (already signed in → redirect `/dashboard`) |
| `/dashboard` | Dashboard | Authenticated |
| `/tasks` | Board | Authenticated |
| `/tasks/list` | Task list | Authenticated |
| `/tasks/archived` | Archived tasks | **Admin** |
| `/tasks/:taskId` | Task detail | Authenticated |
| `/clients` | Client list | Authenticated |
| `/clients/new` | Client create | Authenticated |
| `/clients/:clientId` | Client detail | Authenticated |
| `/contacts` | Contact list | Authenticated |
| `/contacts/new` | Contact create | **Admin** |
| `/contacts/:contactId` | Contact detail | Authenticated |
| `/contacts/:contactId/edit` | Contact edit | **Admin** |
| `/users` | Users | **Admin** |
| `/profile` | Profile | Authenticated |
| `/403` | Forbidden | Public |
| `/404` · `*` | Not found | Public |

The router is a module-scope singleton for production (`createBrowserRouter` created once, AP-46); tests build a fresh router per test.

---

## 10. API Contract & Error Catalog

### 10.1 OpenAPI Specification

- **Location:** `packages/api-contract/openapi.yaml` — OpenAPI **3.1.0**, errors modeled after **RFC 9457** (Problem Details).
- The spec documents: auth, users, profile, clients, contacts, tasks, dashboard, and health. **Comments, labels, and checklist routes are implemented but not yet mirrored in the YAML** — the controllers (`comments.controller.ts`, `labels.controller.ts`, `checklist.controller.ts`) are the authoritative source for those.
- Security schemes: `cookieAuth` (apiKey in cookie, name `briefline-token`) and `csrfHeader` (header `X-CSRF-Token`). The global security applies `cookieAuth` to every operation; unsafe methods additionally declare `csrfHeader`.
- Swagger UI is **not** mounted in the current API bootstrap (`main.ts` has no `SwaggerModule`); the YAML is the machine-readable contract.
- The API is served same-origin: in production Nest serves the SPA, in development Vite proxies `/api` to `:3000`.

### 10.2 Error Response Shape (RFC 9457)

Every error is `application/problem+json`:

```json
{
  "type": "https://briefline-crm.demo/errors/<code-slug>",
  "title": "Invalid credentials",
  "status": 401,
  "detail": "The email or password is incorrect.",
  "instance": "/api/v1/auth/login",
  "traceId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "code": "INVALID_CREDENTIALS",
  "errors": [
    { "field": "email", "message": "Invalid format", "code": "INVALID_FORMAT" }
  ]
}
```

Guarantees: stable `type` URI · safe, user-presentable `detail` (no stack traces, SQL, internal ids, or secrets) · `traceId` correlated with the structured log entry · field-level `errors[]` on validation and some business conflicts · domain extensions allowed (e.g. `currentVersion`/`currentState` on `STALE_VERSION`, `retryAfterSeconds` on `RATE_LIMITED`).

### 10.3 Error Code Catalog

| Code | Status | Trigger |
|---|---|---|
| `INVALID_CREDENTIALS` | 401 | Login: unknown email, wrong password, or inactive user — always identical (no enumeration) |
| `INACTIVE_USER` | 401 | Valid JWT whose user was deactivated after token issue |
| `TOKEN_EXPIRED` | 401 | JWT `exp` passed (8 h lifetime; no renewal) |
| `TOKEN_INVALID` | 401 | Missing/malformed/wrong-signature token, non-HS256 algorithm, wrong iss/aud; general 401 fallback |
| `CSRF_INVALID` | 403 | Unsafe method without/invalid `X-CSRF-Token` (or stale after rotation); Origin-validation failure |
| `RATE_LIMITED` | 429 | Login throttle (5/60 s + 300 s block) or global throttle (100/60 s); `retryAfterSeconds` + `Retry-After` |
| `VALIDATION_ERROR` | 400 | DTO failures: wrong types, unknown properties (mass assignment), invalid pagination, field rules; `errors[]` per field |
| `INVALID_FORMAT` | 400 (field) | Wrong format: email, UUID, `YYYY-MM-DD` date, ISO datetime, number |
| `INVALID_ENUM` | 400 (field) | Value not in the enum (role, status, priority, task status, …) |
| `INVALID_LENGTH` | 400 (field) | Value violates a length limit |
| `EMAIL_ALREADY_EXISTS` | 409 | Normalized email duplicate on user create (P2002 mapped) |
| `LAST_ADMIN` | 409 | Demoting/deactivating the last active ADMIN (serializable, bounded P2034 retry) |
| `CONCURRENT_MODIFICATION` | 409 | Last-admin transaction retries (max 3) exhausted (P2034) |
| `USER_NOT_FOUND` | 404 | Unknown userId, or unknown assignee in task create/update |
| `CLIENT_NOT_FOUND` | 404 | Unknown clientId, or archived client requested/patched by a member (BOLA-safe) |
| `CLIENT_ARCHIVED` | 409 | Any write to an ARCHIVED client (update, deactivate, double archive) |
| `CONTACT_NOT_FOUND` | 404 | Unknown contactId |
| `CONTACT_EMAIL_EXISTS` | 409 | Duplicate email for the same client |
| `TASK_NOT_FOUND` | 404 | Unknown taskId, or archived task requested by a member (BOLA-safe) |
| `TASK_ARCHIVED` | 409 | Any mutation on an archived task by an admin; double archive is a 409 no-op with no second history event; `currentVersion` extension |
| `STALE_VERSION` | 409 | `expectedVersion` mismatch on task/checklist mutations; `currentVersion` + `currentState` extensions |
| `ASSIGNEE_REQUIRED` | 422 | Non-backlog task created/transitioned without an assignee, or unassigning a non-backlog task (BR-009) |
| `BLOCKED_REASON_REQUIRED` | 422 | Entering BLOCKED without a non-empty reason (BR-010) |
| `INACTIVE_ASSIGNEE` | 422 | Assigning a task to an INACTIVE user (BR-004) |
| `CANNOT_ASSIGN_ARCHIVED_CLIENT` | 422 | New task association to an ARCHIVED client (FR-CLI-006) |
| `LABEL_NOT_FOUND` | 404 | Unknown labelId on catalogue or assignment routes |
| `LABEL_NAME_EXISTS` | 409 | Duplicate label name (P2002 mapped) |
| `CHECKLIST_ITEM_NOT_FOUND` | 404 | Unknown checklist itemId |
| `NOT_FOUND` | 404 | Fallback for unknown/non-visible resource paths |
| `FORBIDDEN` | 403 | Authenticated but role or object permission denied; also CSRF/Origin failures |
| `INTERNAL_ERROR` | 500 | Unhandled server error — never leaks internals; Prisma P2002 is never a 500 |

Reserved (defined for catalogue completeness, not emitted in the MVP): `CANNOT_DEACTIVATE_SELF` (self-deactivation is allowed unless last active admin → `LAST_ADMIN`), `CANNOT_ARCHIVE_WITH_ACTIVE_TASKS` (archiving a client with active tasks is allowed in the MVP).

---

*Related documents: `README.md` (quick start) · `docs/02-prd.en.md` (requirements BR-001–020, FR-*) · `.claude/plans/adrs.md` (ADR-001..005) · `.claude/plans/permission-matrix.md` (31-operation matrix) · `.claude/plans/openapi-and-errors.md` (draft contract + full catalog) · `.claude/plans/data-model.md` (ERD).*
