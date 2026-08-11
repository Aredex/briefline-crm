# Architecture Diagrams — Briefline CRM
**Date:** 2026-08-11
**Status:** PH-01 Draft

## C4 Level 1: System Context

```mermaid
C4Context
  title System Context diagram for Briefline CRM

  Enterprise_Boundary(publicInternet, "Untrusted: Public Internet") {
    Person(portfolioEvaluator, "Portfolio Evaluator", "Anonymous visitor of the public demo; no registration; must understand the product in under two minutes")
    Person(agencyAdmin, "Agency Admin", "Agency owner or operations manager; global visibility, user management, assignments and priorities")
    Person(agencyMember, "Agency Member", "Designer, developer, marketer or account specialist; finds, understands and updates assigned client work")
  }

  Enterprise_Boundary(hostedInfra, "Trusted: System Infrastructure") {
    System(brieflineCrm, "Briefline CRM", "Internal CRM for a small digital agency: connects clients, owners and tasks; visual board, permissions, history and dashboard")
    SystemDb_Ext(neon, "Neon PostgreSQL", "External managed PostgreSQL 17 database with pooled and direct TLS connections")
    System_Ext(render, "Render", "Hosting platform running the Web Service; free plan with documented cold start")
    System_Ext(gha, "GitHub Actions", "CI/CD pipeline and scheduled daily demo reset")
  }

  Rel(portfolioEvaluator, brieflineCrm, "Browses public demo and logs in with demo accounts", "HTTPS")
  Rel(agencyAdmin, brieflineCrm, "Authenticates and manages users, clients and tasks", "HTTPS")
  Rel(agencyMember, brieflineCrm, "Authenticates and works on assigned tasks", "HTTPS")

  Rel(brieflineCrm, neon, "Reads and writes business data", "Prisma ORM, TLS (pooled)")
  Rel(render, brieflineCrm, "Hosts and serves the running service", "Node 24 process")
  Rel(gha, render, "Builds and deploys on push", "HTTPS")
  Rel(gha, neon, "Runs the idempotent daily demo reset", "SQL over TLS (direct)")

  UpdateRelStyle(portfolioEvaluator, brieflineCrm, $offsetY="-20")
  UpdateRelStyle(agencyAdmin, brieflineCrm, $offsetY="-10")
  UpdateRelStyle(agencyMember, brieflineCrm, $offsetY="-10")
  UpdateRelStyle(brieflineCrm, neon, $offsetY="-20")
  UpdateRelStyle(gha, render, $offsetY="-10")
  UpdateRelStyle(gha, neon, $offsetX="-40", $offsetY="10")

  UpdateLayoutConfig($c4ShapeInRow="3", $c4BoundaryInRow="2")
```

### Description

Briefline CRM is the central system: a same-origin web application composed of a React SPA and a NestJS API that share one PostgreSQL database. Three human actors interact with it through their web browsers:

- **Portfolio Evaluator** — an anonymous visitor who reaches the public demo without registration, logs in with highlighted demo accounts (administrator and member), and evaluates the product. Demo data (`Northstar Digital Studio`: 8 users, 12 clients, 36 tasks) is fictional and restored by a daily reset.
- **Agency Admin** — authenticated owner or operations manager with global visibility and control over users, clients, and tasks.
- **Agency Member** — authenticated team member who works on assigned client work.

External systems:

- **Neon PostgreSQL** — the managed database. The API connects through Prisma with a pooled connection; migrations and the daily reset use a direct connection. TLS is required.
- **Render** — hosting platform that runs the single Web Service (SPA + API, Node 24). Free plan imposes a documented 30–60 s cold start.
- **GitHub Actions** — runs the PR pipeline (install, lint, typecheck, tests, build), deploys to Render on push, and executes the scheduled idempotent demo reset directly against Neon. There is no public destructive reset endpoint (DEC-038).

