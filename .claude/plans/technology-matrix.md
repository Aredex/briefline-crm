# Technology Matrix — Briefline CRM
**Date:** 2026-08-11
**Status:** Draft for review
**Verification method:** Context7 MCP (documentación oficial) + `npm view <pkg> version` (registro npm, autoritativo, fecha 2026-08-11) + WebSearch. Sin rangos ni `latest` — versiones exactas verificadas.

---

## Frontend Dependencies

| Package | Version | Purpose | Official Docs | Owner |
|---|---|---|---|---|
| react | 19.2.8 | Librería UI (última estable en npm; 19.3.0 está en desarrollo en GitHub, no publicada) | https://react.dev | FE |
| react-dom | 19.2.8 | Renderizado DOM de React (debe pinarse igual que react) | https://react.dev | FE |
| typescript | 5.9.3 | Compilador TS estricto, versión monorepo única (ver Notas de verificación: 6.0.3 y 7.0.2 existen) | https://www.typescriptlang.org/docs/ | ARCH |
| vite | 8.2.1 | Bundler/dev server (Vite 8 requiere Node ^20.19 \|\| >=22.12 — compatible con Node 24) | https://vite.dev | FE |
| @vitejs/plugin-react | 6.0.5 | Plugin React para Vite 8 (Oxc, sin Babel; HMR + Fast Refresh) | https://github.com/vitejs/vite-plugin-react | FE |
| react-router | 7.18.2 | Routing en Data Mode (último 7.x; v8.3.0 existe pero el plan pinna v7. React Router v7: Node >=20, React >=18) | https://reactrouter.com | FE |
| @tanstack/react-query | 5.101.4 | Estado de servidor / data fetching (v5; v6 en beta — no usar) | https://tanstack.com/query/latest | FE |
| @tanstack/react-query-devtools | 5.101.4 | DevTools de TanStack Query en desarrollo | https://tanstack.com/query/latest/docs/react/devtools | FE |
| zod | 4.4.3 | Validación de schemas (compartido con api-contract; Zod 4, no 3) | https://zod.dev | FE / ARCH |
| react-hook-form | 7.85.0 | Form library (v7 estable; v8 en beta — no usar) | https://react-hook-form.com | FE |
| @hookform/resolvers | 5.7.1 | Puente zod ↔ react-hook-form (validación de schemas en forms) | https://github.com/react-hook-form/resolvers | FE |
| @dnd-kit/core | 6.3.1 | Drag & drop (core, sensores pointer/keyboard) | https://docs.dndkit.com | FE |
| @dnd-kit/sortable | 10.0.0 | Drag & drop sortable (requiere peer @dnd-kit/core ^6.3.0) | https://docs.dndkit.com/presets/sortable | FE |
| @dnd-kit/utilities | 3.2.2 | Utilidades CSS/transform de dnd-kit (dependencia de core y sortable) | https://docs.dndkit.com | FE |
| @testing-library/react | 16.3.2 | Testing de componentes React (soporte React 19; requiere peer @testing-library/dom) | https://testing-library.com/docs/react-testing-library/intro/ | QA |
| @testing-library/dom | 10.4.1 | Peer requerido por RTL v16 y jest-dom v7 | https://testing-library.com/docs/dom-testing-library/intro/ | QA |
| @testing-library/jest-dom | 7.0.1 | Matchers DOM para Vitest (v7: requiere Node >=22 y peer @testing-library/dom) | https://github.com/testing-library/jest-dom | QA |
| @testing-library/user-event | 14.6.3 | Simulación de interacciones de usuario | https://testing-library.com/docs/user-event/intro | QA |
| vitest | 4.1.10 | Test runner unit (soporta Vite 8; usado en web y api) | https://vitest.dev | QA |
| @vitest/coverage-v8 | 4.1.10 | Reporte de coverage (debe coincidir con vitest) | https://vitest.dev/guide/coverage | QA |
| jsdom | 30.0.1 | Entorno DOM para tests unit (Node ^22.22 \|\| ^24.15 \|\| >=26 — compatible con Node 24) | https://github.com/jsdom/jsdom | QA |
| axe-core | 4.13.0 | Motor de auditoría a11y (usado en E2E Playwright y en web) | https://github.com/dequelabs/axe-core | QA |
| @axe-core/react | 4.12.1 | Auditoría a11y en desarrollo (monta axe-core sobre el árbol React) | https://github.com/dequelabs/axe-core-npm | QA |

