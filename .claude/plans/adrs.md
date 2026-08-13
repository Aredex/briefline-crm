# Architecture Decision Records — Briefline CRM
**Date:** 2026-08-11
**Status:** PH-01 Draft
**References:** PRD v1, Decision Log, Baseline, PH-00 matrix, Backend API verification

---

## ADR-001: Cookie JWT, CSRF, and Same-Origin Authentication

**Status:** Proposed
**Owners:** ARCH, BE

### Context

The MVP needs password login (FR-AUTH-001..005), role authorization (BR-001, BR-003), and a safe public demo (OBJ-005). DEC-011 locks a simple JWT session with no registration, password recovery, or refresh tokens. DEC-032 locks an HttpOnly cookie JWT, same-origin, with CSRF protection, and forbids Web Storage. DEC-036 locks same-origin production: NestJS serves the built SPA. The baseline and PH-00 matrix forbid tokens in `localStorage`/`sessionStorage` (AP-04), opt-in auth (AP-01), `csurf` (AP-19, deprecated/archived, SNYK-JS-CSURF-3021144), `Access-Control-Allow-Origin: *` with credentials (AP-55), returning the CSRF cookie value to JS (AP-38), and `__Host-` prefixes on the CSRF cookie (AP-40). The baseline pins the security stack order: helmet → CORS → cookie-parser → Origin validation → CSRF → global guards (Throttler → JWT → Roles) → ValidationPipe.

### Decision

1. **Session token — JWT in HttpOnly cookie, no refresh token.**
   - Cookie name: `__Host-briefline-token` in production, `briefline-token` in local development. The `__Host-` prefix (which requires `Secure`, `Path=/`, and no `Domain` attribute) is used only on HTTPS production; local dev over http://localhost uses the unprefixed name. The name is resolved from one shared constant driven by `NODE_ENV`.
   - Cookie options (both environments): `httpOnly: true`, `sameSite: 'lax'`, `path: '/'`, `maxAge: 8 * 60 * 60 * 1000` (8 h). `secure: true` only in production.
   - Claims (exact set): `sub` = userId (UUID), `role` = `ADMIN` | `MEMBER`, `iss` = `briefline-api`, `aud` = `briefline-web`, `exp` = 8 h (28 800 s), `iat`. The user's email/status are NOT trusted from the token: every authenticated request re-reads the user from the database and re-checks `status = ACTIVE` (baseline derived requirement, AUTH-002). A deactivated user is rejected even with a valid token.
   - Algorithm: HS256 only, pinned at signing (`JwtModule.registerAsync` with `signOptions: { expiresIn: '8h', algorithm: 'HS256' }`) and at verification (passport-jwt strategy options: `algorithms: ['HS256']`, `issuer: 'briefline-api'`, `audience: 'briefline-web'`, `ignoreExpiration: false`). Secret from env `JWT_SECRET` (external, high entropy, Joi-validated `min(32)` at startup; startup blocks if missing — never a default or derived secret).
   - Token extraction: cookie first (`request.cookies[COOKIE_NAME]`), Bearer header fallback for API clients (verified `ExtractJwt.fromExtractors` pattern). Swagger documents the cookie via `addCookieAuth('briefline-token', { type: 'apiKey', in: 'cookie', name: 'briefline-token' }, 'cookie-auth')`.

2. **Login — `POST /api/auth/login`.**
   - `@Public()`, body `LoginDto` (`email` `@IsEmail` + `@MaxLength(254)`, `password` `@IsString` + `@Length(8, 72)`).
   - Email normalized per ADR-002 before lookup; password verified with Argon2id (OWASP: m=19456, t=2, p=1).
   - Any failure (unknown email, wrong password, inactive user) → single generic 401, no enumeration (FR-AUTH-002, BR-001).
   - Rate limited: `@Throttle({ auth: { limit: 5, ttl: seconds(60), blockDuration: seconds(300) } })` → 429 is contractual (NFR-SEC-004).
   - On success (via `@Res({ passthrough: true })`): set the JWT cookie (options above), update `lastLoginAt`, and return `{ csrfToken }` in the response body — a fresh CSRF token issued with the new session binding (CSRF rotation on login, AUTH-001). Login itself is CSRF-protected: the frontend fetches `GET /api/auth/csrf` before submitting.