Trust boundaries: all human access originates from the **untrusted public internet** (HTTPS only); the system itself, its database, hosting, and automation live inside the **trusted system infrastructure**. The API never exposes secrets, stacks, or SQL details, and all cross-boundary traffic is TLS-encrypted.

## C4 Level 2: Container

```mermaid
C4Container
  title Container diagram for Briefline CRM

  Person(user, "User", "Portfolio evaluator, agency admin or agency member in a web browser")

  System_Boundary(brieflineCrm, "Briefline CRM") {
    Container(spa, "SPA", "React 19 + Vite 8", "Client-side application: React Router Data Mode, TanStack Query server state, design system and accessible UI; served by the API in production, by the Vite dev server locally")
    Container(api, "API", "NestJS 11 on Node 24 LTS", "Versioned REST API (/api/v1) with JWT auth, authorization, CSRF, RFC 9457 errors and rate limiting; serves the built SPA in production (same origin)")
    ContainerDb(db, "Database", "PostgreSQL 17", "User, Client, Task and TaskChange data with constraints, indexes and transactional history; hosted on Neon")
    Container(ci, "CI/CD", "GitHub Actions", "PR pipeline (install, lint, typecheck, unit, build), deploy to Render and scheduled idempotent demo reset")
  }

  Enterprise_Boundary(hostedInfra, "Trusted: Hosted Infrastructure") {
    System_Ext(render, "Render", "Hosting platform (Web Service)")
    SystemDb_Ext(neon, "Neon PostgreSQL", "Managed PostgreSQL platform")
    System_Ext(gha, "GitHub Actions", "Automation platform")
  }

  Rel(user, spa, "Loads SPA and uses the product", "HTTPS")
  Rel(spa, api, "REST calls with cookies and CSRF token", "HTTPS, JSON (same origin)")
  Rel(spa, api, "Vite proxy for /api in local development", "HTTP")
  Rel(api, db, "Prisma ORM queries and transactions", "TLS (pooled)")
  Rel(ci, db, "Idempotent daily demo reset", "SQL over TLS (direct)")
  Rel(render, api, "Runs and serves the service", "Node 24 process")
  Rel(gha, ci, "Executes workflows", "Hosted runner")
  Rel(neon, db, "Hosts the database", "Managed service")

  UpdateRelStyle(spa, api, $offsetX="10", $offsetY="-20")
  UpdateRelStyle(ci, db, $offsetX="-40", $offsetY="20")
  UpdateRelStyle(render, api, $offsetY="-20")
  UpdateRelStyle(gha, ci, $offsetY="-20")
  UpdateRelStyle(neon, db, $offsetY="-20")

  UpdateLayoutConfig($c4ShapeInRow="2", $c4BoundaryInRow="1")
```

### Description

Briefline CRM consists of four containers:

- **SPA** (React 19 + Vite 8) — the client-side application. In production it is served by the API as static assets (same origin, DEC-036); in local development it runs on the Vite dev server, which proxies `/api` to the API container.
- **API** (NestJS 11 on Node 24 LTS) — the application container. Exposes the versioned REST API under `/api/v1`, enforces authentication and authorization, and serves the SPA in production. Same-origin production removes CORS entirely and makes `HttpOnly` session cookies safe.
- **Database** (PostgreSQL 17 on Neon) — the data container. Holds `User`, `Client`, `Task`, and `TaskChange` with constraints and query-driven indexes. Runtime access uses the pooled URL with a low Prisma `connection_limit`; migrations use `DIRECT_URL`.
- **CI/CD** (GitHub Actions) — the automation container. Runs the PR pipeline, deploys the unified build to Render, and executes the daily demo reset via a short-lived direct connection to the database (no pooler needed for a single reset connection).

Trust boundaries: the **browser is untrusted** — it only receives validated JSON, static assets, and an `HttpOnly` session cookie, and it never sees secrets. Everything inside the system boundary is **trusted**: the API is the only component that touches the database with business logic, and the CI/CD container is the only component allowed to mutate data outside the API (the idempotent reset). Render and Neon are external managed platforms inside the trusted infrastructure zone; the Web Service filesystem is ephemeral, so all persistent state lives in Neon.

