# Briefline CRM

**Task & client management for small creative teams.**  
A portfolio case study built with NestJS, React, PostgreSQL, and TypeScript.

[![CI](https://github.com/username/briefline-crm/actions/workflows/ci.yml/badge.svg)](https://github.com/username/briefline-crm/actions/workflows/ci.yml)
[![Deploy](https://img.shields.io/badge/deploy-Render-2b6eb2)](https://briefline-crm.onrender.com)
[![PRD](docs/02-prd.en.md)](docs/02-prd.en.md)

---

## Architecture

```
briefline-crm/
├── apps/
│   ├── api/          # NestJS 11 REST API (port 3000)
│   └── web/          # React 19 SPA (Vite 8, port 5173) — public landing + authenticated app
├── packages/
│   └── api-contract/ # OpenAPI 3.1 spec + generated Prisma types
├── docker/
│   └── compose.yml   # PostgreSQL 17-alpine (dev)
├── scripts/
│   └── smoke-test.sh # Post-deploy verification
└── docs/             # PRD, brief, landing spec, decision log, development plan
```

**Stack:** NestJS 11 · Prisma 7 · PostgreSQL 17 · React 19 · Vite 8 · TanStack Query 5 · React Router 7 · dnd-kit · Tailwind CSS 4 · Radix UI · class-variance-authority · clsx · tailwind-merge · lucide-react · Zod 4 · Playwright · Vitest · MSW

## Quick Start

### Prerequisites
- **Node.js** ≥ 24.19.0
- **pnpm** ≥ 10
- **Docker** (for local PostgreSQL)

### Setup

```bash
# 1. Install dependencies
pnpm install

# 2. Start PostgreSQL
docker compose -f docker/compose.yml up -d

# 3. Configure environment
cp .env.example .env
# Edit .env if your PostgreSQL port differs from 5432

# 4. Generate Prisma client + migrate + seed
pnpm --filter @briefline/api prisma:generate
pnpm --filter @briefline/api prisma migrate dev --name init
pnpm --filter @briefline/api tsx prisma/seed.ts

# 5. Start dev servers (API :3000 + Web :5173)
pnpm dev
```

### Demo Credentials (local only)

| Role | Email | Password |
|---|---|---|
| Admin | admin@briefline.demo | briefline-demo-2026 |
| Member | maria@briefline.demo | briefline-demo-2026 |

The seed creates 8 users, 12 clients, 3 contacts, 36 tasks, and 124 task history events (plus 20 client changes and 3 comments).

## Landing Page (public)

`/` serves the public landing page — the portfolio case-study entry point. It replaced the old redirect to `/dashboard`: visitors get product context, role semantics, and engineering evidence before being invited into the live demo (spec: `docs/05-landing-footer-spec.es.md`).

- **Sections:** Hero · Problem/Solution · Workflow · Product Previews · Roles · Engineering · Quality · Case Study · Final CTA
- **Public header:** wordmark, anchor nav (Product, Workflow, Engineering, Quality), and an `Open live demo` CTA. Becomes sticky once the hero scrolls out of view (IntersectionObserver + hero sentinel); collapsible mobile menu with `Escape`-to-close and focus return; `Skip to main content` link.
- **Public footer:** 3-column layout (Identity · Product · Project) plus a bottom bar; the only `contentinfo` landmark on the page.
- **Implementation:** `apps/web/src/pages/Landing.tsx` · `apps/web/src/components/landing/LandingLayout.tsx` · `Landing.css`

## Routes (SPA)

| Route | Access | Purpose |
|---|---|---|
| `/` | Public | Landing page (case study entry point) |
| `/login` | Public | Login + demo account selection |
| `/403`, `/404` | Public | Access denied / not found |
| `/dashboard` | Authenticated | KPIs, my tasks, recent activity |
| `/tasks` | Authenticated | Board · list · archived (admin) · detail |
| `/clients` | Authenticated | List · create · detail |
| `/contacts` | Authenticated | List · create (admin) · detail · edit (admin) |
| `/users` | Admin | User management |
| `/profile` | Authenticated | Own profile |

Sub-routes: `/tasks/list`, `/tasks/archived` (Admin), `/tasks/:taskId`; `/clients/new`, `/clients/:clientId`; `/contacts/new` (Admin), `/contacts/:contactId`, `/contacts/:contactId/edit` (Admin).

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Start API + Web in parallel |
| `pnpm build` | Build all workspaces |
| `pnpm typecheck` | Type-check all workspaces |
| `pnpm test` | Run unit tests (API) + component tests (web) |
| `pnpm test:e2e` | Run API integration (Testcontainers) + Playwright E2E tests |
| `pnpm lint` | Lint all workspaces |
| `pnpm format` | Format with Prettier |
| `pnpm --filter @briefline/api tsx prisma/seed.ts` | Re-seed the database |
| `pnpm --filter @briefline/api tsx prisma/reset.ts` | Truncate + re-seed |

## Verification

```bash
pnpm typecheck   # All 3 workspaces
pnpm test        # 198 tests (50 API + 148 web)
pnpm test:e2e    # 272 tests (206 API integration + 66 Playwright)
```

## API (v1)

Base: `/api/v1`

| Resource | Endpoints | Auth |
|---|---|---|
| Auth | `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `GET /auth/csrf` | Public/Private |
| Users | `GET /users`, `POST /users`, `PATCH /users/:id`, `GET /users/:id/deactivation-impact` | Admin |
| Profile | `GET /profile`, `PATCH /profile` | Authenticated |
| Clients | `GET /clients`, `POST /clients`, `GET /clients/:id`, `PATCH /clients/:id`, `GET /clients/:id/history`, `POST /clients/:id/deactivate`, `POST /clients/:id/archive` | Auth/Admin |
| Contacts | `GET /contacts`, `POST /contacts`, `GET /contacts/:id`, `PATCH /contacts/:id`, `POST /contacts/:id/primary`, `DELETE /contacts/:id` | Auth/Admin |
| Tasks | `GET /tasks`, `GET /tasks/board`, `GET /tasks/archived`, `POST /tasks`, `GET /tasks/:id`, `PATCH /tasks/:id`, `PATCH /tasks/:id/status`, `POST /tasks/:id/archive`, `GET /tasks/:id/history` | Auth/Admin |
| Checklist | `GET /tasks/:taskId/checklist`, `POST /tasks/:taskId/checklist`, `PATCH /tasks/:taskId/checklist/reorder`, `PATCH /tasks/:taskId/checklist/:itemId`, `DELETE /tasks/:taskId/checklist/:itemId` | Auth/Admin |
| Labels | `GET /labels`, `POST /labels`, `PATCH /labels/:id`, `DELETE /labels/:id`, `POST /tasks/:taskId/labels/:labelId`, `DELETE /tasks/:taskId/labels/:labelId` | Auth/Admin |
| Comments | `GET /tasks/:taskId/comments`, `POST /tasks/:taskId/comments` | Auth/Admin |
| Dashboard | `GET /dashboard/kpis`, `GET /dashboard/my-tasks`, `GET /dashboard/recent-activity` | Auth |
| Health | `GET /health` | Public |

Full contract: `packages/api-contract/openapi.yaml` · Error catalog: `.claude/plans/openapi-and-errors.md`

## Key Decisions (ADRs)

| ADR | Decision | Rationale |
|---|---|---|
| ADR-001 | JWT in HttpOnly cookies + CSRF double-submit | Browser-only SPA; no mobile app |
| ADR-002 | Email as identity, no email sending MVP | Scope boundary |
| ADR-003 | Europe/Madrid timezone for dates | Target users are in Spain |
| ADR-004 | Optimistic concurrency (expectedVersion) | Avoid lost updates on free-tier latency |
| ADR-005 | pnpm monorepo; generated types committed | Runtime-free CI; no build step for contract |

Full log: `.claude/plans/adrs.md`

## Security

- JWT HS256 in `HttpOnly; Secure; SameSite=Lax; __Host-` cookie
- CSRF double-submit with signed token, rotation on login/logout
- BOLA protection: members get 404 for inaccessible resources (never 403)
- Rate limiting: 100 req/min global, 5 req/min login
- Helmet (CSP, nosniff, HSTS), CORS allowlist, body limit 100KB
- No `$queryRaw`/`$executeRaw` — 100% Prisma typed queries
- Sensitive data redaction in logs
- Security review: `.claude/plans/ph11-security-review.md`

## Design System

- **Hybrid approach:** Tailwind CSS 4 utility classes + CSS custom properties. `src/styles/tokens.css` is the token source of truth (4px scale, WCAG AA colors); `src/styles/tailwind.css` maps tokens into `@theme` utilities; `global.css`/`ui.css` cover primitives and shell.
- **Path alias:** `@/` → `src` (Vite + tsconfig).
- **`cn()` utility:** `src/lib/utils.ts` — clsx + tailwind-merge conflict resolution.
- **Variants:** class-variance-authority (Button, Badge).
- **Radix UI primitives:** dialog, alert-dialog, select, label, separator, slot.
- **Icons:** lucide-react — 24 icons re-exported from `src/components/ui/icons.tsx`, API-compatible replacement for the previous hand-rolled SVGs.

## Data Model

10 models: `User`, `Client`, `Contact`, `Task`, `Label`, `TaskLabel`, `Comment`, `ChecklistItem`, `TaskChange`, `ClientChange`  
Full schema: `apps/api/prisma/schema.prisma` · ERD: `.claude/plans/data-model.md` · Permissions: `.claude/plans/permission-matrix.md`

## Testing Strategy

| Level | Tool | Location | Count |
|---|---|---|---|
| Unit (API) | Vitest | `apps/api/test/unit/` | 50 |
| Unit (Web) | Vitest + Testing Library | `apps/web/test/` | 146 |
| Integration (API) | Vitest + Testcontainers | `apps/api/test/integration/` | 206 |
| E2E (Web) | Playwright | `apps/web/test/e2e/` | 66 |
| A11y | axe-core | `apps/web/test/a11y.test.tsx` | 2 |

Test matrix: `.claude/plans/test-matrix.md`

## Deployment

| Service | Provider | Plan | Region |
|---|---|---|---|
| API + SPA | Render | Free | Frankfurt (eu-central-1) |
| Database | Neon | Free | eu-central-1 |

- **Build:** `pnpm run render-build` (install → build web → build API)
- **Start:** `prisma migrate deploy && node dist/main.js`
- **Health:** `GET /api/v1/health`
- **Cold start:** 30-60s after 15min inactivity (Render free tier)

Runbook: `.claude/plans/ph12-operations-runbook.md`  
Deploy config: `render.yaml`

## ⚠️ Free Tier Limitations

- **Cold starts:** First request after 15min idle takes 30–60s
- **Database:** 0.5 GB, compute auto-suspends after 5min idle
- **Reset:** Daily at 4:37am UTC via GitHub Actions (`.github/workflows/daily-reset.yml`)
- **Hours:** 750h/month Render + 100h/month Neon compute

## Documentation Index

| Document | Content |
|---|---|
| `docs/02-prd.en.md` | Product requirements (English) |
| `docs/02-prd.es.md` | Product requirements (Spanish) |
| `docs/03-documentation-baseline.en.md` | Documentation baseline (English) |
| `docs/03-documentation-baseline.es.md` | Documentation baseline (Spanish) |
| `docs/05-landing-footer-spec.es.md` | Landing page, public footer, copy, UX, accessibility, and acceptance specification |
| `docs/06-landing-visual-functional-audit.es.md` | Visual and functional landing audit, redesign priorities, implementation phases, and acceptance criteria (Spanish) |
| `docs/plans/04-development-plan.en.md` | Master development plan (English) |
| `docs/plans/04-development-plan.es.md` | Master development plan (Spanish) |
| `.claude/plans/adrs.md` | Architecture decision records |
| `.claude/plans/data-model.md` | Database schema + ERD |
| `.claude/plans/permission-matrix.md` | 31 operations × roles × states |
| `.claude/plans/openapi-and-errors.md` | API contract + error catalog |
| `.claude/plans/ux-wireframes-tokens.md` | Design tokens + a11y contract |
| `.claude/plans/test-matrix.md` | Requirement-to-test traceability matrix |
| `.claude/plans/technology-matrix.md` | 52 dependencies, exact versions |
| `.claude/plans/ph11-security-review.md` | Security audit (SEC-002) |
| `.claude/plans/ph12-operations-runbook.md` | Deploy, rollback, rotate, reset |

## License

This is a portfolio project. Not licensed for production use.

---

Built with [Claude Code](https://claude.com/claude-code) · 17 multi-agent phases · ~290h agent-time
