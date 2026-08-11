# QA Tooling Verification — Briefline CRM

**Date:** 2026-08-11
**Task:** DOC-004 (plan maestro `docs/plans/04-development-plan.en.md`, PH-00)
**Owner:** QA
**Status:** Verificado — versiones consultadas en fuentes primarias en la fecha de la tarea; la versión exacta final la pina DOC-001 (technology matrix, sin placeholders `latest`).

Cada capa de test tiene herramienta seleccionada, propósito y limitación documentada. Los guards de PH-11 se respetan: sin snapshots gigantes frágiles, sin test IDs por defecto, sin exclusiones silenciosas de axe, sin claim de accesibilidad solo-automatizada, y sin sustituto SQLite para integración (PostgreSQL real obligatorio).

---

## Test Layer Matrix

| Layer | Tool | Version (2026-08-11) | Purpose | Limitations |
|---|---|---|---|---|
| Unit (backend) | Vitest | v4.x (v4.1.6 en Context7) | Reglas de dominio (permisos, estados, prioridades, temporal), mappers, utilities, guards, services con PrismaService mockeado | Mocks no verifican SQL real ni integración; jsdom no es un navegador; coverage de líneas ≠ comportamiento cubierto |
| Unit (frontend) | Vitest + @testing-library/react + jest-dom + user-event | Vitest v4.x / RTL v16.x / user-event v14.6.x | Componentes por comportamiento: render, queries por rol/label, interacciones realistas, matchers DOM | jsdom no renderiza layout ni estilos reales; no detecta problemas visuales ni de scroll/overflow; el cleanup automático exige `globals: true` o cleanup manual |
| Integration (API + PostgreSQL real) | Vitest + @nestjs/testing + Supertest + Testcontainers (`@testcontainers/postgresql`) | NestJS v11 / @nestjs/testing v11.1.x / supertest 7.x | Constraints, transacciones, rollback, locking, migraciones reales y contrato HTTP completo (QA-003, QA-004) | Requiere Docker; más lento que mocks; pull de imagen puede flakear el primer run; compartir una BD entre workers paralelos exige aislamiento (schema/BD por worker); suprimió SQLite/pg-mem por guard del plan |
| E2E (browser) | @playwright/test | v1.61.x | Flujos FLOW-001/002/003 sobre datos controlados por fixtures, no seed de desarrollo (QA-005) | Lento y flaky si el selector es malo; requiere webServer arrancado; el test escripta el browser, no reemplaza unit/integration; la ejecución en CI requiere browsers + deps del sistema |
| Accesibilidad automatizada | @axe-core/playwright (axe-core 4.x) sobre Playwright | axe-core 4.x | Rutas/estados primarios sin violaciones serious/critical (QA-006) | Solo ~32% de los criterios WCAG AA son automatizables; no valida screen reader real, ni foco lógico completo, ni experiencia de teclado real; exclusions ocultan violaciones (guard: documentar cada una) |
| Accesibilidad manual | Navegador + teclado + screen reader (VoiceOver en macOS / NVDA) | — | QA-007: keyboard, focus, 320 px, 400%, contraste, reduced motion, evidencia de screen reader | Manual y dependiente de plataforma; no se puede automatizar ni poner en CI; requiere checklist y registro de evidencia |
| CI | GitHub Actions (ubuntu-latest) + actions/setup-node + actions/cache | setup-node v4 / cache v4 | Gates: typecheck + unit + integration + e2e + coverage; browser matrix (QA-008) | Service container de Postgres es compartido entre procesos del job: los workers paralelos deben usar BD/schema separados; cache inválida con cada bump de Playwright; límite de 6 h/job |

---

## Vitest Configuration

### Monorepo Setup

Monorepo pnpm (PH-02 / ADR-005). En Vitest v4, `test.workspace` está **deprecado** y se sustituye por `test.projects`. El patrón recomendado es **una config raíz por paquete con `projects`** para separar unit (node) de components (jsdom) sin necesidad de archivos de workspace.