## Backend Dependencies

| Package | Version | Purpose | Official Docs | Owner |
|---|---|---|---|---|
| @nestjs/core | 11.1.29 | Núcleo de NestJS (NestJS 11; Express 5 bajo el capó) | https://docs.nestjs.com | BE |
| @nestjs/common | 11.1.29 | Decoradores, pipes, guards, interceptors (incluye ValidationPipe) | https://docs.nestjs.com | BE |
| @nestjs/platform-express | 11.1.29 | Adaptador Express 5 (usa express.json/urlencoded nativos; body-parser no es necesario) | https://docs.nestjs.com/faq/raw-body | BE |
| @nestjs/config | 4.0.4 | Configuración por variables de entorno / .env (línea 4.x es la compatible con Nest 11) | https://docs.nestjs.com/techniques/configuration | BE |
| @nestjs/validation | — (NO EXISTE) | La validación se hace con class-validator + class-transformer vía ValidationPipe de @nestjs/common. Verificado: E404 en registro npm | https://docs.nestjs.com/techniques/validation | BE |
| @nestjs/throttler | 6.5.0 | Rate limiting (por IP / por usuario) | https://github.com/nestjs/throttler | BE |
| @nestjs/swagger | 11.4.6 | OpenAPI/Swagger para la API (línea 12 es alpha — no usar) | https://docs.nestjs.com/openapi/introduction | BE |
| @nestjs/serve-static | 5.0.5 | Servir el SPA build de web desde la API (opcional si el deploy separa estáticos) | https://github.com/nestjs/serve-static | BE |
| @nestjs/jwt | 11.0.2 | Emisión/verificación de JWT (HS256) | https://docs.nestjs.com/security/authentication | BE |
| @nestjs/passport | 11.0.5 | Integración Passport con NestJS | https://docs.nestjs.com/security/authentication | BE |
| passport | 0.7.0 | Middleware de autenticación (estrategias) | https://www.passportjs.org | BE |
| passport-jwt | 4.0.1 | Estrategia JWT para Passport | https://github.com/mikenicholson/passport-jwt | BE |
| @types/passport-jwt | 4.0.1 | Tipos TS para passport-jwt | https://www.npmjs.com/package/@types/passport-jwt | BE |
| @prisma/client | 7.9.1 | ORM Prisma 7 (client generado; engines: Node ^20.19 \|\| ^22.12 \|\| >=24 — OK con Node 24) | https://www.prisma.io/docs | BE |
| prisma | 7.9.1 | CLI de Prisma (migraciones, generate, studio). Prisma 8 está en RC — no usar | https://www.prisma.io/docs/orm | BE |
| argon2 | 0.45.1 | Hash de contraseñas Argon2id (bindings oficiales, binarios precompilados, mantenido activo) | https://github.com/ranisalt/node-argon2 | BE |
| cookie-parser | 1.4.7 | Parseo de cookies firmadas (requerido por csrf-csrf) | https://github.com/expressjs/cookie-parser | BE |
| @types/cookie-parser | 1.4.10 | Tipos TS para cookie-parser | https://www.npmjs.com/package/@types/cookie-parser | BE |
| csrf-csrf | 4.0.3 | Protección CSRF patrón Double Submit Cookie (reemplazo oficial recomendado de NestJS para el deprecado csurf) | https://github.com/Psifi-Solutions/csrf-csrf | BE |
| class-validator | 0.15.1 | Validación declarativa de DTOs (decorators) | https://github.com/typestack/class-validator | BE |
| class-transformer | 0.5.1 | Transformación plain→class para ValidationPipe | https://github.com/typestack/class-transformer | BE |
| helmet | 8.3.0 | Headers HTTP de seguridad (CSP, HSTS, etc.) | https://helmetjs.github.io | BE |
| compression | 1.8.1 | Compresión gzip/br de respuestas (Express middleware oficial) | https://github.com/expressjs/compression | BE |
| @nestjs/testing | 11.1.29 | Testing de módulos Nest (TestingModule) con Vitest | https://docs.nestjs.com/fundamentals/testing | QA |
| tsx | 4.23.12 | Runner TS para scripts de prisma (seed/reset, DB-005/006); verificado npm view 2026-08-11 | https://tsx.is | BE |

