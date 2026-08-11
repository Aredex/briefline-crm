# PH-02 DevOps Summary — REP-005 & CI-001

**Date:** 2026-08-11
**Task:** PH-02 (04-development-plan.en.md) — REP-005 Local PostgreSQL Compose + CI-001 Initial PR CI
**Owner:** DEVOPS
**Status:** Implementado — archivos creados, pendiente de ejecución real del workspace (REP-001/REP-002)

---

## Archivos creados

| Archivo | Propósito |
|---|---|
| `docker/compose.yml` | Postgres 17 local para desarrollo (REP-005) |
| `.env.example` | Variables de entorno de desarrollo local (template → `.env`) |
| `.github/workflows/ci.yml` | Pipeline CI de PR/push a main (CI-001) |
| `ph02-devops-summary.md` | Este documento |

---

## REP-005 — Local PostgreSQL (docker/compose.yml)

- **Imagen `postgres:17-alpine`** — alineada con Neon (producción, `devops-platform-validation.md`): mismo major version, sin sorpresas entre local/CI/prod.
- **Healthcheck** con `pg_isready -U briefline -d briefline` (interval 5 s, timeout 5 s, retries 5) — la verificación de PH-02 exige "database becomes healthy".
- **Volumen nombrado `pgdata`** persistente: `down` conserva datos; `down -v` los borra (documentado en comentarios del archivo).
- **Puerto 5432** (default), `container_name: briefline-db`.
- **Credenciales de desarrollo** (`briefline` / `briefline-local` / db `briefline`) documentadas como NO-secrets: nunca reutilizar en producción (PH-12 OPS-005 — los secrets viven en Render/Neon/GitHub, rotación documentada en OPS-010).

### Uso

```bash
docker compose -f docker/compose.yml up -d   # levantar BD local
cp .env.example .env                          # luego pnpm dev en apps/api
```

`.env.example` define `DATABASE_URL` y `DIRECT_URL` apuntando al contenedor local. En producción ambas se reemplazan por las URLs de Neon (pooled `-pooler` / direct, `sslmode=require`, `connect_timeout=15` — ver `devops-platform-validation.md` §Neon). Los JWT/CSRF secrets del ejemplo son placeholders explícitos ("change-in-production").

---

## CI-001 — Initial PR CI (.github/workflows/ci.yml)

### Estructura

- **`quality`** (ubuntu-24.04, timeout 15 min): install → generate Prisma → migrate → lint → typecheck → test → build.
- **`e2e`** (ubuntu-24.04, timeout 20 min, `needs: quality`): solo corre si quality pasa — ahorra minutos de la cuota free (2,000 min/mes, `devops-platform-validation.md` §GitHub Actions). Mismo setup + Playwright browsers + `pnpm test:e2e`.

### Pines (obligatorios por technology-matrix.md / CR-06)

| Componente | Pin | Fuente |
|---|---|---|
| Runner | `ubuntu-24.04` (nunca `ubuntu-latest`) | CR-06; matrix fila GitHub Actions |
| Node | 24 (`actions/setup-node@v4`) | Node 20 se retira del runner el 2026-09-16 |
| pnpm | `pnpm/action-setup@v4`, `version: 10` | ADR DEC-031 / consolidated-api-baseline §1.4.3 (el technology-matrix no pina pnpm en su tabla; el valor autorizado del proyecto es 10) |
| Postgres service | `postgres:17-alpine` + `--health-cmd pg_isready` | mismo major que local y Neon |
| Lockfile | `pnpm install --frozen-lockfile` | REP-001: nunca regenera `pnpm-lock.yaml` |

### Decisiones y desviaciones sobre el template original

1. **`DIRECT_URL` añadida a los pasos de migración** (única corrección funcional): el datasource del schema declara `directUrl = env("DIRECT_URL")` (data-model.md §2, Prisma 7). Sin esa variable, `prisma migrate deploy` falla con "Environment variable not found". En CI ambas apuntan al service container (no hay pooling local).
2. **`concurrency` guard** (`ci-${{ github.ref }}, cancel-in-progress: true`): patrón del proyecto (qa-tooling-verification.md §CI); cancela runs superseded de la misma ref y ahorra minutos.
3. **Cache de browsers Playwright** (`~/.cache/ms-playwright`, key por runner + hash del lockfile) + **upload del reporte en failure** (`retention-days: 14`): ambos son configuración autorizada en qa-tooling-verification.md §CI / consolidated-api-baseline §1.4.3.
4. **El job `e2e` no ejecuta `pnpm build` explícito**: Playwright arranca la app vía `webServer` (build + preview en puerto 4173, qa-tooling-verification.md §Playwright Configuration). El build de producción se verifica en `quality`.
5. **Secrets CI como valores dummy** (`ci-test-jwt-secret` / `ci-test-csrf-secret`): seguro para tests, nunca secrets reales (guards PH-02: "no secrets in examples").

### Gates = verify_cmd del protocolo

`pnpm lint` + `pnpm typecheck` + `pnpm test` (unit + integración sobre Postgres real, service container) + `pnpm build`; E2E aparte con `pnpm test:e2e`. Coverage con thresholds (80/80/70/80) se añadirá cuando exista la config de Vitest (PH-03/PH-11), vía `pnpm test -- --coverage`.

---

## Requisitos aguas abajo (REP-002 / REP-006, que DEBEN existir cuando llegue el código)

1. **Scripts en `@briefline/api`**: `prisma:generate` y `prisma:migrate:deploy` (nombres usados por el CI).
2. **Script en `@briefline/web`**: `playwright:install` — debe instalar con `--with-deps` (browsers + dependencias del sistema; technology-matrix.md fila Playwright).
3. **Scripts raíz**: `lint`, `typecheck`, `test`, `test:e2e`, `build` (REP-002: autoritativos; CI los invoca sin `--filter`).
4. **`pnpm-lock.yaml` commiteado** — `--frozen-lockfile` fallará si no está.
5. **Aislamiento de tests de integración**: el service container de cada job es una BD compartida; si los workers de Vitest corren en paralelo usar schema/BD por worker (`VITEST_POOL_ID`) o contenedor por archivo (`fileParallelism: false`) — qa-tooling-verification.md §CI.
6. **Prisma client generado** (REP-006): `prisma:generate` antes de cualquier test (el CI ya lo hace), determinístico y nunca hand-edited.

## Referencias

- technology-matrix.md (pines Node 24, ubuntu-24.04, postgres 17, pnpm)
- devops-platform-validation.md (Postgres 17 Neon, cuota GHA, migraciones vía direct URL)
- qa-tooling-verification.md §CI Pipeline (service container, cache Playwright, reportes, concurrency)
- data-model.md §2/§6 (datasource con `directUrl`, `migrate deploy` en CI, nunca `db push`)
- consolidated-api-baseline.md §1.4 (configuración autorizada de CI)
- 04-development-plan.en.md PH-02 (REP-005/CI-001), PH-03 (DB-008), PH-12 (OPS-004/005)