```ts
// vitest.config.ts (raíz del workspace, agrega los proyectos de cada app/package)
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['packages/**/*.{test,spec}.ts'],
          environment: 'node',
          globals: true,
          clearMocks: true,
          restoreMocks: true,
        },
      },
      {
        test: {
          name: 'integration',
          include: ['apps/api/test/integration/**/*.e2e-spec.ts'],
          environment: 'node',
          testTimeout: 60_000, // testcontainers: pull de imagen + migraciones
          hookTimeout: 120_000,
          fileParallelism: false, // cada archivo levanta su contenedor; evitar colisión
        },
      },
      {
        test: {
          name: 'components',
          include: ['apps/web/src/**/*.{test,spec}.{ts,tsx}'],
          environment: 'jsdom',
          globals: true,
          setupFiles: ['./vitest.setup.ts'],
          clearMocks: true,
        },
      },
    ],
    coverage: {
      provider: 'v8', // requiere devDependency @vitest/coverage-v8
      reporter: ['text', 'html', 'lcov'],
      include: ['packages/**/src/**/*.ts', 'apps/api/src/**/*.ts', 'apps/web/src/**/*.tsx'],
      exclude: ['**/*.test.*', '**/*.spec.*', '**/*.e2e-spec.*', '**/main.ts', '**/*.config.ts', '**/types/**'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 70,
        statements: 80,
      },
    },
  },
})
```

Notas verificadas:

- **Coverage:** `provider: 'v8'` usa el paquete separado `@vitest/coverage-v8`; `'istanbul'` usa `@vitest/coverage-istanbul`. `thresholds` admite override por glob (p. ej. `'src/utils/**.ts': { lines: 100 }`). Los thresholds fallan el run de CI si no se alcanzan.
- **En `projects`, el coverage es global:** el plugin de workspace fuerza `config.test.coverage = globalConfig.coverage` en cada proyecto; no hay thresholds por proyecto — ponerlos en la raíz.
- **CI:** `vitest run` (o `watch: false`) para una sola pasada. Sharding con `--shard=1/4` en jobs de matriz.

### API core verificada

- Suites y hooks: `describe`, `it`/`test`, `beforeEach`, `afterEach`, `beforeAll`, `afterAll`; añadidos en v3/v4: `aroundEach(runTest)` (wrap de transacción — encaja con rollback de BD), `aroundAll(runSuite)`, `onTestFinished` (cleanup siempre, pase o falle), `onTestFailed`. `beforeAll` puede devolver una función de cleanup que corre después de `afterAll`.
- `expect`: Chai-compatible; matchers habituales (`toBe`, `toEqual`, `toMatchObject`, `toThrow`, `toHaveBeenCalled*`, `toHaveLength`, `resolves`/`rejects`).
- Mocks:
  - `vi.fn(impl)` — función mock. `mock.calls`, `mock.results`, `mockClear()` (limpia historial, conserva implementación), `mockReset()` (historial + implementación → `undefined`), `mockImplementationOnce`, `withImplementation`.
  - `vi.spyOn(obj, 'method')` — espía método existente conservando el original; `spy.mockRestore()` lo restaura.
  - `vi.mock(path, factory)` — mock de módulo **hoisted** (la factory no puede referenciar variables de scope de archivo; usar `vi.hoisted()`). Sin factory, busca mock manual en carpeta `__mocks__` o auto-mockea. `vi.doMock` evita el hoisting (aplica al siguiente import dinámico).
  - Limpieza: `vi.clearAllMocks()` (historias), `vi.resetAllMocks()`, `vi.restoreAllMocks()` (restaura originales de spies). En config: `clearMocks: true` + `restoreMocks: true`.