## C4 Level 3: Component — NestJS API

```mermaid
C4Component
  title Component diagram for Briefline CRM API

  Container(web, "SPA", "React 19", "Browser client served by the API in production (same origin)")
  ContainerDb(db, "Database", "PostgreSQL 17 (Neon)", "Persistent store")

  Container_Boundary(api, "API — NestJS 11") {
    Component(appModule, "App Module", "NestJS", "Bootstrap: validated config (@nestjs/config), strict ValidationPipe, helmet, compression, throttler, graceful shutdown; imports all feature modules")
    Component(authModule, "Auth Module", "NestJS + Passport", "Login with Argon2id, JWT in HttpOnly cookie (8 h, SameSite=Lax, __Host- in prod), double-submit CSRF and Origin validation, login rate limiting, JwtStrategy")
    Component(globalGuard, "Global JWT Guard", "APP_GUARD", "Enforces authentication on every route; @Public() opts out; resolves the current active user")
    Component(usersModule, "Users Module", "NestJS", "Admin user CRUD, normalized unique email, last-active-admin protection (serializable), reassignment impact")
    Component(clientsModule, "Clients Module", "NestJS", "Client CRUD, field-level DTO allowlist, deactivate and archive, archived-client association invariant")
    Component(tasksModule, "Tasks Module", "NestJS", "Task CRUD, board and archive queries, status transitions with business rules, optimistic locking via Task.version, atomic append-only history")
    Component(dashboardModule, "Dashboard Module", "NestJS", "KPI counts, prioritized My Tasks and visible recent activity")
    Component(prismaModule, "Prisma Module", "Prisma 7", "Single injected PrismaService lifecycle; pooled runtime connection and interactive transactions; DIRECT_URL for migrations")
    Component(contractModule, "Contract Module", "OpenAPI / @nestjs/swagger", "Generates OpenAPI v1 from decorators; contract types live in packages/api-contract and are never hand-edited")
  }

  Rel(web, authModule, "Login, CSRF, session, logout, me", "HTTPS, JSON")
  Rel(web, usersModule, "Admin user management", "HTTPS, JSON")
  Rel(web, clientsModule, "Client CRUD", "HTTPS, JSON")
  Rel(web, tasksModule, "Tasks, board, archive, history", "HTTPS, JSON")
  Rel(web, dashboardModule, "KPIs and activity", "HTTPS, JSON")

  Rel(appModule, authModule, "Imports")
  Rel(appModule, usersModule, "Imports")
  Rel(appModule, clientsModule, "Imports")
  Rel(appModule, tasksModule, "Imports")
  Rel(appModule, dashboardModule, "Imports")
  Rel(appModule, contractModule, "Configures OpenAPI")

  Rel(globalGuard, authModule, "Validates JWT and resolves current user")
  Rel(authModule, prismaModule, "Uses")
  Rel(usersModule, prismaModule, "Uses")
  Rel(clientsModule, prismaModule, "Uses")
  Rel(tasksModule, prismaModule, "Uses (single transaction per mutation)")
  Rel(dashboardModule, prismaModule, "Uses")
  Rel(tasksModule, authModule, "Applies object-level policies (role, ownership, archive)")

  Rel(prismaModule, db, "Queries and transactions", "TLS (pooled)")
  Rel(contractModule, appModule, "Produces the OpenAPI artifact", "Build time")

  UpdateRelStyle(web, authModule, $offsetY="-20")
  UpdateRelStyle(web, usersModule, $offsetY="-10")
  UpdateRelStyle(web, tasksModule, $offsetX="-40", $offsetY="10")
  UpdateRelStyle(tasksModule, prismaModule, $offsetY="-10")
  UpdateRelStyle(prismaModule, db, $offsetY="-40")

  UpdateLayoutConfig($c4ShapeInRow="3", $c4BoundaryInRow="1")
```