## QA & DevOps Dependencies

| Package | Version | Purpose | Official Docs | Owner |
|---|---|---|---|---|
| @playwright/test | 1.62.1 | E2E testing (Chromium 151 / Firefox 153 / WebKit 26.5 incluidas) | https://playwright.dev | QA |
| vitest | 4.1.10 | Test runner unit (web y api — mismo pin que FE) | https://vitest.dev | QA |
| @vitest/coverage-v8 | 4.1.10 | Coverage v8 (mismo pin que vitest) | https://vitest.dev/guide/coverage | QA |
| axe-core | 4.13.0 | Auditoría a11y dentro de los E2E Playwright | https://github.com/dequelabs/axe-core | QA |
| jest-axe | 11.0.0 | NO usar: pensado para Jest. Con Vitest se usa axe-core directo + @axe-core/react. Documentado por completitud | https://github.com/nickcolley/jest-axe | QA |
| @nestjs/cli | 11.0.24 | CLI de NestJS (generate, build) | https://docs.nestjs.com/cli/overview | BE |
| @nestjs/schematics | 11.1.0 | Generadores de código del CLI de NestJS (peer de @nestjs/cli) | https://docs.nestjs.com/cli/usages | BE |
| @types/node | 24.13.3 | Tipos de Node.js alineados con el runtime Node 24 (NO usar @types/node@26: es para Node 26) | https://www.npmjs.com/package/@types/node | ARCH |
| GitHub Actions — runner | ubuntu-24.04 (pin explícito) | `ubuntu-latest` hoy resuelve a 24.04, pero al pinar evitamos la transición futura a 26.04. 4 vCPU/16 GB RAM | https://docs.github.com/actions | OPS |
| GitHub Actions — setup-node | v4 (action) | Instala Node; `node-version: 24` (24.19.0 actual); cache de pnpm activado | https://github.com/actions/setup-node | OPS |
| GitHub Actions — Playwright | `npx playwright install --with-deps` | Instala browsers en el runner (ubuntu-24.04 incluye deps del sistema) | https://playwright.dev/docs/ci | OPS |
| GitHub Actions — PostgreSQL | Neon (managed, sin service container) | Postgres en CI: usar rama/branch de Neon o `pg_dump`; si se necesita Postgres local en CI: imagen `postgres:17` | https://www.prisma.io/docs/orm/overview/databases/postgresql | OPS |

## Node.js Runtime