- Timers: `vi.useFakeTimers({ toFake: ['nextTick', 'queueMicrotask'] })` + `vi.setSystemTime(date)` para fechas; `vi.useRealTimers()` en `afterEach`. Esencial para la lógica temporal del ADR-003 (overdue).
- Env: `vi.stubEnv('DATABASE_URL', ...)` / `vi.unstubAllEnvs()`.

### React Testing Library con Vitest

```ts
// vitest.setup.ts
import '@testing-library/jest-dom/vitest'
```

```ts
// vitest.config.ts — proyecto components
test: {
  environment: 'jsdom',
  globals: true,          // activa cleanup automático de RTL tras cada test
  setupFiles: ['./vitest.setup.ts'],
}
```

Con `globals: true` RTL registra `afterEach(cleanup)` automáticamente; sin globals hay que llamar `cleanup()` manualmente en un setup file. `@testing-library/jest-dom/vitest` registra los matchers en `expect` de Vitest y extiende los tipos (`declare module 'vitest' { interface Matchers<R> ... }`).

---

## NestJS Testing Patterns

### Unit tests de services (BD mockeada)

```ts
import { Test } from '@nestjs/testing'
import { TasksService } from './tasks.service'

describe('TasksService — permission rules', () => {
  let service: TasksService

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: PrismaService, useValue: { task: { findUnique: vi.fn() } } },
      ],
    }).compile()
    service = moduleRef.get(TasksService)
  })

  it('member can edit own task', () => { /* ... */ })
})
```

- `Test.createTestingModule({ imports, controllers, providers })` → `TestingModuleBuilder` → `.compile()`.
- Overrides encadenables: `overrideProvider(X).useValue/.useClass/.useFactory`, `overrideModule(M).useModule(Alt)`, `overrideGuard`, `overrideInterceptor`, `overrideFilter`, `overridePipe`. `compile()` es obligatorio al final.
- **Trampa verificada:** un guard global registrado con `APP_GUARD` no se puede overridear por token a menos que se registre con `useExisting` en producción (`{ provide: APP_GUARD, useExisting: JwtAuthGuard }`) — ajustar `app.module.ts` desde el inicio para poder mockear auth en tests.

### Integration Test Template (API + PostgreSQL real + Supertest)

```ts
import * as request from 'supertest'
import { Test } from '@nestjs/testing'
import { INestApplication } from '@nestjs/common'
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { PrismaService } from '../src/prisma/prisma.service'
import { AppModule } from '../src/app.module'

describe('Tasks API (e2e, real PostgreSQL)', () => {
  let app: INestApplication
  let container: StartedPostgreSqlContainer
  let prisma: PrismaService

  beforeAll(async () => {
    // 1) Contenedor efímero con el MISMO major version que producción
    container = await new PostgreSqlContainer('postgres:16-alpine').start()

    // 2) PrismaClient se construye al instanciar PrismaService: DATABASE_URL
    //    debe estar seteado ANTES de la primera instanciación.
    process.env.DATABASE_URL = container.getConnectionUri()

    // 3) Migraciones reales sobre el contenedor
    //    (en CI: npx prisma migrate deploy; local: se ejecuta aquí o en globalSetup)
    //    `npx prisma generate` ya debe haberse ejecutado en la instalación.

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      // .overrideProvider(JwtAuthGuard).useClass(MockAuthGuard)  // si aplica
      .compile()

    app = moduleRef.createNestApplication()
    app.setGlobalPrefix('api')           // replicar bootstrap de producción
    app.enableCors({ credentials: true, origin: 'http://localhost:5173' })
    await app.init()

    prisma = app.get(PrismaService)
  }, 120_000) // primer run: pull de imagen + migraciones

  beforeEach(async () => {
    // 4) Limpieza determinista entre tests
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "Task", "Client", "User" RESTART IDENTITY CASCADE',
    )
    // seed mínimo controlado por el propio test
  })

  it('POST /api/auth/login returns cookie on valid credentials', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'admin@example.com', password: '...' })
      .expect(201)
  })

  afterAll(async () => {
    await app.close()
    await container.stop() // obligatorio: evita leaks de contenedores
  })
})
```