### Description

The API is a NestJS 11 modular monolith. **App Module** bootstraps the application (validated config, strict `ValidationPipe`, helmet, compression, throttler, graceful shutdown) and imports the feature modules. Feature modules expose versioned controllers under `/api/v1`, and all of them depend on the **Prisma Module** for data access.

| Module | Key packages / APIs | Patterns and rules |
|---|---|---|
| App Module | `@nestjs/config`, `class-validator`, `class-transformer`, `helmet`, `compression`, `@nestjs/throttler`, `@nestjs/serve-static` | Validated env config; DTOs reject unexpected properties (NFR-SEC-005); SPA served in production |
| Auth Module | `@nestjs/jwt`, `@nestjs/passport`, `passport-jwt`, `argon2`, `csrf-csrf`, `cookie-parser`, `@nestjs/throttler` | HS256 JWT in 8 h HttpOnly cookie, `iss`/`aud` fixed, SameSite=Lax and `__Host-` in prod (DEC-032); double-submit CSRF + Origin validation; Argon2id (19 MiB, 2 iterations, parallelism 1); login rate limited |
| Global JWT Guard | `APP_GUARD` + `@Public()` | Secure-by-default: every route authenticated; current user must remain active (BR-001) |
| Users Module | Prisma, `argon2` (initial password) | Admin only; case-insensitive unique email; serializable last-active-admin protection (BR-003); reassignment impact (FR-USR-005) |
| Clients Module | Prisma | Any active user creates; admin edits/archives (BR-006); field-level allowlist; archived client rejects new associations (BR-005, FR-CLI-006) |
| Tasks Module | Prisma interactive transactions | `Task.version` optimistic locking with `expectedVersion` (409 on stale writes); atomic mutation + append-only `TaskChange` history (BR-017/018); status rules BR-007–016 |
| Dashboard Module | Prisma | Aggregated KPIs, prioritized My Tasks, visible-only activity (FR-DASH) |
| Prisma Module | `@prisma/client` 7 | Single `PrismaService` lifecycle (DB-001); pooled runtime URL (`connection_limit` 5–10); `DIRECT_URL` only for migrations |
| Contract Module | `@nestjs/swagger`, `packages/api-contract` | OpenAPI v1 generated from decorators; types generated and never hand-edited (DEC-031); RFC 9457 catalogue |

Cross-cutting behavior: **Global JWT Guard** (registered via `APP_GUARD`) applies to every route; the **Problem Details** layer converts errors to `application/problem+json` with domain `code` and `traceId` (RFC 9457, DEC-033) without leaking stacks, SQL, or secrets. Task mutations and their history entries commit in one transaction, and authorization reads, mutation, and history all share that transaction (NFR-REL-001). Contract generation is build-time only: the OpenAPI artifact and generated types are the integration boundary for the SPA.

## C4 Level 3: Component — React SPA