3. **Logout — `POST /api/auth/logout`.** Authenticated (requires CSRF header). Clears the JWT cookie (`res.clearCookie` with the same name, path, secure, and sameSite options — idempotent, safe to double-click) and cleans up the CSRF binding (clear or rotate the `csrf-token` cookie so the old session-bound HMAC is no longer reusable). Local logout only; there is no server-side session store.

4. **`GET /api/auth/me`.** Authenticated. Returns the current user (id, email, name, role, status, lastLoginAt — no `passwordHash`, via `@Exclude`/ClassSerializerInterceptor) resolved from the JWT cookie.

5. **`GET /api/auth/csrf`.** `@Public()`. Returns `{ csrfToken }` from `generateCsrfToken(req, res)`, which also sets/refreshes the `csrf-token` cookie. The frontend keeps the token in memory and sends it as the `X-CSRF-Token` header on every unsafe method. The cookie value is never exposed to JS (AP-38).

6. **CSRF — signed double-submit, `csrf-csrf@4.0.3`.** Registered as a global middleware after cookie-parser and Origin validation, before the guards.
   - `getSecret: () => CSRF_SECRET` (env, Joi-validated `min(32)`); `getSessionIdentifier: (req) => req.cookies?.[JWT_COOKIE_NAME] ?? 'anonymous'` (HMAC bound to the JWT session — invalidates when the JWT cookie changes/clears); `cookieName: 'csrf-token'` (no `__Host-` prefix — AP-40); `cookieOptions: { sameSite: 'strict', path: '/', secure: isProduction, httpOnly: true }`; `size: 32`; `ignoredMethods: ['GET', 'HEAD', 'OPTIONS']`.
   - `X-CSRF-Token` header required on `POST`/`PATCH`/`PUT`/`DELETE`; failure → 403 `invalid csrf token` (RFC 9457). The security stack order is fixed: helmet → CORS (allowlist + `credentials: true`) → cookie-parser → Origin validation → CSRF → Throttler → JWT → Roles → ValidationPipe.

7. **Origin validation (defense in depth).** `NestMiddleware` applied to all routes: for unsafe methods, if the `Origin` header is present, compare its origin (parsed via `new URL(origin).origin`) against the allowlist from env `CORS_ORIGINS`; mismatch or malformed → 403. Absent `Origin` → pass (curl, server-to-server, same-origin navigations — AP-39). This is a second layer; the signed double-submit is the primary CSRF defense.

8. **Local development — same-origin via Vite proxy.** Vite dev server (`apps/web`) proxies `/api` → `http://localhost:3000` (`server.proxy`). The browser only ever talks to the Vite origin, so cookies flow without CORS configuration in dev; `http://localhost:5173` is included in `CORS_ORIGINS` for Origin validation.

9. **Production — same-origin, no CORS wildcard.** NestJS serves the SPA (ADR-005); all requests are same-origin and CORS is effectively inert. `app.enableCors` is configured with the explicit `CORS_ORIGINS` allowlist and `credentials: true`, never `Access-Control-Allow-Origin: *` (AP-55).

10. **401 vs 403 semantics (frontend contract).**
    - 401 (token absent, invalid, expired, or user deactivated): the frontend clears session/cache state and redirects to `/login`, preserving the intended destination (AUTH-FE-002/003).
    - 403 (valid token, insufficient role/object permission, or CSRF failure): NO redirect and NO logout; the UI renders a forbidden state in place (AUTH-FE-002 guard: "403 is not logout").

11. **Secure-by-default.** `APP_GUARD` with `JwtAuthGuard` (respecting `@Public()`) on every route; `RolesGuard` + object-level authorization in use cases for per-object BOLA checks (AP-02).

### Consequences

- XSS cannot exfiltrate the session token (HttpOnly, no Web Storage); CSRF is covered by three layers (SameSite=Lax + signed double-submit + Origin validation).
- Sessions are fixed-length (8 h) with no renewal — acceptable for a demo with demo accounts; logout is best-effort local since there is no revocation store.
- Cookie-based auth complicates non-browser clients slightly; the Bearer fallback covers API testing and scripts.
- `__Host-` naming doubles cookie-name logic (prod vs local), a small constant-driven conditional.
- Every authenticated request now hits the DB to re-check active status — negligible at demo scale, buys immediate deactivation enforcement (BR-001).