Patrones de setup/teardown de BD verificados (elegir por caso):

1. **TRUNCATE ... RESTART IDENTITY CASCADE** en `beforeEach` — determinista, correcto con cualquier modelo de conexión. Suficiente para el volumen de Briefline.
2. **Transaction rollback** (`BEGIN`/`ROLLBACK` en hooks, tests usan el `client` en vez del pool) — 10–100× más rápido que truncate; no vale para tests que commitean o usan varias conexiones. En Vitest v4 se puede expresar elegantemente con `aroundEach(runTest)`.
3. **Schema o BD por worker** — `CREATE SCHEMA test_${VITEST_POOL_ID}` + `SET search_path` (o una BD distinta por shard) cuando los tests corren en paralelo contra el mismo servidor (CI con un solo service container). Contenedor por archivo (`fileParallelism: false` en integración) evita el problema sin más maquinaria.
4. **globalSetup de Vitest** — un contenedor por run/worker, migraciones una vez, publicar URLs con `provide('postgresUrls', ...)` / `inject` tipado (estilo `@opengovsg/testcontainers`).

Reglas firmes:

- **Nunca** hardcodear el puerto 5432: usar `container.getConnectionUri()` (puerto aleatorio, evita colisiones).
- `beforeAll` con timeout generoso (60–120 s): CI tira del pull de imagen.
- `container.stop()` en `afterAll` con `?.` para no romper por setup parcial.
- Pin de imagen (`postgres:16-alpine`), nunca `:latest`. Con Prisma, `DATABASE_URL` se setea antes de construir `PrismaClient`; `prisma migrate deploy` contra el contenedor valida que las migraciones reales funcionen desde BD vacía.
- Para la suite de integración de Briefline (QA-003/QA-004): contenedor por archivo + truncate en `beforeEach` es el default; si el tiempo de suite crece, migrar a globalSetup con un contenedor por worker.
- Supertest manda JSON vía HTTP: las assertions de cookies/CSRF/429/403 se prueban a nivel HTTP. El guard "no SQLite integration substitute" prohíbe pg-mem/sqlite como alternativa.

---

## Playwright Configuration

### Project Setup

```ts
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,   // política anti-flaky: retry 1–2 en CI, quarantine después
  reporter: process.env.CI ? [['html', { open: 'never' }], ['github']] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',  // preview de producción, no dev server
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm --filter web build && pnpm --filter web preview',
    url: 'http://127.0.0.1:4173',
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    // QA-008 browser matrix: últimos dos estables de cada motor o limitación documentada.
    // Para el MVP: Chromium en CI como mínimo; Firefox/WebKit en la matriz si presupuesto lo permite.
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
})
```

- **`webServer`** arranca la app antes de los tests y espera a que `url` responda; `reuseExistingServer: !process.env.CI` permite reusar un server local en TDD. Nota: cada proyecto/job dispara su propio webServer si no se comparte; en CI con varios proyectos usar `webServer.reuseExistingServer: false` y un solo job por shard.
- **Isolation:** Playwright crea un **browser context nuevo por test** (cookies, storage, service workers limpios). La opción experimental `reuseContext: true` es solo para component testing y NO garantiza aislamiento — no usar en E2E.
- **Fixtures para datos controlados (no seed de desarrollo):** los tests crean/limpian sus propios datos vía API o BD de test. El guard del plan exige datos controlados, nunca el seed de desarrollo.

```ts
// fixtures.ts
import { test as base, expect } from '@playwright/test'
import { createUserInTestDatabase, deleteUserFromTestDatabase } from './db-utils'

// Fixture scope 'worker': una vez por worker, con índice único por worker
export const test = base.extend<{}, { dbUser: string }>({
  dbUser: [
    async ({}, use) => {
      const name = `user-${test.info().workerIndex}`
      await createUserInTestDatabase(name)
      await use(name)
      await deleteUserFromTestDatabase(name)
    },
    { scope: 'worker' },
  ],
})

export { expect }
```

