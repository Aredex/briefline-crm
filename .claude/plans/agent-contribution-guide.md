# DOC-007 — Agent Contribution Guide — Briefline CRM

**Status:** PH-02 (REP-001 scope) | **Owner:** ARCH | **Audience:** BE, FE, QA, DEVOPS agents | **Date:** 2026-08-11
**Sources:** `docs/plans/04-development-plan.en.md` (§4, §5, §8), `.claude/plans/consolidated-api-baseline.md`, `.claude/plans/adrs.md`, `.claude/plans/permission-matrix.md`

> **LECTURA OBLIGATORIA previa a cualquier tarea de código:** `consolidated-api-baseline.md`.
> Regla R-1: **si una API no está listada en el baseline, no está autorizada.** Versiones exactas, sin rangos (`^`/`~`) ni `latest`.
>
> Jerarquía de fuentes (si algo contradice, gana la de mayor rango): PRD → decision log → consolidated-api-baseline → OpenAPI → ADRs → development plan → código/tests.

---

## 1. Workspace Overview

- Monorepo pnpm con 3 workspaces:
  - `apps/api` — NestJS 11 + Prisma 7 + PostgreSQL → **BE-owned** (paquete `@briefline/api`)
  - `apps/web` — React 19 + Vite 8 SPA → **FE-owned** (paquete `@briefline/web`)
  - `packages/api-contract` — OpenAPI v1 + tipos TS generados → **ARCH-owned**; todo cambio requiere review FE + BE (paquete `@briefline/api-contract`)
- **OpenAPI es la frontera de integración**: FE y BE no comparten modelo escrito a mano. Los tipos generados se commitan y **nunca se editan a mano**; regenerar debe producir diff vacío.
- Runtime: **Node 24.19.0 LTS** (forzado vía `engines` — runtime incompatible falla claro), **pnpm 10**, un solo **TypeScript 5.9.3** en la raíz.
- Producción: mismo-origin (Nest sirve el SPA), `/api` global prefix, Vite proxya `/api` → `localhost:3000` en dev.

## 2. Essential Commands

```bash
# Development
pnpm dev                  # Start both API + Web (or concurrently)
pnpm --filter @briefline/api dev    # API only
pnpm --filter @briefline/web dev    # Web only

# Database
docker compose -f docker/compose.yml up -d    # Start PostgreSQL
pnpm --filter @briefline/api prisma:migrate:dev    # Create migration (dev only)
pnpm --filter @briefline/api prisma:migrate:deploy  # Apply migrations (CI/prod)
pnpm --filter @briefline/api prisma:generate    # Regenerate Prisma client
pnpm --filter @briefline/api prisma:seed        # Seed demo data

# Quality gates (ALL must pass before commit)
pnpm typecheck    # TypeScript check both apps
pnpm lint         # ESLint + Prettier check
pnpm test         # Unit + Integration tests
pnpm test:e2e     # Playwright E2E tests
pnpm build        # Production build (order: contract → api → web)

# Contract
pnpm --filter @briefline/api-contract generate    # Regenerate TS types from OpenAPI
```

- **verify_cmd (obligatorio, binario):** backend `pnpm typecheck && pnpm test && pnpm test:e2e`; frontend `pnpm typecheck && pnpm test`. Coverage en CI con thresholds **80/80/70/80** (lines/functions/branches/statements).
- Regeneración del contrato al final de cualquier cambio de contrato: `generate` + verificar `git diff` limpio en tipos generados.
- `prisma migrate dev` SOLO en local; CI/producción SIEMPRE `prisma migrate deploy`. Nunca `db push` / `migrate reset` fuera de prototipos.

## 3. Branch and Task Convention

- Nombre de rama: **`<role>/<task-id>`** — roles `arch/`, `be/`, `fe/`, `qa/`, `ops/`.
- **Una tarea por rama/worktree.**
- El task-id referencia fase e ID del development plan: `PH-04-AUTH-001`, `PH-08-CLI-FE-001`, `PH-11-QA-002`, `PH-12-OPS-001`.

```bash
git checkout -b be/PH-04-AUTH-001    # backend agent, task AUTH-001
git checkout -b fe/PH-08-CLI-FE-001  # frontend agent, task CLI-FE-001
git checkout -b arch/PH-01-ADR-001   # architect, ADR change
```

- FE no integra un endpoint antes de que el contrato del dominio pase el gate de backend; puede construir shell y estados estáticos tras UX-001 con mocks del contrato.
- Mocks y fixtures se generan o validan contra los **ejemplos del OpenAPI aprobado**.

## 4. Definition of Ready (DoR)

Una tarea NO se inicia hasta cumplir todo:

- [ ] Task tiene **ID, owner, scope y dependencias** (del development plan)
- [ ] Task enlaza los **requisitos BR/NFR/FR** que cubre (PRD + test-matrix)
- [ ] **APIs externas** consultadas en su documentación oficial y **versión pinneada** (Context7 + `npm view`; baseline §1.0)
- [ ] **Impacto de contrato identificado** (¿cambia OpenAPI? → sección 6)
- [ ] Comportamiento definido para: **happy path, error, permisos y límites** (permission-matrix + catálogo RFC 9457)
- [ ] Aceptación verificable y sin decisiones de producto pendientes

## 5. Definition of Done (DoD)

La tarea NO está completa hasta cumplir todo:

- [ ] **Implementación coincide con la documentación** (OpenAPI, ADRs, plan, permission-matrix)
- [ ] `pnpm typecheck` pasa
- [ ] `pnpm lint` pasa
- [ ] `pnpm test` pasa (unit + integration)
- [ ] `pnpm test:e2e` pasa (si aplica)
- [ ] Tests **positivos, negativos, de autorización y de límites** existen (400/403/404/409/422/429)
- [ ] Estados UI cubiertos: **loading, empty, error, forbidden, read-only** (si UI)
- [ ] Checks **teclado, foco, 320 px y 400%** pasan (si UI)
- [ ] **Contrato, mocks, cliente y tests sincronizados** (un cambio toca los 4 en la misma tarea)
- [ ] **Sin anti-patrones** del baseline (sección 7 + catálogo completo §2)
- [ ] **Migración forward + rollback** con evidencia (si cambio de schema)
- [ ] Evidencia, limitaciones y **review cross-role** registradas (contrato → FE + BE)

## 6. Contract Change Policy

OpenAPI (`packages/api-contract/openapi.yaml`) es la frontera de integración. Todo cambio de contrato exige, **en la misma tarea**:

1. Actualizar el spec OpenAPI (inputs, outputs, ejemplos, códigos de error, auth)
2. Regenerar tipos: `pnpm --filter @briefline/api-contract generate`
3. Actualizar DTOs/controllers del backend (`apps/api`)
4. Actualizar cliente API/hooks del frontend (`apps/web`)
5. Actualizar mocks y fixtures (derivados de los ejemplos del OpenAPI)
6. Actualizar tests (unit, integration, e2e)
7. **Review FE + BE** obligatoria

- La regeneración **debe ser determinista**: los archivos generados se commitan y nunca se editan a mano; regenerar produce diff vacío (`git diff` limpio = gate).
- No existe un tercer modelo compartido escrito a mano.
- Frontend puede adelantar UI con mocks del contrato, pero no integrar el endpoint antes del gate del backend.

## 7. Anti-Pattern Quick Reference

Los 10 más comunes (catálogo completo: `consolidated-api-baseline.md` §2, 61 anti-patrones):

| # | NO | SÍ |
|---|---|---|
| 1 | `BrowserRouter` + `Routes` (modo declarativo) | `createBrowserRouter` + `RouterProvider` (Data Mode, creado una vez fuera del árbol) |
| 2 | `csurf` (deprecado, vulnerable) | `csrf-csrf@4.0.3` (signed double-submit) |
| 3 | Mezclar familias dnd-kit (`@dnd-kit/react/*`) | Solo `@dnd-kit/core` + `@dnd-kit/sortable` (familia clásica) |
| 4 | `$transaction([...])` con array (no soportado en Prisma 7) | `$transaction(async (tx) => {...})` callback (interactivo) |
| 5 | TypeScript 7.x / 6.x (rompe `@nestjs/cli` y Prisma) | `typescript@5.9.3` |
| 6 | `test.workspace` en Vitest (deprecado en v4) | `test.projects` |
| 7 | SQLite/pg-mem para tests de integración | PostgreSQL real (`postgres:17-alpine` Testcontainers / service container) |
| 8 | Tokens en Web Storage (`localStorage`/`sessionStorage`) | Solo cookie HttpOnly (`httpOnly: true`, `secure` en prod, `SameSite=Lax`) |
| 9 | Drag-and-drop como única vía de mover tareas | Botón `Move to...` permanente (contrapartida contractual) |
| 10 | Modelos Prisma como DTOs / mass assignment | DTOs class-validator (`whitelist` + `forbidNonWhitelisted`) + mapeo explícito |

## 8. Environment Setup (first-time)

```bash
# Prerequisites
# - Node.js 24.19.0 LTS (engines obligatorio — el install falla con otro runtime)
# - pnpm 10 (corepack o pnpm/action-setup v4, version: 10)
# - Docker Desktop (for PostgreSQL)

# Setup
git clone <repo>
cd briefline-crm
pnpm install --frozen-lockfile
docker compose -f docker/compose.yml up -d
cp .env.example .env
pnpm --filter @briefline/api prisma:migrate:deploy
pnpm --filter @briefline/api prisma:seed
pnpm dev
```

- Comprobar instalación limpia: **todos los comandos raíz** (`typecheck`, `lint`, `test`, `build`) pasan desde checkout fresco.
- Contrato verificado: `pnpm --filter @briefline/api-contract generate` produce **diff vacío** (REP-006).
- DB saludable: healthcheck del compose responde antes de migrar.

## 9. Testing Patterns

- **Unit (Vitest 4):** `describe('Module / Component', () => { it('should behavior', () => { ... }) })`. Comportamiento observable, no implementación. Config canónica: `test.projects` (unit / integration / components-jsdom), `globals: true` en components, coverage 80/80/70/80.
- **Integration:** Testcontainers `postgres:17-alpine` (mismo major que producción) o service container en CI; BD **real**; setup/teardown por archivo (`beforeAll` 60–120 s, puerto vía `getConnectionUri()`, `TRUNCATE ... RESTART IDENTITY CASCADE` en `beforeEach`); `prisma migrate deploy` antes de los tests; `app.setGlobalPrefix('api')` replicado.
- **E2E (Playwright):** fixtures controlados por test (**nunca** seed de desarrollo); `webServer: { command: 'pnpm --filter web build && pnpm --filter web preview' }` (preview de producción en `:4173`, no dev server); locators web-first (`getByRole`/`getByLabel`); `data-testid` solo para drag & drop; sin `waitForTimeout` ni `reuseContext`.
- **a11y:** axe con `@axe-core/playwright` (`withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa'])`); fallar solo en **serious/critical**; cada exclusión documentada inline: `// a11y-exclusion <id>: <motivo>`. Axe automatizado NO es claim de accesibilidad — complementa checklist manual (QA-007).

**Regla transversal:** ninguna API de dependencia puede usarse si no está verificada en el baseline (§1). Si necesitas una API nueva: verifica (Context7 + `npm view`), registra el conflicto en §0 del baseline y actualiza el documento **antes** de escribir código.