### Alternatives Considered

- **Web Storage tokens:** rejected — XSS-exfiltratable, violates AP-04 and DEC-032.
- **Refresh tokens / longer sessions:** rejected — DEC-011, locked execution decisions (no refresh token).
- **Server-side sessions (in-memory/DB):** rejected — adds state and revocation machinery to a stateless API without demo need.
- **`csurf` / `@otterjs/csrf-csrf`:** rejected — deprecated/archived with a known bypass (AP-19); `csrf-csrf@4.0.3` is the verified official-recommended replacement.
- **Cross-origin deployment with CORS cookies:** rejected — DEC-036; same-origin removes the hardest cookie/CORS problems.
- **`SameSite=Strict` for the JWT cookie:** rejected — locked decisions mandate `Lax`; top-level navigations (deep-link refresh) keep the session, and CSRF protection does not rely on SameSite alone.

---

## ADR-002: Case-Insensitive Email

**Status:** Proposed
**Owners:** ARCH, BE

### Context

BR-002: "User email is case-insensitively unique." Email is the login identifier (FR-AUTH-001) and is displayed in user lists (FR-USR-001). PostgreSQL/Prisma unique constraints on plain `text` columns are case-sensitive, so `admin@northstar.digital` and `Admin@Northstar.Digital` would otherwise be distinct accounts. The uniqueness rule must hold at the database level, not only in application code (DB-007 direct integrity tests). Locked execution decision: "Email is normalized with `trim().toLowerCase()` and protected by a unique constraint." Length limit for email: 254 (locked).

### Decision

1. **Single normalization helper.** `normalizeEmail(email: string): string` = `email.trim().toLowerCase()`. Applied in exactly two mandatory places, and nowhere else is the raw value used:
   - **Before write/hash:** at user creation and any email-bearing write, the value is normalized before being hashed (password hash) and before being stored. The `email` column stores ONLY the normalized value.
   - **Before query:** at login (and any email lookup), the input is normalized before the DB query. Because storage is already normalized, the lookup is inherently case-insensitive: `admin@northstar.digital` logs in as `Admin@Northstar.Digital` and vice versa.
   - DTOs apply it via `@Transform` so the application layer never sees raw casing.
2. **Unique constraint on the normalized value.** Prisma `@unique` on `User.email` (which stores the normalized form). There is no raw variant stored and no separate derived column: the normalized value IS the canonical stored value, so "case-insensitive uniqueness" falls out of the plain unique index. The constraint is row-local and enforced by PostgreSQL against direct writes too (DB-007).
3. **Login comparison.** Normalize input → `findUnique` by normalized email → `argon2.verify(passwordHash, password)` (constant-time). Invalid email and wrong password produce the identical generic 401 (FR-AUTH-002); nothing distinguishes "user not found" from "bad password".
4. **Conflict response.** A unique violation (Prisma `P2002`) on user creation is mapped to **409 Conflict** with RFC 9457 `application/problem+json`: `code: "EMAIL_ALREADY_EXISTS"`, safe message ("An account with this email already exists"), `traceId`. Stable and identical for every code path that creates a user (USR-002). A `P2002` is never a 500.
5. **Migration strategy (existing data).** Greenfield MVP has no production rows (deterministic seed runs after migrations), but the procedure is fixed in case the unique index must be added to a populated table:
   1. Audit duplicates: `SELECT lower(trim(email)) AS normalized, count(*) FROM "User" GROUP BY 1 HAVING count(*) > 1;`
   2. Resolve collisions explicitly and loudly (merge or deactivate) — the migration fails rather than truncate or skip.
   3. `UPDATE "User" SET email = lower(trim(email));` (idempotent).
   4. Create the unique index.
   The seed data is authored pre-normalized so step 3 is a no-op at first deploy.
6. **Invariant.** Two emails differing only in case (or surrounding whitespace) denote the same user. This governs login, uniqueness, display of the stored form, and — in Portfolio Complete — primary contact emails (same helper).

### Consequences