### Selectors (verificados)

- Preferencia: `getByRole` (botones, headings, alerts, dialog, textbox con `name`) y `getByLabel` (formularios) — testean lo que ve un usuario real y la semántica a11y a la vez.
- `getByText` para contenido visible; `toMatchAriaSnapshot()` para validar estructura de accesibilidad esperada.
- `getByTestId` solo para casos donde no hay rol/label razonable (drag & drop del kanban), **sin data-testid por defecto** (guard del plan).
- Assertions web-first (auto-wait): `toBeVisible`, `toHaveText`, `toHaveValue`, `toBeChecked`, `toHaveCount`. Evitar `page.waitForTimeout` y sleep ad-hoc.
- No usar locators con texto largo fragil (`toHaveText` sobre el propio texto locator).

### E2E a11y con Playwright (puente hacia la capa axe)

```ts
import AxeBuilder from '@axe-core/playwright'

test('board page has no serious/critical a11y violations', async ({ page }) => {
  await page.goto('/board')
  // para contenido dinámico/modal: esperar a que el elemento esté visible antes de analizar
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze()
  const serious = results.violations.filter((v) => ['serious', 'critical'].includes(v.impact))
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([])
})
```

---

## Accessibility Testing Strategy

### Automated (axe)

- Herramienta: `@axe-core/playwright` (AxeBuilder sobre la `page` de Playwright) — sin configuración extra, API fluida verificada:
  - `include(selector)` / `exclude(selector)` — scope del análisis; **cada exclusión debe documentarse en el test** (guard: sin exclusiones silenciosas).
  - `withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa'])` — objetivo WCAG 2.2 AA (el plan exige WCAG 2.2 AA).
  - `withRules(ids)` / `disableRules(ids)` — deshabilitar solo por motivo documentado (falsos positivos conocidos del framework, nunca por comodidad).
  - `options(runOptions)` — `axe.run` completo: `runOnly.type: 'tag'`, `rules: { 'color-contrast': { enabled: true } }`.
  - `analyze()` → `{ violations, passes, incomplete, inapplicable }`; `violations[].impact` ∈ `critical | serious | moderate | minor`.
- Estrategia QA-006: escanear rutas/estados primarios (login, dashboard, board, task detail, clients, users, 403/404, empty/error/loading) y fallar solo en `serious`/`critical` (threshold). Escanear también estados tras interacción (modal abierto, filtro aplicado, drag&drop).
- Fixture recomendada `makeAxeBuilder` (extender `test` de Playwright con la configuración de tags) para reutilizar el builder en cada test.
- Corre en cada proyecto de browser (Chromium/Firefox/WebKit) porque el resultado puede variar por motor.

### Manual Checklist

QA-007 — registrar evidencia (capturas + notas), nunca "automation-only":

1. **Teclado:** navegar toda la app solo con Tab/Shift+Tab/Enter/Escape/espacio; el orden de foco sigue el orden visual; drag & drop del kanban debe tener el flujo alternativo por teclado (requisito del brief).
2. **Focus visible:** indicador de foco en cada elemento interactivo; no hay focus traps; el foco se mueve correctamente al abrir/cerrar modales y al navegar el board.
3. **Zoom 400% y 320 px:** sin pérdida de contenido ni scroll horizontal; reflow correcto.
4. **Contraste:** pares de texto/fondo ≥ 4.5:1 (texto normal) y ≥ 3:1 (grande/UI) — axe `color-contrast` cubre parte, revisar gradientes y estados hover/focus manualmente.
5. **Reduced motion:** con `prefers-reduced-motion: reduce` activado no hay animaciones de movimiento (drag, transiciones) que impidan uso.
6. **Screen reader:** VoiceOver (macOS) y/o NVDA (Windows): login, board, task detail, historial; los estados de drag&drop se comunican; `aria-live` para cambios asíncronos.
7. **Targets táctiles** ≥ 44×44 px y estados hover/focus/active distinguibles.