```mermaid
C4Component
  title Component diagram for Briefline CRM SPA

  Container(api, "API", "NestJS 11", "Versioned REST API, same origin")

  Container_Boundary(spa, "SPA — React 19 + Vite 8") {
    Component(providers, "Providers", "React", "QueryClientProvider (TanStack Query), ErrorBoundary and AuthProvider mounted once; single source of server state")
    Component(router, "Router", "React Router 7 (Data Mode)", "Created outside render; routes: /login, /dashboard, /board, /tasks/:taskId, /clients, /clients/:clientId, /users, /profile, /403, /404")
    Component(pageLogin, "Login Page", "React", "Demo account fill, generic errors, rate-limit feedback")
    Component(pageDashboard, "Dashboard Page", "React", "KPI cards, prioritized My Tasks, recent activity; deep links to filtered views")
    Component(pageBoard, "Board Page", "React", "Backlog and active columns, filters and search, accessible Move-to control plus drag-and-drop, optimistic updates")
    Component(pageTaskDetail, "Task Detail", "React", "Routed side panel (desktop) or full-screen modal (mobile); edit and append-only history timeline")
    Component(pageClients, "Clients Page", "React", "Search, status filter, pagination and create")
    Component(pageClientDetail, "Client Detail", "React", "Client data, related tasks and archive state")
    Component(pageUsers, "Users Page", "React", "Admin only; list, create, role and status, reassignment impact")
    Component(pageProfile, "Profile Page", "React", "Read and update own name")
    Component(hooks, "Hooks", "TanStack Query 5 + RHF + Zod", "Queries and mutations, optimistic cache updates with rollback, form pattern, auth session state")
    Component(apiClient, "API Client", "fetch + OpenAPI types", "Sends cookies and CSRF header, AbortSignal, maps RFC 9457 problem details, handles 401/403/409/429")
    Component(designSystem, "Design System", "Tokens + primitives", "Type, color, spacing, radius, elevation and motion tokens; Button, Field, Select, Badge, Card, Table, Skeleton, Alert, Empty, Error, Drawer, Dialog")
  }

  Rel(providers, router, "Wraps with server state, error and auth context")
  Rel(router, pageLogin, "Route: /login")
  Rel(router, pageDashboard, "Route: /dashboard")
  Rel(router, pageBoard, "Route: /board")
  Rel(router, pageTaskDetail, "Route: /tasks/:taskId")
  Rel(router, pageClients, "Route: /clients")
  Rel(router, pageClientDetail, "Route: /clients/:clientId")
  Rel(router, pageUsers, "Route: /users (admin)")
  Rel(router, pageProfile, "Route: /profile")

  Rel(pageLogin, hooks, "Auth queries and mutations")
  Rel(pageDashboard, hooks, "KPI, My Tasks and activity queries")
  Rel(pageBoard, hooks, "Board query and optimistic status mutations")
  Rel(pageTaskDetail, hooks, "Task and history queries and mutations")
  Rel(pageClients, hooks, "Client queries and mutations")
  Rel(pageClientDetail, hooks, "Client detail query and mutations")
  Rel(pageUsers, hooks, "User queries and mutations")
  Rel(pageProfile, hooks, "Profile query and mutation")

  Rel(pageLogin, designSystem, "Composes primitives")
  Rel(pageDashboard, designSystem, "Composes primitives")
  Rel(pageBoard, designSystem, "Composes primitives")
  Rel(pageTaskDetail, designSystem, "Composes primitives")
  Rel(pageClients, designSystem, "Composes primitives")
  Rel(pageClientDetail, designSystem, "Composes primitives")
  Rel(pageUsers, designSystem, "Composes primitives")
  Rel(pageProfile, designSystem, "Composes primitives")

  Rel(hooks, apiClient, "Invokes")
  Rel(apiClient, api, "REST calls, same origin", "HTTPS, JSON")

  UpdateRelStyle(router, pageLogin, $offsetX="-120")
  UpdateRelStyle(router, pageBoard, $offsetX="-60", $offsetY="20")
  UpdateRelStyle(router, pageUsers, $offsetY="-20")
  UpdateRelStyle(pageBoard, hooks, $offsetY="-20")
  UpdateRelStyle(pageTaskDetail, hooks, $offsetY="-10")
  UpdateRelStyle(hooks, apiClient, $offsetY="-20")

  UpdateLayoutConfig($c4ShapeInRow="4", $c4BoundaryInRow="1")
```

### Description

The SPA is a React 19 single-page application structured around four responsibilities:

- **Router** (React Router 7 in Data Mode) — created outside render (FE-002), defines all product routes (`/login`, `/dashboard`, `/board`, `/tasks/:taskId`, `/clients`, `/clients/:clientId`, `/users`, `/profile`) plus `/403` and `/404`. Deep links and browser navigation stay coherent; every screen includes loading, empty, error, and forbidden states.
- **Providers** — mounted once: `QueryClientProvider` (TanStack Query v5, single source of server state), an `ErrorBoundary`, and the `AuthProvider` that boots the session on reload, clears session and cache on 401, and treats 403 as a permission error, not a logout.
- **Pages** — feature screens that only compose primitives and call hooks. The board uses accessible permanent `Move to…` controls as the primary path with drag-and-drop as progressive enhancement, plus optimistic mutations with rollback and a one-pending-move-per-task concurrency guard (FR-TASK-012, NFR-REL-002).
- **Shared** — the **API Client** (fetch wrapper typed from the generated OpenAPI types: sends cookies and the CSRF header, supports `AbortSignal`, maps RFC 9457 problem details, and handles 401/403/409/429), the **Design System** (documented tokens and semantic primitives), and **Hooks** (queries/mutations, optimistic updates, and the react-hook-form + Zod form pattern).

Data flows from pages to hooks, from hooks to the API client, and from the API client to the backend over same-origin HTTPS with the session cookie; the UI never holds the authority — server-enforced permissions decide what is rendered as interactive, read-only, or forbidden.

## Trust Boundaries

| Boundary | Description | Security Controls |
|---|---|---|
| Internet ↔ Render | Public traffic to the deployed service | HTTPS only, TLS termination at Render, `Secure` session cookie, helmet security headers and CSP |
| Browser ↔ API | REST API and session exchange | JWT in HttpOnly cookie (8 h, SameSite=Lax, `__Host-` name in production), double-submit CSRF + Origin validation for unsafe methods, login rate limiting (429 is contractual) |
| API ↔ Database | Prisma connections to Neon | TLS required (`sslmode=require`), pooled runtime URL with low `connection_limit`, direct URL only for migrations and the reset script; credential-based auth (Neon does not offer IP allowlisting — verified in devops-platform-validation) |
| GitHub Actions ↔ Neon | Daily demo reset | `DATABASE_URL`/`RESET_URL` stored only as GitHub secrets, short-lived single direct connection, idempotent script with `concurrency` guard, no public destructive endpoint (DEC-038) |
| GitHub Actions ↔ Render | Build and deploy on push | HTTPS deploy with scoped credentials stored in GitHub secrets, health check gate (`/api/health` returns 200 only when the DB is reachable), automatic rollback on failed health window |

## Key Design Decisions

- **Same-origin production:** the SPA is served by NestJS (`ServeStaticModule`), so no CORS configuration is needed and `HttpOnly` session cookies are safe (DEC-036).
- **Contract-first:** OpenAPI lives in `packages/api-contract`; types are generated from it and are never hand-edited; mocks and fixtures derive from the approved examples (DEC-031).
- **Secure-by-default:** `APP_GUARD` authenticates every route; `@Public()` is the explicit exception; the current user must remain active on every request.
- **Server-enforced permissions:** the UI is never the authority — every operation is authorized by role, object relationship, and state (BR-006/013/014/015).
- **Session without refresh:** JWT in an 8 h `HttpOnly` cookie, `SameSite=Lax`, `Secure` and `__Host-` in production, double-submit CSRF — no Web Storage tokens (DEC-032).
- **Concurrency and audit:** `Task.version` optimistic locking with `expectedVersion` (409 on stale writes) and atomic append-only `TaskChange` history inside one transaction (DEC-034, NFR-REL-001).
- **Versioned and constrained API:** `/api/v1` prefix, RFC 9457 `application/problem+json` errors with domain `code` and `traceId`, strict DTOs that reject unexpected properties (DEC-033, NFR-SEC-005).
- **Single database client:** one injected `PrismaService` lifecycle, pooled runtime connection, `DIRECT_URL` only for migrations and the reset (DB-001, devops-platform-validation).
- **Recoverable demo:** the daily reset runs from GitHub Actions against the database with an idempotent script; there is no public destructive endpoint (DEC-038).