- No duplicate accounts can exist through casing, even via direct DB writes; login is forgiving of casing/whitespace, which matters for a public demo (FLOW-001/002).
- The stored form is always lowercase; the UI displays the canonical value (acceptable trade-off, no identity confusion).
- The invariant is only as strong as the helper being used everywhere — code review and DB-007 tests enforce "no raw path" (test: direct `INSERT` of a case-variant duplicate must fail the unique index).
- Conflict semantics become stable and testable: same 409 for create-user duplicates at API and DB level.

### Alternatives Considered

- **`citext` column type:** rejected — equivalent behavior but adds an extension dependency, does not trim, and still requires app-level normalization for the login hash pipeline; also complicates the Prisma schema/portability.
- **Functional unique index `lower(email)` storing raw:** rejected — two representations of the same logical value invite divergent queries and response mapping, with no benefit at this scale.
- **Case-sensitive storage + case-insensitive app checks only:** rejected — protection vanishes for direct DB writes and diverging code paths (violates DB-007 row-local constraints).

---

## ADR-003: Temporal

**Status:** Proposed
**Owners:** ARCH, BE

### Context

BR-019: dates are persisted in UTC and displayed in the browser time zone. BR-020: a date-only deadline expires at the end of that local day. Tasks have an optional due date (FR-TASK-006) and the dashboard shows overdue counts (FR-DASH-001). Locked execution decision: "Deadlines use PostgreSQL `date`; technical timestamps use `timestamptz` UTC; demo business time zone is `Europe/Madrid`."

### Decision

1. **Storage types (data model).**
   - **Deadlines (due dates): PostgreSQL `date`** — `Task.dueDate` as `DateTime @db.Date` in Prisma: a date with no time-of-day and no timezone. The API serializes it as `YYYY-MM-DD` only.
   - **Technical timestamps: PostgreSQL `timestamptz`** — `createdAt`, `updatedAt` (all entities), `lastLoginAt` (User), `TaskChange.createdAt`. Prisma `DateTime` with `@default(now())` / `@updatedAt` maps to `timestamptz`; all values are written and serialized as UTC (ISO 8601 with `Z`). **Never** `timestamp without time zone` for technical timestamps (ambiguous instants, DST errors).
2. **UTC everywhere in storage and API.** The server stores and returns absolute instants in UTC. No server-side local wall-clock values, no timezone conversions on write.
3. **Business timezone: `Europe/Madrid` (demo).** All day-boundary semantics for deadlines use Europe/Madrid as "local day". **No user timezone is stored** (single-timezone demo — a `user.timezone` column is explicitly out of scope; multi-timezone support would be a future, deliberate change).
4. **Browser rendering.** The frontend renders timestamps and due dates in the user's own browser timezone using `Intl.DateTimeFormat` (no manual offset arithmetic). Due dates display as a date (never a fake time); timestamps as local date + time.
5. **Overdue definition.** A task is overdue when its due date's day has fully ended in Europe/Madrid: the deadline instant is **23:59:59 Europe/Madrid of `dueDate`** (BR-020).
6. **Overdue computation (computed at query time, never stored).**
   - Backend (authoritative, SQL date-date comparison):
     `(CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Madrid')::date > due_date` — "current date in Europe/Madrid is after the due date". (`CURRENT_DATE` alone is only correct if the PostgreSQL session timezone is Europe/Madrid; the `AT TIME ZONE` form makes the boundary explicit and host-independent.)
   - Frontend display (same semantics): `dayjs.tz(dueDate, 'Europe/Madrid').endOf('day').isBefore(dayjs().tz('Europe/Madrid'))`.
   - Implementation note: `dayjs` + `dayjs/plugin/utc` + `dayjs/plugin/timezone` is **not** in the PH-00 matrix. It must be pinned and verified (Context7 + `npm view`) and added to the matrix before PH-02, or the identical semantics implemented with native `Intl`/`Temporal`. The formulas above are the required semantics regardless of the chosen library.
7. **Boundary tests (contractual).** A task due today is NOT overdue until 23:59:59 Europe/Madrid passes; a task due yesterday IS overdue from 00:00 Europe/Madrid. PH-10 includes an explicit temporal boundary test around this transition; dashboard KPI fixtures must agree (DASH-001, PH-10 verification "temporal boundary test").