### Known Gaps

- axe solo automatiza una fracción del WCAG (referencias de Deque sitúan el alcance automatizable en torno al 30–40% de los criterios; el criterio aceptado es que la mayoría de criterios AA no son automatizables). El claim de accesibilidad del proyecto debe combinar axe + checklist manual + screen reader (guard explícito: no claim automation-only).
- Lo que axe NO detecta (documentado como gaps): experiencia real de screen reader (significado semántico en contexto, anuncios, tabbing del lector); orden de foco y focus management en SPA complejas; focus traps; contenido que aparece tras interacción si no se espera a que sea visible; contraste sobre gradientes/imágenes (falsos positivos/negativos); zoom/reflow real a 320 px y 400%; reduced motion real; keyboard-only usability completa; errores de label en contexto dinámico. También: axe corre sobre el DOM renderizado — código muerto o ramas no renderizadas en el test quedan fuera.
- `disableRules`/`exclude` mal usados anulan la garantía: la CI solo exige que cada exclusión tenga un comentario `// a11y-exclusion <id>: <motivo>`.

---

## CI Pipeline

### GitHub Actions Workflow Template

```yaml
# .github/workflows/ci.yml
name: CI
on:
  push:
    branches: [main]
  pull_request:

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  quality:
    name: Typecheck + Unit + Coverage
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 10 }
      - uses: actions/setup-node@v4
        with:
          node-version: 24            # runtime del plan; pin en DOC-001
          cache: pnpm                 # cache del store de pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck           # verify_cmd del protocolo
      - run: pnpm test -- --coverage  # unit + components; thresholds fallan si no se alcanzan
      - name: Upload coverage
        uses: actions/upload-artifact@v4
        with: { name: coverage, path: coverage/lcov.info, if-no-files-found: error }

  integration:
    name: Integration (PostgreSQL real)
    runs-on: ubuntu-latest
    services:
      postgres:                       # service container: una BD por JOB
        image: postgres:16-alpine
        env:
          POSTGRES_DB: briefline_test
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
        ports: ['5432:5432']
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    env:
      DATABASE_URL: postgresql://test:test@localhost:5432/briefline_test
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 10 }
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter api exec prisma migrate deploy   # migraciones reales antes de testear
      - run: pnpm test:e2e                                  # Vitest integration + Supertest + supertest contra service container
      #   Aislamiento: con fileParallelism true, cada worker en paralelo comparte esta BD:
      #   usar schema por worker (VITEST_POOL_ID) o --shard=1/N por job.
      #   Alternativa sin service container: Testcontainers (ubuntu-latest trae Docker).

  e2e:
    name: E2E (${{ matrix.browser }})
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        browser: [chromium, firefox, webkit]   # QA-008: o documentar limitación (p. ej. solo chromium)
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 10 }
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - name: Cache Playwright browsers
        id: pw-cache
        uses: actions/cache@v4
        with:
          path: ~/.cache/ms-playwright
          key: ${{ runner.os }}-playwright-${{ hashFiles('pnpm-lock.yaml') }}
      - name: Install Playwright (with system deps)
        if: steps.pw-cache.outputs.cache-hit != 'true'
        run: npx playwright install --with-deps
      - name: Install system deps only (cache hit)
        if: steps.pw-cache.outputs.cache-hit == 'true'
        run: npx playwright install-deps chromium firefox webkit
      - run: npx playwright test --project=${{ matrix.browser }}
        env:
          CI: 'true'
          TEST_DATABASE_URL: ${{ needs.integration.outputs... }}  # o fixture que crea datos vía API
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report-${{ matrix.browser }}
          path: playwright-report/
          retention-days: 14
```

Puntos verificados:

- **actions/setup-node@v4** con `cache: pnpm` (o `npm`) sustituye al actions/cache manual para el store de paquetes; `actions/cache@v4` se usa para los browsers de Playwright en `~/.cache/ms-playwright`, con key por runner + lockfile (se invalida al subir Playwright). Instalar con `--with-deps` (browsers + deps del sistema); en cache-hit solo `install-deps` (evita re-download de browsers).
- **PostgreSQL service container:** health check con `pg_isready` (interval 10s, timeout 5s, retries 5) antes de lanzar los tests; credenciales solo de test; `pg_isready` valida servidor, no credenciales — la conexión real de Prisma es la que valida. El contenedor es **compartido por el job**: para paralelismo dentro del job, schema/BD por worker (ver sección NestJS); alternativa más aislada: Testcontainers dentro del propio runner (Docker disponible en ubuntu-latest) — en ese caso no hace falta `services:`.
- **Playwright en CI:** `retries: 2`, `forbidOnly`, trace/screenshot/video solo en fallo, reporte HTML + `github` reporter, artifact en failure. La app la arranca `webServer` (build + preview en el job de e2e) o `npm run start` con `reuseExistingServer: !process.env.CI`.
- **verify_cmd (protocolo de desarrollo):** backend `pnpm typecheck && pnpm test && pnpm test:e2e`; frontend `pnpm typecheck && pnpm test`. El CI replica los mismos gates con coverage.
- Los jobs de e2e y de unit/integration corren la BD de test con datos **creados por los propios tests** (fixtures), nunca el seed de desarrollo.

---

## Fuentes (fuentes primarias consultadas el 2026-08-11)

- Vitest v4 docs — https://vitest.dev/guide/ | API `vi` — https://vitest.dev/api/vi/ | coverage — https://vitest.dev/config/#coverage | projects/workspace — https://vitest.dev/guide/workspace
- NestJS testing — https://docs.nestjs.com/fundamentals/unit-testing
- Playwright config/test — https://playwright.dev/docs/test-configuration | fixtures — https://playwright.dev/docs/test-fixtures | webServer — https://playwright.dev/docs/test-webserver | locators — https://playwright.dev/docs/locators
- axe-core API — https://www.deque.com/axe/core-documentation/api-documentation/ | axe-core npm (playwright wrapper) — https://github.com/dequelabs/axe-core-npm
- React Testing Library — https://testing-library.com/docs/react-testing-library/intro | cheatsheet — https://testing-library.com/docs/react-testing-library/cheatsheet | user-event — https://testing-library.com/docs/user-event/intro | jest-dom — https://github.com/testing-library/jest-dom
- GitHub Actions service containers — https://docs.github.com/en/actions/using-containerized-services/creating-postgresql-service-containers | setup-node — https://github.com/actions/setup-node | cache — https://github.com/actions/cache
- Testcontainers for Node.js — https://node.testcontainers.org/ | módulo Postgres — https://node.testcontainers.org/modules/postgres/

## Recomendaciones para los agentes de implementación

1. La suite de integración **siempre** sobre PostgreSQL real (testcontainers o service container de CI); pg-mem/sqlite quedan excluidos por guard del plan.
2. Configurar el bootstrap de NestJS como función reutilizable (`app = await createApp(moduleRef)`) para replicar globalPrefix/CORS/CSRF idénticos en tests y producción — evita divergencias de rutas.
3. Los unit tests de FE deben usar `getByRole`/`getByLabel` como default y reservar `data-testid` para drag & drop; los E2E usan fixtures que crean datos vía API, con limpieza en teardown.
4. axe: correr siempre con tags WCAG 2.2 AA y fallar solo en serious/critical; documentar cada exclusión inline.
5. Los thresholds de coverage (80/80/70/80) se aplican en CI vía `pnpm test -- --coverage` y son el gate del verify_cmd; los archivos de infraestructura (main.ts, configs, tipos) quedan excluidos del cálculo.