- **Version:** 24.19.0 LTS "Krypton" (publicado 2026-08-03; Active LTS hasta 2026-10-20, Maintenance hasta EOL 2028-04-30)
- **Confirmed compatible with all pinned packages:**
  - Vite 8.2.1: engines `^20.19.0 || >=22.12.0` — OK
  - Prisma 7.9.1: engines `^20.19 || ^22.12 || >=24.0` — OK
  - jsdom 30.0.1: `^22.22.2 || ^24.15.0 || >=26.0.0` — OK (24.19.0 >= 24.15.0)
  - Vitest 4.1.10 (Vite 8) — OK
  - @testing-library/jest-dom 7.0.1: requiere Node >=22 — OK
  - React Router 7.18.2: requiere Node >=20 — OK
  - NestJS 11: mínimo Node >=20 (upstream usa @types/node 26 en su propio repo; nosotros alineamos con 24.13.3)
  - argon2 0.45.1: binarios precompilados incluyen Node 24; v0.45.0 dejó de testear Node 20 (EOL) — soporte activo para Node 24
  - Node 20 se retira de los runners de GitHub Actions el 2026-09-16 — Node 24 en CI es obligatorio
- Deploy: Render Web Service con Node 24 LTS; Neon PostgreSQL (Postgres 17+)

## Verification Notes

- Cada paquete fue verificado contra su documentación oficial (Context7 MCP) y el registro npm (`npm view`), fecha 2026-08-11.
- **TypeScript — decisión de pin:** `typescript@7.0.2` es el `latest` de npm (compilador nativo en Go), pero no expone la API JS de compilación que requiere la cadena de build de @nestjs/cli (webpack/ts-loader) y Prisma. `typescript@6.0.3` es el último de la línea JS, pensado como puente transicional (strict por defecto, módulos ESM por defecto). Se pinna **5.9.3**, la versión exacta que NestJS 11 usa en su propio monorepo (garantía de compatibilidad total con @nestjs/cli), válida también para Vite 8 (que transpila con Oxc, sin importar la versión de tsc). Upgrades documentados: 6.0.3 → 7.0.2 cuando @nestjs/cli lo soporte.
- **React 19.3.0** figura en el repo de React (main) como versión en desarrollo; **19.2.8** es la última publicada estable en npm. No pinar 19.3.0 hasta que salga el release estable.
- **Prisma 8** está en RC (spec `prisma-8-rc1`): requiere Node 24+, TS 5.9+, ESM-only. Se mantiene **Prisma 7.9.1** (estable). Reevaluar al salir Prisma 8 estable.
- **@nestjs/validation NO existe** en el registro npm (E404 verificado 2026-08-11). La validación en NestJS se implementa con `class-validator` + `class-transformer` y el `ValidationPipe` nativo de @nestjs/common.
- **csurf está deprecado/eliminado.** La documentación oficial de NestJS recomienda `csrf-csrf` (Double Submit Cookie) para Express. Con SameSite=Strict/Lax y tokens firmados (cookie-parser) es la práctica estándar 2026.
- **TanStack Query v6** y **react-hook-form v8** están en beta — permanecer en v5/v7 respectivamente.
- **React Router v8** (8.3.0) ya está estable y requiere React 19.2.7+, pero el plan pinna **v7 Data Mode** (7.18.2). Migración futura viable documentada.
- **@nestjs/config 12.0.0-next.0** es prerelease; la línea estable compatible con Nest 11 es **4.0.4**.
- **dnd-kit** sigue en 6.x/10.x/3.x (sin releases nuevos recientes pero sin deprecación; react-beautiful-dnd está oficialmente deprecado).
- **argon2 (node-argon2)** vs **@node-rs/argon2 2.0.2**: este último no se actualiza desde hace >1 año; se recomienda `argon2` por mantenimiento activo. Ambos soportan Argon2id. @node-rs/argon2 puede reevaluarse si aparece release nuevo (instalación más ligera, sin node-gyp).
- **GitHub Actions:** pinar `ubuntu-24.04` explícitamente (ubuntu-latest hoy = 24.04; 26.04 está en preview y cambiará el alias). Node 20 se elimina del runner el 2026-09-16 — usar `node-version: 24`.
- No hay paquetes deprecados o EOL en el pin final (csurf y @otterjs/csrf-csrf quedan excluidos por deprecación; jest-axe queda excluido por incompatibilidad de runner — ver fila QA).