### Consequences

- DST is never a bug source in storage (absolute instants); only the single business boundary is evaluated, and only against Europe/Madrid.
- Overdue KPI is deterministic and server-authoritative — the dashboard and the board filters cannot disagree with each other.
- Users in different timezones see the same Madrid-based overdue result; display is localized per browser but the judgment is not.
- Simple mental model: date-only in, date-only out; timestamps in UTC ISO out.

### Alternatives Considered

- **`timestamptz` with a 23:59 sentinel for deadlines:** rejected — sentinel time leaks into display and shifts across timezones; `date` is self-describing.
- **Store a per-user timezone:** rejected — locked decision; adds a column, per-user boundary logic, and migration surface for a single-timezone demo.
- **`timestamp without time zone` for technical timestamps:** rejected — ambiguous instants and DST-dependent wall-clock math; `timestamptz` is the safe default.
- **Overdue computed on the client only:** rejected — the dashboard/board KPIs must come from one authoritative source (the API) so UI and API never disagree.

---

## ADR-004: Concurrency

**Status:** Proposed
**Owners:** ARCH, BE

### Context

FR-TASK-012: keep a valid optimistic move or revert it with feedback on failure. NFR-REL-002: errors never leave the UI in a falsely optimistic state. DEC-034: optimistic locking via `Task.version`. BR-018/NFR-REL-001: a task mutation and its history entry are atomic. BR-003: the last active administrator cannot be demoted or deactivated. PH-01 guard: no mutation without Task `expectedVersion`. PH-04 (USR-005): serializable transaction with bounded P2034 retry survives concurrent demotions. PH-06 (TASK-API-005): stale writes return 409 with a safe current version/representation.

### Decision

1. **`Task.version`: integer, `NOT NULL`, default 1, `CHECK (version >= 1)`.** Every successful mutation increments it by exactly 1. Create starts at 1.
2. **`expectedVersion` is mandatory on every mutating request** (`PATCH`/`PUT` — field update, status change, archive) on tasks. The DTO rejects requests without it (PH-01 guard). Reads (`GET`) never require a version.
3. **Stale-write detection (compare-and-swap).**
   - SQL form: `UPDATE "Task" SET <fields>, "version" = "version" + 1 WHERE id = $1 AND version = $2;` — if `rowCount = 0` the write was stale.
   - Prisma form: `updateMany({ where: { id, version: expectedVersion }, data: { ..., version: { increment: 1 } } })`; if `count === 0`, disambiguate: task absent → 404; task present → **409 Conflict**.
   - The update runs inside the same interactive transaction as the history write (BR-018), with the authorization read (BR-013/014) — one `$transaction(async (tx) => {...})`, short, no network calls (R-5).
4. **409 response (RFC 9457).** `code: "STALE_VERSION"` with extensions so the UI can reconcile without a second request: `{ currentVersion, currentState: { status, assigneeId, priority, dueDate, ... } }` — the current server state of the task (public fields only, "safe representation"). A 409 never loses data and never hides the server's current state.
5. **UI recovery (TASK-FE-012/013).** On 409 the frontend rolls back the optimistic update (canonical cancel → snapshot → rollback → invalidate pattern), renders the server's `currentState`, and offers a path forward: re-attempt on top of `currentVersion` or manual resolution. 409 is not a destructive error — user intent is preserved. One pending mutation per task; out-of-order responses cannot corrupt the UI (TASK-FE-013).
6. **Last-admin protection (BR-003).** Demoting an admin to MEMBER or deactivating an admin runs inside `$transaction(async (tx) => {...}, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 10000 })`; the active-admin count (role = ADMIN, status = ACTIVE) is re-read inside the transaction before the change. A concurrent demotion/deactivation of the same admin triggers a serialization failure (Prisma `P2034`) → **bounded retry: maximum 3 attempts total** (no infinite retry). Outcomes:
   - Business rule violation (fewer than 1 active admin would remain) → 409 `code: "LAST_ADMIN"`, safe message.
   - Retries exhausted (persistent concurrency) → 409 `code: "CONCURRENT_MODIFICATION"` with problem details; the UI shows the current state and lets the user retry.
7. **History atomicity.** Each successful mutation produces exactly **one** `TaskChange` row (actor, event, field, oldValue, newValue) carrying the **new** post-mutation version number, committed in the same transaction as the task update. A failed mutation (validation, 403, 404, or stale 409) produces no `TaskChange` — proven by rollback tests (TASK-API-013: failure changes neither Task nor TaskChange).
8. **No server-side retry for task mutations.** Only the client re-submits after reconciling a 409. Server-side retry is reserved for the last-admin serializable transaction, bounded at 3.

### Consequences

- Silent overwrites are impossible; every lost update becomes a visible, actionable 409 with the state needed to reconcile.
- Every mutation path carries version plumbing (DTOs, OpenAPI, history), which is a small but universal cost.
- Last-admin protection is race-free without holding a table lock: serialization + bounded retry adds latency only in contended demotion scenarios, negligible at demo scale.
- History stays 1:1 with successful mutations, which keeps the audit trail trustworthy (FR-HIST-004).

### Alternatives Considered

- **Last-write-wins without locking:** rejected — silent overwrites violate DEC-034 and NFR-REL-002.
- **Pessimistic row locks on every task mutation:** rejected — blocking and complexity without need at demo scale; reserved for the one high-stakes operation (last-admin) where a serializable transaction is used.
- **`updatedAt`-based versioning:** rejected — integer `version` is monotonic, human-readable, trivially comparable, and supports the `CHECK (version >= 1)` row-local constraint (DB-002/003).
- **Unbounded retry on serialization failures:** rejected — must fail loudly after a bounded number of attempts; no infinite loops in write paths.

---

## ADR-005: Monorepo and Unified Build

**Status:** Proposed
**Owners:** ARCH

### Context

DEC-031: monorepo with `apps/web`, `apps/api`, and a versioned OpenAPI contract so FE and BE work in parallel without manually duplicated models. Locked execution decisions: pnpm workspaces; OpenAPI is the integration boundary; React 19 + Vite + NestJS 11 on Node 24 LTS; same-origin production where Nest serves the built SPA (DEC-036); Vite proxies `/api` locally. PH-02 (REP-001/REP-006): clean reproducible install with frozen lockfile; contract generation deterministic and never hand-edited. PH-00 matrix: pnpm 10, Node 24.19.0 LTS, TypeScript 5.9.3, `ubuntu-24.04` runner.

### Decision

1. **Workspace layout (pnpm workspaces).**
   - `apps/web` — React 19 + Vite 8 SPA (FE-owned).
   - `apps/api` — NestJS 11 API (BE-owned).
   - `packages/api-contract` — the OpenAPI v1 document plus generated TypeScript types (ARCH-owned; any change requires FE + BE review).
   - One root `package.json`; one committed `pnpm-lock.yaml`; a single TypeScript 5.9.3 at the root; Node 24.19.0 LTS enforced by `engines` (REP-002: incompatible runtime fails clearly).
2. **Contract package (integration boundary).** The OpenAPI v1 spec produced in PH-01 is the single source of truth. Generated TypeScript types are produced by a deterministic generation step, checked in, and regenerated via a root script; regeneration must produce no diff (REP-006). Generated files are never hand-edited, and no third hand-written shared model exists (PH-02 guard). Both `apps/api` (DTO validation shapes) and `apps/web` (client types, mocks) import from `packages/api-contract`; mock handlers and fixtures derive from the OpenAPI examples.
3. **Local development.** `pnpm dev` at the root starts the API (NestJS on `http://localhost:3000`) and the Vite dev server (`http://localhost:5173`). Vite `server.proxy`: `/api` → `http://localhost:3000`. The browser sees a single origin, so cookies/CSRF work without CORS configuration in dev; `http://localhost:5173` is in `CORS_ORIGINS` for Origin validation (ADR-001).
4. **Production (same-origin).** `apps/api` serves the SPA: `ServeStaticModule.forRoot({ rootPath: <apps/web/dist>, exclude: ['/api/{*splat}'] })` — Express 5 named wildcard, never `*` (AP-09/AP-56); default `renderPath: '*'` serves `index.html` so SPA deep routes refresh correctly (OPS-001). One Render Web Service origin serves both SPA and API; the `__Host-`/`Secure` cookie and same-origin CSRF posture from ADR-001 hold. API routes use the global prefix `/api` (`app.setGlobalPrefix('api')`), identical in dev (proxy) and production (ServeStatic exclude).
5. **Build order: contract → api → web.** `pnpm build` = contract build first (web imports its types), then api, then web. API does not depend on web.
6. **Root scripts (authoritative, REP-002).** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` at the root, delegating via `pnpm --filter`/`-r`. CI runs the protocol verify_cmd: backend `pnpm typecheck && pnpm test && pnpm test:e2e`; frontend `pnpm typecheck && pnpm test`.
7. **No Nx/Turborepo in the MVP.** Two apps and one contract package do not justify a task-runner layer; pnpm's built-in filters and root scripts cover orchestration. Revisit only if the workspace grows beyond ~3 packages or caching becomes a bottleneck.
8. **Lockfile and CI.** `pnpm-lock.yaml` is committed. CI installs with `pnpm install --frozen-lockfile` (pnpm/action-setup v4 `version: 10`; actions/setup-node v4 `node-version: 24`, `cache: pnpm`; runner pinned `ubuntu-24.04`, never `ubuntu-latest` — CR-06/AP-41). Fresh-checkout reproducibility is a DoD gate (REP-001).

### Consequences

- One contract boundary removes FE/BE type drift; contract changes become explicit cross-cutting PRs (OpenAPI + generated types + both consumers).
- The monorepo enables a single CI pipeline, one lockfile, and atomic cross-package changes — aligned with the demo's need for coherent, reviewable delivery.
- Cost: initial scaffolding and the discipline of the generation step (regenerate → no diff); a task runner is deferred, not forbidden, if scale demands it.
- Same-origin production plus unified build keeps deployment to a single Render Web Service and one public origin (DEC-036).

### Alternatives Considered

- **Two independent repos:** rejected — DEC-031; contract drift, duplicated CI, harder demo coherence.
- **Nx/Turborepo:** rejected — complexity without need for 2 apps + 1 contract package; adds config, daemon, and migration surface in the MVP.
- **Hand-written shared types package:** rejected — drift risk; deterministic generation from OpenAPI is the guard (REP-006, "no third hand-written shared model").
- **Separate frontend origin with CORS credentials:** rejected — DEC-036; same-origin removes cookie/CORS complexity and matches the free-tier single-service deployment.
- **npm/yarn workspaces:** rejected — pnpm is pinned by PH-00 (v10) for deterministic frozen-lockfile installs and filter-based orchestration.

### Update (2026-08-13): Prisma client relocated inside `apps/api`

The generated Prisma client moved from `packages/api-contract/src/generated/prisma` to
`apps/api/src/generated/prisma` (`render-build-path-fix` plan). This does **not** amend
decision 2 above: the client was never part of the contract package's public surface
(`exports` map only ever exposed `api-types.ts` and `openapi.yaml`), so the integration
boundary is unchanged — it remains `openapi.yaml` + generated `api-types.ts` only, and no
package outside `apps/api` ever consumed `generated/prisma`.

**Why it moved:** `apps/api`'s cross-package relative import into
`packages/api-contract/src/generated/prisma` forced `tsc` to infer the build `rootDir` as
the repo root (no explicit `rootDir` was declared), which pushed the compiled entrypoint to
`dist/apps/api/src/main.js` instead of the `dist/main.js` every start script assumed —
the direct cause of the Render deploy `MODULE_NOT_FOUND` failure. Moving the client inside
`apps/api/src` collapses the build's common ancestor back to `src/`, and
`apps/api/tsconfig.build.json` now declares `rootDir: "./src"` explicitly as a guard: any
future import that escapes `src/` becomes a compile error (`TS6059`) instead of a silent
layout change. The regenerated client also sets `moduleFormat = "cjs"` in the Prisma
generator block, removing an unrelated `import.meta.url` ESM/CJS crash under Node 24.

This is a local path change with zero external consumers, exactly the kind of move
`.claude/plans/data-model.md:369` pre-authorized ("if ARCH/BE move the client inside
`apps/api`, that is a local path change only — but register it in the plan/ADR-005"). See
`.claude/plans/render-build-path-fix-plan.md` for the full diagnosis and change list.
