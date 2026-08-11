# Consolidated API Baseline — Briefline CRM

**Date:** 2026-08-11
**Status:** PH-00 Gate
**Replaces/Supersedes:** docs/03-documentation-baseline.en.md (expanded)
**Sources:** technology-matrix.md, frontend-api-verification.md, backend-api-verification.md, qa-tooling-verification.md, devops-platform-validation.md

> **LECTURA OBLIGATORIA antes de escribir cualquier código.** Este documento es la referencia canónica de Briefline CRM: qué dependencias están autorizadas, con qué versión exacta, qué APIs se pueden usar, qué está prohibido, y contra qué documentación oficial se verificó cada cosa. **Si una API no aparece en este documento, no está autorizada.** Cualquier excepción requiere revalidación explícita (Context7 MCP + `npm view`) y actualización de este documento.

---

## 0. Conflict Resolution Log (PH-00)

Contradicciones encontradas entre los 5 documentos fuente y su resolución. Todas las resoluciones con la palabra **matrix gana** usan `technology-matrix.md` como autoridad de versiones (verificado con `npm view`, fecha 2026-08-11, registro npm autoritativo).

| # | Contradicción | Documentos en conflicto | Resolución |
|---|---|---|---|
| CR-01 | **Vitest** 4.1.10 vs "v4.1.6 en Context7" | technology-matrix vs qa-tooling | **Matrix gana:** `vitest@4.1.10`. Context7 refleja la doc, no el registro npm. QA doc lo anticipa: "la versión exacta final la pina DOC-001 (technology matrix)". |
| CR-02 | **@playwright/test** 1.62.1 vs "v1.61.x" | technology-matrix vs qa-tooling | **Matrix gana:** `@playwright/test@1.62.1`. Browsers incluidos: Chromium 151 / Firefox 153 / WebKit 26.5. |
| CR-03 | **@testing-library/jest-dom** 7.0.1 vs pin sugerido "^6" | technology-matrix vs frontend-api-verification | **Matrix gana:** `@testing-library/jest-dom@7.0.1` (requiere Node >=22 — OK con Node 24; peer `@testing-library/dom`). El "^6" del doc FE era un pin sugerido preliminar, no verificado en npm. |
| CR-04 | **@nestjs/core** 11.1.29 vs 11.1.6 | technology-matrix vs backend-api-verification | **Matrix gana:** `@nestjs/core@11.1.29` (registro npm actualizado después de la verificación del agente BE). Todas las librerías `@nestjs/*` al 11.1.29. |
| CR-05 | **Postgres en CI/testing:** `postgres:16-alpine` (qa-tooling) vs `postgres:17` (technology-matrix) vs Neon "Postgres 17+" (devops) | qa-tooling vs technology-matrix vs devops | **Alinear a `postgres:17-alpine`** en Testcontainers y service container de CI. Regla del qa doc: "contenedor con el MISMO major version que producción" — y producción (Neon) es Postgres 17+. Los templates del qa doc que dicen 16-alpine deben corregirse. |
| CR-06 | **Runner de CI:** `ubuntu-latest` (qa-tooling templates) vs pin explícito `ubuntu-24.04` (technology-matrix) | qa-tooling vs technology-matrix | **Matrix gana:** pin `ubuntu-24.04`. `ubuntu-latest` hoy resuelve a 24.04 pero 26.04 está en preview y cambiará el alias. Los templates YAML del qa doc deben corregirse. |
| CR-07 | **`joi@18.2.3`** verificado en backend-api-verification (npm i joi, validación de config) pero **ausente del technology-matrix** | backend-api-verification vs technology-matrix | **Autorizado (verificado en backend doc con versión exacta 18.2.3, Node >=20, propósito documentado).** ACCIÓN PENDIENTE: añadir `joi 18.2.3` al technology-matrix. Es la única validación de config aceptada (con `ConfigModule.forRoot.validationSchema`). |
| CR-08 | **`@prisma/adapter-pg`** usado como requisito obligatorio de Prisma 7 (backend doc) pero **ausente del matrix** | backend-api-verification vs technology-matrix | **Autorizado — es obligatorio en Prisma 7** (driver adapter). Pin: misma línea que Prisma (`7.x`, verificar con `npm view @prisma/adapter-pg` al instalar). ACCIÓN PENDIENTE: añadir al matrix con versión exacta. |
| CR-09 | **`supertest 7.x`** y **`@testcontainers/postgresql`** usados en qa-tooling (capa integración) pero **ausentes del matrix** | qa-tooling vs technology-matrix | **Autorizados funcionalmente** (APIs verificadas: `request(app.getHttpServer())`, `PostgreSqlContainer`). Sin versión exacta en fuentes → ACCIÓN PENDIENTE: pin exacto en matrix antes del setup (qa doc admite "supertest 7.x"). |
| CR-10 | **`@axe-core/playwright`** usado en qa-tooling (AxeBuilder) y **`@axe-core/react`** en el matrix — el matrix solo lista `axe-core` y `@axe-core/react` | qa-tooling vs technology-matrix | **Autorizado:** `@axe-core/playwright` es el wrapper oficial de Deque sobre `axe-core` 4.x (misma versión major). ACCIÓN PENDIENTE: añadir al matrix. |
| CR-11 | **`jsonwebtoken`** en el checklist `npm i` del backend doc (línea 1166) pero es **dependencia transitiva** de `@nestjs/jwt` (9.0.3) | backend-api-verification | **NO instalar como dependencia directa.** Solo `@nestjs/jwt` provee el JWT API (`signAsync`/`verifyAsync`). |
| CR-12 | **`@types/express`** en el checklist del backend doc, ausente del matrix | backend-api-verification vs technology-matrix | **Autorizado como devDependency de tipos** (tipos de `Request`/`Response` de Express para estrategias y middleware). ACCIÓN PENDIENTE: añadir al matrix. |
| CR-13 | **Node version en CI:** `node-version: 24` (qa-tooling) — matrix confirma 24.19.0 LTS | — | Consistente: Node 24 LTS obligatorio (Node 20 se retira de runners el 2026-09-16). |

**Regla de resolución:** la autoridad de versiones es `technology-matrix.md` (registro npm, fecha 2026-08-11). La autoridad de APIs verificadas son los 4 documentos DOC-002..005. Todo paquete que un doc verifique con versión exacta queda autorizado aunque falte del matrix; todo paquete que falte del matrix Y de los docs de verificación queda **prohibido**.

---

## 1. Authorized Dependencies (complete catalogue)

### 1.0 Tabla maestra (índice de versiones — autoritativo)

Versiones exactas, sin rangos ni `latest`. Fuente: technology-matrix.md (npm view, 2026-08-11), salvo los marcados `[CR-#]` resueltos en la sección 0.

#### Frontend

| Package | Version | Verificado contra |
|---|---|---|
| react / react-dom | 19.2.8 | react.dev |
| typescript | 5.9.3 | typescriptlang.org |
| vite | 8.2.1 | vite.dev |
| @vitejs/plugin-react | 6.0.5 | github.com/vitejs/vite-plugin-react |
| react-router | 7.18.2 | reactrouter.com |
| @tanstack/react-query | 5.101.4 | tanstack.com/query/latest |
| @tanstack/react-query-devtools | 5.101.4 | tanstack.com/query/latest/docs/react/devtools |
| zod | 4.4.3 | zod.dev |
| react-hook-form | 7.85.0 | react-hook-form.com |
| @hookform/resolvers | 5.7.1 | github.com/react-hook-form/resolvers |
| @dnd-kit/core | 6.3.1 | docs.dndkit.com |
| @dnd-kit/sortable | 10.0.0 | docs.dndkit.com/presets/sortable |
| @dnd-kit/utilities | 3.2.2 | docs.dndkit.com |

#### Backend

| Package | Version | Verificado contra |
|---|---|---|
| @nestjs/core / common / platform-express / testing | 11.1.29 | docs.nestjs.com |
| @nestjs/config | 4.0.4 | docs.nestjs.com/techniques/configuration |
| @nestjs/throttler | 6.5.0 | github.com/nestjs/throttler |
| @nestjs/swagger | 11.4.6 | docs.nestjs.com/openapi/introduction |
| @nestjs/serve-static | 5.0.5 | github.com/nestjs/serve-static |
| @nestjs/jwt | 11.0.2 | docs.nestjs.com/security/authentication |
| @nestjs/passport | 11.0.5 | docs.nestjs.com/security/authentication |
| passport | 0.7.0 | passportjs.org |
| passport-jwt / @types/passport-jwt | 4.0.1 | github.com/mikenicholson/passport-jwt |
| @prisma/client / prisma (CLI) | 7.9.1 | prisma.io/docs |
| @prisma/adapter-pg | 7.x [CR-08] | prisma.io/docs |
| argon2 | 0.45.1 | github.com/ranisalt/node-argon2 |
| cookie-parser / @types/cookie-parser | 1.4.7 / 1.4.10 | github.com/expressjs/cookie-parser |
| csrf-csrf | 4.0.3 | github.com/Psifi-Solutions/csrf-csrf |
| class-validator | 0.15.1 | github.com/typestack/class-validator |
| class-transformer | 0.5.1 | github.com/typestack/class-transformer |
| helmet | 8.3.0 | helmetjs.github.io |
| compression | 1.8.1 | github.com/expressjs/compression |
| joi | 18.2.3 [CR-07] | github.com/hapijs/joi |
| @types/express | (dev) [CR-12] | npmjs.com/package/@types/express |

#### Testing / QA

| Package | Version | Verificado contra |
|---|---|---|
| vitest / @vitest/coverage-v8 | 4.1.10 | vitest.dev |
| jsdom | 30.0.1 | github.com/jsdom/jsdom |
| @testing-library/react | 16.3.2 | testing-library.com |
| @testing-library/dom | 10.4.1 | testing-library.com |
| @testing-library/jest-dom | 7.0.1 | github.com/testing-library/jest-dom |
| @testing-library/user-event | 14.6.3 | testing-library.com/docs/user-event |
| @playwright/test | 1.62.1 | playwright.dev |
| axe-core | 4.13.0 | github.com/dequelabs/axe-core |
| @axe-core/react | 4.12.1 | github.com/dequelabs/axe-core-npm |
| @axe-core/playwright | 4.x [CR-10] | github.com/dequelabs/axe-core-npm |
| supertest | 7.x [CR-09] | github.com/ladjs/supertest |
| @testcontainers/postgresql | (pin pendiente) [CR-09] | node.testcontainers.org |
| @nestjs/cli / @nestjs/schematics | 11.0.24 / 11.1.0 | docs.nestjs.com/cli |
| @types/node | 24.13.3 | npmjs.com/package/@types/node |

#### DevOps / CI (no npm)

| Item | Pin | Verificado contra |
|---|---|---|
| GitHub Actions runner | `ubuntu-24.04` (explícito, nunca `ubuntu-latest`) | docs.github.com/actions |
| actions/setup-node | v4, `node-version: 24`, `cache: pnpm` | github.com/actions/setup-node |
| actions/checkout | v4 | github.com/actions/checkout |
| pnpm/action-setup | v4, `version: 10` | github.com/pnpm/action-setup |
| actions/cache / upload-artifact | v4 | github.com/actions/cache |
| Postgres (CI/testing) | `postgres:17-alpine` [CR-05] | prisma.io/docs |
| Playwright browsers | `npx playwright install --with-deps` | playwright.dev/docs/ci |

#### Runtime

| Item | Valor |
|---|---|
| Node.js | **24.19.0 LTS "Krypton"** (Active LTS hasta 2026-10-20, Maintenance hasta 2028-04-30) |
| Package manager | pnpm 10 |
| Deploy | Render Web Service (free) + Neon PostgreSQL (Postgres 17+) |

---

### 1.1 Frontend — APIs permitidas

#### 1.1.1 react / react-dom 19.2.8

- **Import:** `import * as React from "react"; import { createRoot } from "react-dom/client";`
- **Propósito:** Librería UI y renderizado DOM. 19.2.8 es la última estable en npm (19.3.0 está en desarrollo en GitHub, NO publicada — no pinar).
- **Restricciones:** react y react-dom se pinan SIEMPRE a la misma versión. No usar 19.3.0 hasta release estable. No Create React App (sunset oficial).
- **Verificado contra:** https://react.dev/versions · https://react.dev/blog/2025/02/14/sunsetting-create-react-app

#### 1.1.2 typescript 5.9.3 (monorepo único, owner ARCH)

- **Import:** compilador de build (no import de runtime).
- **Propósito:** Compilador TS estricto. **5.9.3 es la versión exacta que NestJS 11 usa en su monorepo** (garantía de compatibilidad total con `@nestjs/cli`/webpack/ts-loader); válida para Vite 8 (transpila con Oxc, independiente de tsc).
- **Restricciones:** NO usar 7.x (compilador nativo en Go — no expone la API JS de compilación que requieren `@nestjs/cli` y Prisma). NO usar 6.0.3 todavía (puente transicional; upgrade documentado 6.0.3 → 7.0.2 solo cuando `@nestjs/cli` lo soporte).
- **Verificado contra:** https://www.typescriptlang.org/docs/ · technology-matrix.md (Verification Notes, TS pin decision)

#### 1.1.3 vite 8.2.1 + @vitejs/plugin-react 6.0.5

- **Import:** `import { defineConfig } from "vite";` · plugin config en `vite.config.ts` (`react()`).
- **Propósito:** Bundler/dev server. Vite 8 usa Oxc (sin Babel) con HMR + Fast Refresh. Vite 8 requiere Node `^20.19 || >=22.12` — OK con Node 24.
- **Restricciones:** No usar plugin Babel; la cadena de transpilación es Oxc (independiente de la versión de tsc).
- **Verificado contra:** https://vite.dev · https://github.com/vitejs/vite-plugin-react

#### 1.1.4 react-router 7.18.2 (Data Mode)

- **Import:**
  ```ts
  import { createBrowserRouter, useLoaderData, useActionData, useFetcher, redirect } from "react-router";
  import { RouterProvider } from "react-router/dom"; // v7: DOM desde "react-router/dom"
  ```
- **Propósito:** Routing SPA en **Data Mode** (loaders/actions/middleware). v7: Node >=20, React >=18. v8.3.0 existe (requiere React 19.2.7+) pero el plan pinna v7 — migración futura documentada, no autorizada.
- **APIs permitidas:**
  - `createBrowserRouter(routes: RouteObject[], opts?: DOMRouterOpts)` — inicializado **una vez, fuera del árbol de React** (nunca en estado de componente). `opts`: `basename`, `dataStrategy`, `future`, `getContext`, `hydrationData`.
  - `RouterProvider` — recibe el router.
  - `useLoaderData<T>()` / `useActionData<T>()` — datos del loader/action de la ruta actual.
  - `useFetcher<T>({ key }?)` → `{ state: "idle"|"loading"|"submitting", data, Form, load, submit, reset }` — interacciones de datos concurrentes sin navegación.
  - `redirect(url)` — redirección desde loader/action/middleware (auth gate).
  - Patrón B (middleware): `async function authMiddleware({ context }) { ... throw redirect("/login"); context.set(userContext, user); }` registrado como `middleware: [authMiddleware]` en la definición de rutas.
- **Restricciones:** NO `BrowserRouter` + `Routes` (Declarative Mode legacy v6 — sin loaders/actions). NO mezclar modos en el árbol. NO router en estado de React (`useState`/`useMemo`). Regla middleware: si se usa middleware, añadir un `loader` (aunque retorne `null`) para forzar su ejecución en toda navegación client-side.
- **Verificado contra:** github.com/remix-run/react-router docs: `api/data-routers/createBrowserRouter.md` · `api/hooks/useFetcher.md` · `useLoaderData.md` · `useActionData.md` · `api/utils/redirect.md` · `how-to/middleware.md` · `start/modes.md` · `api/components/Route.md` · `playground/data/src/main.tsx` (2026-08-11)

#### 1.1.5 @tanstack/react-query 5.101.4 (+ devtools)

- **Import:** `import { useQuery, useMutation, useQueryClient, QueryClientProvider, QueryClient, useSuspenseQuery } from "@tanstack/react-query";`
- **Propósito:** Estado de servidor / data fetching. v5 (v6 en beta — no usar).
- **APIs permitidas (v5 obliga object signature):**
  - `useQuery({ queryKey, queryFn, ...options })` — NUNCA firma posicional `useQuery(key, fn, options)` (era v4).
  - `useMutation({ mutationFn, ...options })` → `mutate` (void, fire-and-forget), `mutateAsync` (Promise), `error`, `reset`.
  - Lifecycle: `onMutate(variables, context)` (retorno = rollback value, pasa como 3er arg a los demás), `onError`, `onSuccess`, `onSettled` — todos reciben `context` como 4º arg.
  - `useQueryClient()` / `QueryClientProvider client={queryClient}` con `defaultOptions.queries` (p. ej. `queryFn` default).
  - `QueryClient`: `cancelQueries(filters?, cancelOptions?)` (no retorna nada; `{ queryKey: ['posts'], exact: true }, { silent: true }`), `getQueryData`, `setQueryData`, `invalidateQueries`.
  - `useSuspenseQuery(options)` — `data` garantizado; `status` solo `"success"|"error"`; sin `throwOnError`/`enabled`/`placeholderData`; **sin cancelación de queries**.
- **queryKey conventions:** array; primer elemento = entidad, luego identificadores (`['todos']`, `['todo', { id: 5 }]`); hash determinístico por estructura; misma key comparte cache.
- **staleTime/gcTime:** default `gcTime` = 5 min en browser / `Infinity` en server; default `staleTime` = 0 ms (toda query stale al instante). `staleTime` = data servida sin refetch; `gcTime` = vida de cache sin observadores.
- **Optimistic updates (patrón canónico, obligatorio):** `cancelQueries` primero → snapshot `getQueryData` → update `setQueryData` → rollback en `onError` con el valor retornado por `onMutate` → `invalidateQueries` en `onSettled`.
- **Restricciones:** NO firma posicional v4. NO `onMutate`/`onError`/`onSettled` sin la secuencia cancel → snapshot → update → rollback/invalidate. NO mezclar `useQuery` y `useSuspenseQuery` para la misma queryKey en el mismo árbol. **Decisión de proyecto:** `useQuery` por defecto; `useSuspenseQuery` solo para rutas/paneles con data obligatoria + `Suspense` + ErrorBoundary.
- **Verificado contra:** tanstack/query docs: `framework/react/guides/migrating-to-v5.md` · `guides/mutations.md` · `guides/optimistic-updates.md` · `guides/default-query-function.md` · `framework/react/reference/useSuspenseQuery.md` · `reference/QueryClient.md` · `packages/query-core/src/removable.ts` (2026-08-11)

#### 1.1.6 zod 4.4.3

- **Import:** `import { z } from "zod";` (compartido con api-contract; @hookform/resolvers acepta `zod` y `zod/v4`).
- **APIs permitidas:** `z.string()`, `z.number()` (v4: NO acepta Infinity/NaN por defecto), `z.boolean()`, `z.date()` (valida instancias de Date, NO strings ISO), `z.enum([...])`, `z.object({...})`, `z.optional(z.string())` ≡ `z.string().optional()`, `z.string().nullable()`.
- **Parse:** `.parse(x)` lanza `ZodError`; `.safeParse(x)` → `{ success: true, data } | { success: false, error: ZodError }`.
- **Inferencia:** `z.infer<typeof S>` devuelve SIEMPRE el **output** type. Con transforms usar `z.input<T>` / `z.output<T>` explícitamente (p. ej. en `useForm<TInput, any, TOutput>` de RHF).
- **Notas v4 (migración desde v3):** la clase interna `ZodEffects` desaparece (los refinements viven como "checks" — no afecta APIs de usuario).
- **Restricciones:** NO usar `z.string()` donde se espera fecha ISO (usar `z.date()` con preprocess si viene string). `safeParse` para validación no-lanzante en runtime; `parse` para datos que deben ser válidos sí o sí.
- **Verificado contra:** github.com/colinhacks/zod: `packages/docs-v3/home.md` · `packages/docs/content/api.mdx` · `packages/docs/content/v4/changelog.mdx` · `packages/zod/src/v4/classic/tests/number.test.ts` (2026-08-11)

#### 1.1.7 react-hook-form 7.85.0 + @hookform/resolvers 5.7.1

- **Import:** `import { useForm, SubmitHandler } from "react-hook-form";` · `import { zodResolver } from "@hookform/resolvers/zod";`
- **APIs permitidas:** `useForm<TFieldValues, TContext, TTransformedValues>()` → `register`, `handleSubmit`, `watch`, `getValues`, `getFieldState`, `setError`, `clearErrors`, `setValue`, `setValues`, `trigger`, `formState`, `resetField`, `reset`, `resetDefaultValues`, `unregister`, `control`, `setFocus`, `subscribe`.
  - `register(name, { required, ...reglas HTML })` — errores en `formState.errors.<name>.message`.
  - `handleSubmit(onSubmit)` — valida antes de invocar; **NO captura errores lanzados dentro de `onSubmit`**: envolver async en try/catch y usar `setError` en el catch (deja `isSubmitSuccessful: false`).
  - `setError(name, { type, message })` — un error por llamada; iterar para varios campos; `type: "manual"` para errores manuales.
  - `zodResolver(schema, options?, config?)` — `options.errorMap` (mensajes custom); `config.mode: 'sync'|'async'` (default `'async'`); `config.raw: true` retorna input sin transformar.
  - Inferencia: `useForm<z.input<typeof schema>, any, z.output<typeof schema>>({ resolver: zodResolver(schema) })`.
  - **Truco numérico:** campos `number` en el schema exigen `{ valueAsNumber: true }` en `register`.
- **Restricciones:** RHF + zodResolver es la ÚNICA stack de forms permitida (sin TanStack Form, sin remix-hook-form). v8 en beta — no usar.
- **Verificado contra:** github.com/react-hook-form/documentation: `get-started.mdx` · `ts.mdx` · `docs/useform/seterror.mdx` · `docs/useform/handlesubmit.mdx` · github.com/react-hook-form/resolvers: `README.md` · `_autodocs/api-reference/zod-resolver.md` (2026-08-11)

#### 1.1.8 @dnd-kit/core 6.3.1 + @dnd-kit/sortable 10.0.0 + @dnd-kit/utilities 3.2.2 (familia CLÁSICA)

- **Import:**
  ```js
  import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragOverlay } from '@dnd-kit/core';
  import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
  import { CSS } from '@dnd-kit/utilities';
  ```
- **APIs permitidas:** `DndContext` (`sensors`, `collisionDetection`, `onDragStart`/`onDragOver`/`onDragEnd`), `useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))`, `SortableContext` (`items`, `strategy: verticalListSortingStrategy`), `DragOverlay`, `useDroppable({ id })` → `{ setNodeRef, isOver }`, `useSortable({ id })` → `{ attributes, listeners, setNodeRef, transform, transition }` con `style = { transform: CSS.Transform.toString(transform), transition }`.
- **Accesibilidad (obligatoria):** `KeyboardSensor` + `sortableKeyboardCoordinates` en TODOS los DndContext. El core inyecta automáticamente instrucciones `aria-describedby` y live region. **NO omitir KeyboardSensor** al reemplazar sensors por defecto.
- **Restricciones:** **PROHIBIDO mezclar familias** — la familia nueva (`@dnd-kit/react` + `@dnd-kit/dom`, hooks `DragDropProvider`, `useDraggable({id}) → {ref}`, `useDroppable({id}) → {ref, isDropTarget}`, `useSortable({id,index}) → {ref}`) tiene contratos distintos e incompatibles. NO importar nunca de `@dnd-kit/react/*`. dnd-kit sigue en 6.x/10.x/3.x sin deprecación; react-beautiful-dnd está oficialmente deprecado (no usar).
- **Verificado contra:** github.com/clauderic/dnd-kit: `apps/docs/docs/react/guides/multiple-sortable-lists.mdx` · `apps/docs/docs/react/hooks/use-sortable.mdx` · `packages/react/README.md` · `apps/docs/docs/extend/plugins/accessibility.mdx` · `packages/dom/src/core/plugins/accessibility/defaults.ts` (2026-08-11)

---

### 1.2 Backend — APIs permitidas

#### 1.2.1 @nestjs/core / common / platform-express 11.1.29 (NestJS 11 + Express 5)

- **Import:** `import { Module, Injectable, Controller, Get, Post, Body, Request, Res, HttpCode, HttpStatus, SetMetadata, UseGuards, ExecutionContext, CanActivate, ForbiddenException, UnauthorizedException, ValidationPipe, NestMiddleware, OnModuleInit, OnModuleDestroy, INestApplication } from '@nestjs/common';` · `import { APP_GUARD, APP_INTERCEPTOR, Reflector } from '@nestjs/core';`
- **Propósito:** Framework base. **NestJS 11 usa Express 5 por defecto** (path-to-regexp v8): los wildcards deben nombrarse (`{*splat}`).
- **Restricciones:** NO wildcards estilo Express 4 (`*`) en `exclude`/`forRoutes`. Express 5 incluye `express.json()`/`urlencoded()` nativos — body-parser no es necesario. Node >=20 mínimo.
- **Verificado contra:** https://docs.nestjs.com · https://docs.nestjs.com/migration-guide · backend-api-verification.md §1-9

#### 1.2.2 Auth: @nestjs/jwt 11.0.2 + @nestjs/passport 11.0.5 + passport 0.7.0 + passport-jwt 4.0.1

- **Import:**
  ```ts
  import { JwtModule, JwtService } from '@nestjs/jwt';
  import { PassportModule, PassportStrategy, AuthGuard } from '@nestjs/passport';
  import { Strategy, ExtractJwt } from 'passport-jwt';
  ```
- **APIs permitidas:**
  - `JwtModule.registerAsync({ imports: [ConfigModule], inject: [ConfigService], useFactory: (cs) => ({ secret: cs.getOrThrow('JWT_SECRET'), signOptions: { expiresIn: '15m', algorithm: 'HS256' } }) })`.
  - `JwtService.signAsync(payload, { expiresIn })` / `verifyAsync(token)` — obligatorias si se usa `secretOrKeyProvider` async. `jsonwebtoken` (9.0.3) es transitiva de `@nestjs/jwt` — NO declarar directa.
  - `PassportStrategy(Strategy)` con `super({ jwtFromRequest: ExtractJwt.fromExtractors([(req) => req?.cookies?.access_token ?? null, ExtractJwt.fromAuthHeaderAsBearerToken()]), ignoreExpiration: false, secretOrKey, algorithms: ['HS256'] })` — el retorno de `validate()` se asigna a `request.user`.
  - `@Public()` + `APP_GUARD` (secure-by-default): `IS_PUBLIC_KEY = 'isPublic'`, `Public = () => SetMetadata(IS_PUBLIC_KEY, true)`; `JwtAuthGuard extends AuthGuard('jwt')` con `Reflector.getAllAndOverride` de `IS_PUBLIC_KEY` sobre handler y clase.
  - `@Roles(...roles)` + `RolesGuard` (Reflector + `switchToHttp().getRequest().user`) — corre DESPUÉS de JwtAuthGuard (orden de registro de guards).
- **Restricciones:** NO auth opt-in endpoint por endpoint (siempre APP_GUARD + `@Public()`). Pinar `algorithms: ['HS256']` explícito. Validar `sub`, `exp` (ignoreExpiration: false) — `iss`/`aud` se pinan en el payload si se emiten.
- **Verificado contra:** https://docs.nestjs.com/security/authentication · /security/authorization · /recipes/passport · /guards · github.com/nestjs/jwt `_autodocs/quick-start.md` · `_autodocs/api-reference-jwt-service.md` · github.com/mikenicholson/passport-jwt README (2026-08-11)

#### 1.2.3 Validation & Config: class-validator 0.15.1 + class-transformer 0.5.1 + @nestjs/config 4.0.4 + joi 18.2.3 [CR-07]

- **Import:**
  ```ts
  import { ValidationPipe } from '@nestjs/common';
  import { ConfigModule, ConfigService } from '@nestjs/config';
  import { IsString, IsEmail, IsEnum, IsOptional, Length, MaxLength, IsUUID } from 'class-validator';
  import { Transform, Expose, Exclude, plainToInstance, instanceToPlain } from 'class-transformer';
  import * as Joi from 'joi';
  ```
- **`@nestjs/validation` NO EXISTE** (E404 verificado en npm, 2026-08-11) — la validación es `class-validator` + `class-transformer` vía `ValidationPipe` de @nestjs/common.
- **APIs permitidas:**
  - `app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: false }, forbidUnknownValues: true }))` — `forbidNonWhitelisted` solo tiene efecto con `whitelist: true`.
  - `ConfigModule.forRoot({ isGlobal: true, validationSchema: Joi.object({...}), validationOptions: { allowUnknown: false, abortEarly: true } })` — **bloqueante**: si falla, la app no arranca. Defaults de @nestjs/config: `allowUnknown: true` y `abortEarly: false` — sobreescribir para modo estricto. Acceso: `configService.getOrThrow<string>('KEY')`.
  - Decorators class-validator verificados: `@IsString()` · `@IsEmail(options?, { message? })` · `@IsEnum(Enum, { message? })` · `@IsOptional()` (null/undefined → ignora resto de validadores) · `@Length(min, max, { message? })` · `@MaxLength(max)` · `@IsUUID('4')` · `@IsString({ each: true })` (arrays).
  - class-transformer: `@Transform(({ value }) => ...)` · `@Expose()`/`@Exclude()` (allowlist de clase: `@Exclude()` en la clase + `@Expose()` por campo) · `plainToInstance(Cls, plain)` / `instanceToPlain(instance)` · `ClassSerializerInterceptor` global vía `APP_INTERCEPTOR` (las respuestas omiten `passwordHash` automáticamente).
- **Restricciones:** NO masas assignment ni DTOs de solo lectura aceptando objetos de dominio completos (guard de baseline). `@Length(8, 72)` en passwords (argon2 ignora bytes >72). NO usar DTOs para ocultar campos sin `@Exclude`/interceptor.
- **Verificado contra:** docs.nestjs.com/techniques/validation · /pipes · /techniques/configuration · github.com/typestack/class-validator README · github.com/typestack/class-transformer `_autodocs/api-decorators.md` (2026-08-11)

#### 1.2.4 Prisma 7: @prisma/client 7.9.1 + prisma 7.9.1 + @prisma/adapter-pg [CR-08]

- **Import:**
  ```ts
  import { PrismaClient, Prisma } from '../generated/prisma/client'; // ruta del output del generador — SIEMPRE con /client
  import { PrismaPg } from '@prisma/adapter-pg';
  ```
- **Cambios v7 (obligatorios):** `provider = "prisma-client"` (nuevo cliente Rust-free); `output` **obligatorio** en el generador (el cliente ya no se genera en node_modules); **driver adapter obligatorio** para PostgreSQL (`PrismaPg` con `connectionString`); `enableShutdownHooks` ya no necesario.
- **APIs permitidas:**
  - `PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy` con `super({ adapter: new PrismaPg({ connectionString: configService.getOrThrow('DATABASE_URL') }) })`, `$connect()`/`$disconnect()` en hooks; módulo `@Global()` que provee y exporta el servicio.
  - `$transaction(async (tx) => { ... }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 10000 })` — **SOLO callback (interactivo)**. El array de queries NO se soporta en v7.
  - Schema: `@id @default(uuid()) @db.Uuid`, `@default(now())`, `@updatedAt`, `@unique`, `@relation(fields:[...], references:[...], onDelete: Cascade)`, `enum`. `directUrl = env("DIRECT_URL")` en el datasource para migraciones (Prisma 7) — pooled para runtime, direct para migrate.
  - Migraciones: `prisma migrate dev --name <x>` SOLO en desarrollo local; `prisma migrate deploy` en producción/CI (no interactivo, advisory locking); `prisma migrate status` ambos. `prisma db push` solo prototipos.
- **Restricciones:** NO `$transaction([...])` con array (v7). NO `db push`/`migrate reset`/`migrate dev` en producción. NO `synchronize: true` (regla del protocolo — migraciones siempre con el ORM). NO crear un PrismaClient por request (pool: `connection_limit` 5-10, `pool_timeout` 10 s). Prisma 8 está en RC (ESM-only, TS 5.9+) — no usar hasta release estable.
- **Verificado contra:** prisma.io/docs/guides/frameworks/nestjs · prisma docs `guides/upgrade-prisma-orm/v7.mdx` · `orm/reference/prisma-schema-reference.mdx` · `cli/migrate/index.mdx` · `orm/more/best-practices.mdx` · `orm/next/reference/transactions-and-runtime.mdx` (2026-08-11)

#### 1.2.5 argon2 0.45.1 (node-argon2)

- **Import:** `import * as argon2 from 'argon2';`
- **APIs permitidas:**
  - `argon2.hash(password: Buffer | string, options?: Options): Promise<string>` — retorna PHC string.
  - `argon2.verify(digest: string, password: Buffer | string): Promise<boolean>` — constante-time; `false` para hashes inválidos, no lanza.
  - **Parámetros OWASP verificados (obligatorios):** `{ type: argon2.argon2id, memoryCost: 19456 /* KiB = 19 MiB */, timeCost: 2, parallelism: 1, hashLength: 32 }`.
- **Restricciones:** NO argon2i/argon2d para passwords (usar argon2id). Defaults de la lib (m=65536, t=3, p=4) NO se usan — fijar explícito el set OWASP. `@node-rs/argon2` es solo plan B documentado si el CI falla con node-gyp (API de alto nivel equivalente; misma PHC string) — no es cambio autorizado sin discusión.
- **Verificado contra:** OWASP Password Storage Cheat Sheet (Argon2id m=19456, t=2, p=1) · github.com/ranisalt/node-argon2 `_autodocs/api-reference.md` · `_autodocs/security-notes.md` (2026-08-11)

#### 1.2.6 Cookies & CSRF: cookie-parser 1.4.7 + csrf-csrf 4.0.3

- **Import:**
  ```ts
  import * as cookieParser from 'cookie-parser';
  import { doubleCsrf } from 'csrf-csrf';
  ```
- **`csurf` está DEPRECADO/archivado** (feb 2021; vulnerabilidad SNYK-JS-CSURF-3021144; defaults inseguros). La doc oficial de NestJS recomienda `csrf-csrf` para Express. **NO usar csurf ni @otterjs/csrf-csrf.**
- **APIs permitidas:**
  - `app.use(cookieParser())` — **SIEMPRE antes del middleware CSRF**. `request.cookies` / `request.signedCookies`.
  - `res.cookie(name, value, { httpOnly: true, secure: prod, sameSite: 'strict', path, maxAge })` — con `@Res({ passthrough: true })` en NestJS.
  - `doubleCsrf({ getSecret: () => secret, getSessionIdentifier: (req) => req.cookies?.['access_token'] ?? 'anonymous', cookieName: 'csrf-token', cookieOptions: { sameSite: 'strict', path: '/', secure: isProduction, httpOnly: true }, size: 32, ignoredMethods: ['GET','HEAD','OPTIONS'] })` → `{ doubleCsrfProtection, generateCsrfToken(req, res), validateRequest(req), invalidCsrfTokenError }`.
  - Flujo frontend: `GET /api/auth/csrf-token` → token en memoria → header `x-csrf-token: <token>` en todo POST/PUT/PATCH/DELETE. Fallo → `403 invalid csrf token`.
  - Origin validation (defensa en profundidad OWASP): middleware propio que valida header `Origin` contra `CORS_ORIGINS` en métodos de mutación; **no rechazar si `Origin` está ausente** (GETs same-origin, redirects 302).
- **Restricciones:** NO prefijo `__Host-` en la cookie (exige HTTPS; rompe dev local) — usar nombre custom `csrf-token`. **NUNCA** devolver el valor del cookie desde `getCsrfTokenFromRequest` (anularía la protección). `getSessionIdentifier` liga el HMAC a la sesión JWT (cookie access_token). Login también protegido (defensa anti login-CSRF).
- **Verificado contra:** docs.nestjs.com/techniques/cookies · /security/csrf · expressjs.com 4x api (res.cookie) · cdn.jsdelivr.net/npm/csrf-csrf@4.0.3/README.md · github.com/expressjs/discussions/issues/155 · OWASP CSRF Prevention Cheat Sheet (2026-08-11)

#### 1.2.7 @nestjs/swagger 11.4.6 (OpenAPI)

- **Import:** `import { DocumentBuilder, SwaggerModule, ApiTags, ApiOperation, ApiResponse, ApiProperty, ApiPropertyOptional, ApiCookieAuth, ApiBearerAuth } from '@nestjs/swagger';`
- **APIs permitidas:** `DocumentBuilder` (`setTitle`, `setDescription`, `setVersion`, `setOpenAPIVersion('3.0.0')`, `addServer`, `addTag`, `addSecurity`, `addBearerAuth`, `addOAuth2`, `addApiKey`, `addBasicAuth`, `addCookieAuth('access_token', { type: 'apiKey', in: 'cookie', name: 'access_token' }, 'cookie-auth')`, `addSecurityRequirements`, `build()`); `SwaggerModule.createDocument(app, config)` + `SwaggerModule.setup('api/docs', app, document)`.
- **Decorators verificados:** `@ApiTags(...)`, `@ApiOperation({ summary, description, operationId })`, `@ApiResponse({ status, description, type, isArray, overrideExisting? })`, `@ApiProperty(options)`, `@ApiPropertyOptional(options)` (= `required: false`), `@ApiCookieAuth(name?)` (class & method decorator). CLI plugin de Swagger puede generar `@ApiProperty` automáticamente desde DTOs.
- **Restricciones:** línea 12 es alpha — no usar. CSP de helmet debe permitir Swagger UI (`styleSrc 'unsafe-inline'`, `imgSrc validator.swagger.io`, `scriptSrc https:`).
- **Verificado contra:** github.com/nestjs/swagger `_autodocs/api-reference/DocumentBuilder.md` · `_autodocs/api-reference/Decorators.md` · docs.nestjs.com/openapi/introduction (2026-08-11)

#### 1.2.8 @nestjs/throttler 6.5.0

- **Import:** `import { ThrottlerModule, ThrottlerGuard, Throttle, seconds } from '@nestjs/throttler';`
- **APIs permitidas:** `ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 100 }, { name: 'auth', ttl: 60_000, limit: 5 }])` (API array v5+); registro global `APP_GUARD` con `ThrottlerGuard`; `@Throttle({ auth: { limit: 5, ttl: seconds(60), blockDuration: seconds(300) } })` por ruta (login). Options por throttler: `limit`, `ttl`, `blockDuration`, `getTracker`, `generateKey`.
- **Restricciones:** solo la API array de `forRoot` (v5+); el helper `seconds(n)` está exportado por el paquete.
- **Verificado contra:** github.com/nestjs/throttler `README.md` · `_autodocs/integration-guide.md` · `_autodocs/api-reference/decorators.md` (2026-08-11)

#### 1.2.9 @nestjs/serve-static 5.0.5 (SPA en producción)

- **Import:** `import { ServeStaticModule } from '@nestjs/serve-static';` · `import { join } from 'path';`
- **APIs permitidas:** `ServeStaticModule.forRoot({ rootPath: join(__dirname, '..', '..', 'client', 'dist'), exclude: ['/api/{*splat}'] })` — `renderPath` default `'*'` sirve index.html (client-side routing); `exclude` para la API. Solo producción (en dev sirve el dev server de Vite).
- **Restricciones:** **Express 5: wildcards NOMBRADOS** — `/api/{*splat}`, nunca `*`.
- **Verificado contra:** docs.nestjs.com/recipes/serve-static · docs.nestjs.com/migration-guide (2026-08-11)

#### 1.2.10 helmet 8.3.0 + compression 1.8.1 + CORS

- **Import:** `import helmet from 'helmet';`
- **APIs permitidas:** `app.use(helmet())` (13 headers por defecto, incluye CSP, HSTS, X-Content-Type-Options, remoción X-Powered-By); `helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"], imgSrc: ["'self'", 'data:', 'validator.swagger.io'], scriptSrc: ["'self'", 'https:', "'unsafe-inline'"] } } })` (excepción Swagger UI); `app.enableCors({ origin: CORS_ORIGINS.split(','), credentials: true, methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'] })`.
- **Restricciones:** NUNCA `Access-Control-Allow-Origin: *` con credenciales; lista blanca de orígenes exactos. `credentials: true` es OBLIGATORIO para cookies.
- **Verificado contra:** github.com/helmetjs/helmet README · docs.nestjs.com/security/cors · docs.nestjs.com/openapi/introduction (2026-08-11)

#### 1.2.11 @nestjs/config 4.0.4 (config base) — ver §1.2.3

- `ConfigModule.forRoot` + `ConfigService.getOrThrow`. Línea 4.x es la estable compatible con Nest 11 (**12.0.0-next.0 es prerelease — no usar**).

#### 1.2.12 Orden del stack de seguridad (obligatorio)

`helmet` → CORS (lista blanca + credentials) → `cookieParser` → Origin validation → CSRF double-submit firmado → guards globales (Throttler → JWT → Roles) → `ValidationPipe` global.

---

### 1.3 Testing / QA — APIs permitidas

#### 1.3.1 Vitest 4.1.10 + @vitest/coverage-v8 4.1.10

- **Import:** `import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest'` (o `globals: true` en config).
- **APIs permitidas:** matchers Chai/Jest (`toBe`, `toEqual`, `toMatchObject`, `toThrow`, `toHaveBeenCalled*`, `toHaveLength`, `resolves`/`rejects`); hooks v3/v4: `aroundEach(runTest)`, `aroundAll(runSuite)`, `onTestFinished`, `onTestFailed`.
  - `vi.fn(impl)` (`mock.calls`, `mock.results`, `mockClear`, `mockReset`, `mockImplementationOnce`, `withImplementation`), `vi.spyOn(obj, 'method')` + `spy.mockRestore()`, `vi.mock(path, factory)` (hoisted — factory sin variables de scope; usar `vi.hoisted()`), `vi.doMock`, `vi.clearAllMocks/resetAllMocks/restoreAllMocks`, `vi.useFakeTimers({ toFake })`, `vi.setSystemTime(date)`, `vi.runAllTimers()`, `vi.advanceTimersByTime(ms)`, `vi.stubEnv`/`unstubAllEnvs`.
- **Config canónica (monorepo pnpm):**
  - **`test.projects` — NUNCA `test.workspace`** (deprecado en v4). Proyectos: `unit` (node, `packages/**`), `integration` (node, `apps/api/test/integration/**/*.e2e-spec.ts`, `testTimeout: 60_000`, `hookTimeout: 120_000`, `fileParallelism: false`), `components` (jsdom, `apps/web/src/**`, `globals: true`, `setupFiles: ['./vitest.setup.ts']`).
  - Coverage: `provider: 'v8'` (requiere `@vitest/coverage-v8`), reporters text/html/lcov, thresholds **80/80/70/80** (lines/functions/branches/statements) en la RAÍZ (en `projects` el coverage es global — no hay thresholds por proyecto), exclude: `**/*.test.*`, `**/*.spec.*`, `**/*.e2e-spec.*`, `**/main.ts`, `**/*.config.ts`, `**/types/**`.
  - CI: `vitest run`; sharding `--shard=1/4`.
- **Restricciones:** NO `test.workspace` (v4). NO `jest.*` (el proyecto corre Vitest). NO `@vitest/coverage-istanbul` (usar v8).
- **Verificado contra:** vitest.dev/guide · vitest.dev/api/vi · vitest.dev/config/#coverage · vitest.dev/guide/workspace (2026-08-11)

#### 1.3.2 @testing-library/react 16.3.2 + @testing-library/dom 10.4.1 + jest-dom 7.0.1 + user-event 14.6.3

- **Imports:**
  ```ts
  import { render, screen, waitFor, fireEvent } from '@testing-library/react';
  import userEvent from '@testing-library/user-event';
  import '@testing-library/jest-dom/vitest'; // setup file (o por archivo)
  ```
- **APIs permitidas:** `render(ui)`, `screen` (queries ligadas a `document.body`), `getBy*` (lanza) / `queryBy*` (null) / `findBy*` (async) — con regex (`screen.getByRole('button', { name: /edit profile/i })`); `waitFor(() => expect(...))`; `fireEvent.change/click/keyDown/focus/blur` (solo para eventos sintéticos raros).
  - **userEvent: preferir SIEMPRE sobre fireEvent** (comportamiento real de navegador: label→control, file input, etc.). `const user = userEvent.setup()` — APIs verificadas: `click`, `dblClick`, `tripleClick`, `hover`, `unhover`, `tab`, `keyboard`, `copy`, `cut`, `paste`, `pointer`, `clear`, `deselectOptions`, `selectOptions`, `type`, `upload`. Todas devuelven Promise → **siempre `await`**.
  - jest-dom matchers: `toBeInTheDocument`, `toBeVisible`, `toBeEnabled`/`not.toBeDisabled`, `toHaveClass`, `toHaveTextContent` (normaliza whitespace; string o regex). Import `@testing-library/jest-dom/vitest` registra matchers en `expect` de Vitest y extiende tipos.
- **Restricciones:** NO `fireEvent` cuando `userEvent` cubre el caso. NO queries sobre el retorno de `render()` si `screen` cubre. NO olvidar `await` en userEvent. NO usar `jest.fn()` → `vi.fn()`. RTL v16 requiere peer `@testing-library/dom` y soporta React 19. Cleanup automático de RTL exige `globals: true` (o `cleanup()` manual).
- **Verificado contra:** testing-library.com/docs/react-testing-library/intro · github.com/testing-library/user-event `_autodocs/api-reference/*` · github.com/testing-library/jest-dom `_autodocs/*` · github.com/vitest-dev/vitest docs mock/vi (2026-08-11)

#### 1.3.3 jsdom 30.0.1

- **Propósito:** Entorno DOM para tests unit de componentes. Node `^22.22 || ^24.15 || >=26` — OK con Node 24.
- **Restricciones:** NO mide layout real, color contrast ni focus visual — solo violaciones estructurales/DOM. No es sustituto de un navegador.
- **Verificado contra:** github.com/jsdom/jsdom · technology-matrix.md

#### 1.3.4 @nestjs/testing 11.1.29 (con Vitest)

- **Import:** `import { Test } from '@nestjs/testing';`
- **APIs permitidas:** `Test.createTestingModule({ imports, controllers, providers })` → `.compile()`; overrides encadenables: `overrideProvider(X).useValue/.useClass/.useFactory`, `overrideModule(M).useModule(Alt)`, `overrideGuard`, `overrideInterceptor`, `overrideFilter`, `overridePipe`.
- **Trampa verificada:** un guard global con `APP_GUARD` no se puede overridear por token a menos que en producción se registre con `useExisting` (`{ provide: APP_GUARD, useExisting: JwtAuthGuard }`) — ajustar desde el inicio para poder mockear auth en tests.
- **Verificado contra:** docs.nestjs.com/fundamentals/unit-testing · qa-tooling-verification.md

#### 1.3.5 Integración: supertest 7.x [CR-09] + @testcontainers/postgresql [CR-09] + PostgreSQL real

- **Import:** `import * as request from 'supertest';` · `import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';`
- **APIs permitidas:** `request(app.getHttpServer()).post('/api/auth/login').send({...}).expect(201)`; `new PostgreSqlContainer('postgres:17-alpine')` [CR-05] → `.start()`, `container.getConnectionUri()` (puerto aleatorio — nunca hardcodear 5432), `container.stop()` en afterAll con `?.`.
- **Patrón canónico:** contenedor con el MISMO major que producción (17) → `DATABASE_URL` set antes de construir PrismaClient → `prisma migrate deploy` → `Test.createTestingModule({ imports: [AppModule] })` → `app.setGlobalPrefix('api')` (replicar bootstrap) → limpieza `TRUNCATE TABLE ... RESTART IDENTITY CASCADE` en beforeEach → afterAll `app.close()` + `container.stop()`.
- **Alternativas de limpieza:** transaction rollback (`BEGIN`/`ROLLBACK` con `aroundEach(runTest)`) · schema/BD por worker (`CREATE SCHEMA test_${VITEST_POOL_ID}`) · globalSetup de Vitest con contenedor por run (estilo `@opengovsg/testcontainers`). Default Briefline: contenedor por archivo + truncate.
- **Restricciones:** NO SQLite/pg-mem como sustituto de integración (guard del plan). NO imagen `:latest`. NO hardcodear puerto. `beforeAll` con timeout 60-120 s (primer run: pull de imagen).
- **Verificado contra:** node.testcontainers.org/modules/postgres · qa-tooling-verification.md §NestJS Testing Patterns

#### 1.3.6 @playwright/test 1.62.1

- **Import:** `import { defineConfig, devices, test, expect } from '@playwright/test';`
- **Config canónica:** `testDir`, `fullyParallel: true`, `forbidOnly: !!CI`, `retries: CI ? 2 : 0`, reporter `[['html', { open: 'never' }], ['github']]` en CI, `use: { baseURL: 'http://127.0.0.1:4173' /* preview de producción, no dev server */, trace: 'on-first-retry', screenshot: 'only-on-failure', video: 'retain-on-failure' }`, `webServer: { command: 'pnpm --filter web build && pnpm --filter web preview', url: 'http://127.0.0.1:4173', timeout: 120_000, reuseExistingServer: !CI }`, projects chromium/firefox/webkit (`devices['Desktop Chrome'|'Desktop Firefox'|'Desktop Safari']`).
- **APIs permitidas:** locators web-first: `getByRole`, `getByLabel`, `getByText`, `getByTestId` (SOLO drag & drop), `toMatchAriaSnapshot()`; assertions auto-wait: `toBeVisible`, `toHaveText`, `toHaveValue`, `toBeChecked`, `toHaveCount`; fixtures `test.extend` con scope `'worker'` (datos controlados por test, nunca seed de desarrollo).
- **Restricciones:** NO `page.waitForTimeout`/sleep ad-hoc. NO `reuseContext: true` (experimental, solo component testing — no garantiza aislamiento). NO locators con texto largo frágil. NO data-testid por defecto.
- **Verificado contra:** playwright.dev/docs/test-configuration · test-fixtures · test-webserver · locators · qa-tooling-verification.md §Playwright

#### 1.3.7 axe-core 4.13.0 + @axe-core/react 4.12.1 + @axe-core/playwright [CR-10]

- **Imports:** `import AxeBuilder from '@axe-core/playwright';` (E2E) · `axe.run(...)` de `axe-core` (unit jsdom) · `@axe-core/react` en dev (monta axe sobre el árbol React).
- **APIs permitidas:**
  - `axe.run(context?, options?, callback?)` — contexto: elemento, selector CSS o array de selectores; `options: { rules: {...}, resultTypes: ['violations'] }`. Resultado: `{ url, timestamp, testEngine, testEnvironment, passes[], violations[], inapplicable[], incomplete[] }` — cada item con `description`, `help`, `helpUrl`, `id`, `impact` ('minor'|'moderate'|'serious'|'critical'|null), `tags[]`, `nodes[]` (cada node: `html`, `impact`, `target`, `any[]`, `all[]`, `none[]`, `relatedNodes[]`).
  - AxeBuilder (Playwright): `include(selector)` / `exclude(selector)` (cada exclusión documentada con comentario `// a11y-exclusion <id>: <motivo>`), `withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa'])` (objetivo WCAG 2.2 AA), `withRules(ids)` / `disableRules(ids)` (solo con motivo documentado), `options(runOptions)`, `analyze()`.
- **Estrategia:** unit (jsdom) cubre reglas estructurales (aria, roles, nombre accesible, jerarquía headings) con `axe.run(container)`; E2E cubre layout/rendering. Threshold: fallar solo en serious/critical. Escanear rutas primarias + estados tras interacción. Correr en cada proyecto de browser (resultado varía por motor).
- **Restricciones:** NO exclusions silenciosas (guard: comentario `// a11y-exclusion <id>: <motivo>`). NO claim de accesibilidad solo-automatizada (axe cubre ~30-40% de WCAG; combinar con checklist manual + screen reader — QA-007). **jest-axe NO usar** (pensado para Jest; con Vitest se usa axe-core directo + @axe-core/react).
- **Verificado contra:** github.com/dequelabs/axe-core `doc/API.md` · `doc/context.md` · github.com/dequelabs/axe-core-npm · qa-tooling-verification.md §Accessibility (2026-08-11)

---

### 1.4 DevOps / CI — límites y configuraciones autorizadas

#### 1.4.1 Render Web Service (plan free)

- **Límites verificados (agosto 2026):** hasta 25 servicios/workspace; **512 MB RAM / 0.1 CPU** por instancia free; cold start **30-60 s** (requiere loading state en la SPA + disclosure en README); spin-down tras **15 min** de inactividad (WebSocket también cuenta como actividad); **750 h/mes** por workspace (1 servicio free 24/7; al agotarse TODOS los free se suspenden); egress **5 GB/mes**; 500 min de build/mes; 2 custom domains; **SMTP/email BLOQUEADO en free desde sept 2025**; puertos reservados 18012/18013/19099; persistent disk solo single-instance y desactiva zero-downtime — **NO usar en free**; sin tarjeta de crédito.
- **Configuración autorizada (`render.yaml` blueprint):** `type: web`, `runtime: node`, `plan: free`, `region: oregon` (o frankfurt — debe coincidir con Neon), `healthCheckPath: /api/health` (200 solo con DB conectada; 503 mientras inicializa), `buildCommand: npm ci && npm run build`, `startCommand: npm run start:prod`, `envVars: DATABASE_URL` y `DIRECT_URL` con `sync: false` (secrets, nunca en repo). Bind obligatorio a `process.env.PORT` en `0.0.0.0` (`app.listen(process.env.PORT, '0.0.0.0')`). Filesystem efímero — **todo estado en Neon**.
- **Verificado contra:** render.com/docs (workspace plans abril 2026) · devops-platform-validation.md

#### 1.4.2 Neon PostgreSQL (plan free)

- **Límites verificados (agosto 2026):** 0.5 GB storage/proyecto (hasta 100 proyectos free); 100 CU-hours/proyecto/mes (baseline 0.25 CU, autoscaling hasta 2 CU); scale-to-zero 5 min; **10 branches** por proyecto (copy-on-write); egress 5 GB/mes; PITR 6 h; suspensión por límites NO borra datos; regiones Azure deprecated (free inactivos 90+ días sujetos a borrado desde oct 2026); región del proyecto **inmutable** tras creación.
- **Estrategia de conexión (obligatoria):**
  - **Runtime Prisma → SOLO pooled** (`-pooler` en hostname; PgBouncer transaction mode; hasta 10,000 conexiones cliente/compute). `DATABASE_URL="postgresql://user:pass@ep-xxx-pooler.<region>.aws.neon.tech/db?sslmode=require&connect_timeout=15"`.
  - **Migraciones → direct** (sin `-pooler`) vía `DIRECT_URL` en el datasource del schema (`directUrl = env("DIRECT_URL")` en Prisma 7).
  - `sslmode=require` obligatorio (Neon exige TLS); `connect_timeout=15` tolera el wake-up del compute (evita P1001); Prisma pool: `connection_limit` 5-10, `pool_timeout` 10 s (ojo: Prisma 7 driver-adapter cambia idle timeout a 10 s vs 300 s en v6). NO crear un cliente por request.
  - Región recomendada: `aws-us-west-2` (Oregon) o `aws-eu-central-1` (Frankfurt), emparejada con Render.
- **Verificado contra:** neon.com/docs (reestructuración enero 2026) · devops-platform-validation.md

#### 1.4.3 GitHub Actions (plan free)

- **Límites:** 2,000 min/mes + 500 MB artifacts + 10 GB cache (repo privado); 20 jobs concurrentes; 6 h máx por job; `on: schedule` solo UTC (mínimo 5 min), sin garantía de hora (30-60+ min en la práctica, runs saltados); auto-disable de schedules tras 60 días de inactividad; issue conocido: schedules no registrados en privados free (workaround: togglear visibilidad o cron en minuto no-cero).
- **Configuración autorizada:** runner pin **`ubuntu-24.04`** [CR-06] (NUNCA `ubuntu-latest`); `actions/checkout@v4`; `pnpm/action-setup@v4` con `version: 10`; `actions/setup-node@v4` con `node-version: 24` y `cache: pnpm`; `npx playwright install --with-deps` (cache-hit: solo `install-deps`); `actions/cache@v4` para `~/.cache/ms-playwright` (key por runner + hash de lockfile); `actions/upload-artifact@v4` (reportes en failure, retention 14 días).
- **Gates CI = verify_cmd del protocolo:** backend `pnpm typecheck && pnpm test && pnpm test:e2e`; frontend `pnpm typecheck && pnpm test`. Con coverage (`pnpm test -- --coverage`, thresholds 80/80/70/80). Migraciones: `prisma migrate deploy` ANTES de los tests de integración.
- **Reset diario (Opción A, recomendada):** workflow `on: schedule` (cron `8 8 * * *` UTC, minuto no-cero) + `workflow_dispatch`; `concurrency: { group: daily-reset, cancel-in-progress: false }`; script idempotente (`pnpm reset:db`: TRUNCATE + seed determinístico en transacción, fallo ruidoso exit≠0); conexión DIRECTA a Neon con secret (`RESET_URL`) — nunca en repo; sin endpoint destructivo público. IP allowlisting NO viable (runners IPs dinámicas; Neon sin allowlist de entrada). Opción B (endpoint interno `POST /api/admin/reset` con `X-Reset-Token`, comparación constante-time) SOLO como fallback si la conexión directa fuera bloqueada — nunca exponer público.
- **Verificado contra:** docs.github.com/actions · qa-tooling-verification.md §CI Pipeline · devops-platform-validation.md

#### 1.4.4 Node 24 compatibility (confirmada por dependencia)

| Dependencia | engines | Verdict |
|---|---|---|
| Vite 8.2.1 | `^20.19.0 \|\| >=22.12.0` | OK |
| Prisma 7.9.1 | `^20.19 \|\| ^22.12 \|\| >=24.0` | OK |
| jsdom 30.0.1 | `^22.22.2 \|\| ^24.15.0 \|\| >=26.0.0` | OK (24.19.0 >= 24.15.0) |
| Vitest 4.1.10 (Vite 8) | — | OK |
| @testing-library/jest-dom 7.0.1 | Node >=22 | OK |
| React Router 7.18.2 | Node >=20 | OK |
| NestJS 11 | Node >=20 | OK |
| argon2 0.45.1 | prebuilds Node 24; v0.45.0 dejó de testear Node 20 (EOL) | OK |
| @types/node | **24.13.3** (NO 26: es para Node 26) | OK |

---

## 2. Anti-Pattern Catalogue (expanded)

> **Severidades:** 🔴 CRÍTICO (bloquea implementación) · 🟠 ALTO (fallo de seguridad/integridad) · 🟡 MEDIO (deuda/correctitud). Cada anti-patrón tiene su contrapartida permitida en §1.

### 2.1 Baseline (heredados de 03-documentation-baseline.en.md, re-codificados)

| ID | Anti-patrón | Severidad | Contrapartida permitida |
|---|---|---|---|
| AP-01 | Auth opt-in endpoint por endpoint (olvidar proteger una ruta = exposición) | 🔴 | `APP_GUARD` + decorator `@Public()` (secure-by-default) — §1.2.2 |
| AP-02 | Tratar controles frontend ocultos o IDs impredecibles como autorización (BOLA: authorize every object addressed by ID) | 🔴 | Autorización por objeto en el use case; `RolesGuard` — §1.2.2 |
| AP-03 | Reusar modelos Prisma como DTOs o permitir mass assignment (nunca aceptar objetos de dominio completos del body) | 🔴 | DTOs class-validator con `whitelist` + `forbidNonWhitelisted` — §1.2.3 |
| AP-04 | Secrets hardcodeados, passwords en claro, tokens en web storage (`localStorage`/`sessionStorage` para access tokens) | 🔴 | Env vars + `ConfigService.getOrThrow`; cookies HttpOnly (`httpOnly: true`) — §1.2.6 |
| AP-05 | `prisma db push` / `migrate reset` / `migrate dev` en producción | 🔴 | `prisma migrate deploy` (no interactivo, advisory locking) — §1.2.4 |
| AP-06 | Escribir el historial fuera de la transacción de negocio | 🔴 | `$transaction` callback (interactivo) con `isolationLevel` — §1.2.4 |
| AP-07 | Asumir que una foreign key crea automáticamente su índice local | 🟠 | Índices explícitos justificados por patrones de query |
| AP-08 | Query filters anidados que dependen del parser Express viejo | 🟠 | Sintaxis verificada para Express 5 |
| AP-09 | Wildcards o parámetros opcionales incompatibles con Express 5 (path-to-regexp v8) | 🟠 | Wildcards nombrados `{*splat}` — §1.2.9 |
| AP-10 | Drag-and-drop como ÚNICO mecanismo de reordenar | 🟠 | Control permanente `Move to…` como alternativa contractual |
| AP-11 | `aria-grabbed` / `aria-dropeffect` deprecados | 🟠 | API a11y de dnd-kit (KeyboardSensor + live region) — §1.1.8 |
| AP-12 | `div` clickeables, placeholders como labels, acciones solo-hover | 🟠 | Elementos nativos + labels reales + foco visible |
| AP-13 | Declarar `role="grid"` sin implementar su modelo completo de teclado | 🟡 | Teclado completo o semántica más simple |
| AP-14 | Drawer no-modal marcado `aria-modal="true"` | 🟠 | `aria-modal` solo en modales reales |

### 2.2 Hallazgos críticos PH-00 (nuevos — documentados por primera vez aquí)

| ID | Anti-patrón | Severidad | Contrapartida permitida |
|---|---|---|---|
| AP-15 | **dnd-kit: mezclar familias.** Importar de `@dnd-kit/react` / `@dnd-kit/dom` (`DragDropProvider`, `useSortable` de `@dnd-kit/react/sortable` → `{ref}`) junto a la familia clásica (`@dnd-kit/core` + `@dnd-kit/sortable` → `{attributes, listeners, setNodeRef, transform, transition}`). Contratos incompatibles, rompe en runtime. | 🔴 | Solo familia clásica — §1.1.8 |
| AP-16 | **React Router: `BrowserRouter` + `Routes`** (Declarative Mode / legado v6). "Do not support data loading or actions" — sin `loader`/`action` no hay data mode; mezclar modos rompe loaders/actions. | 🔴 | `createBrowserRouter` + `RouterProvider` en todo el árbol — §1.1.4 |
| AP-17 | **TanStack Query v5: firma posicional v4** (`useQuery(key, fn, options)`). Rompe types y runtime en v5. | 🔴 | Object signature `useQuery({ queryKey, queryFn })` — §1.1.5 |
| AP-18 | **`@nestjs/validation`** — NO EXISTE en el registro npm (E404 verificado 2026-08-11). | 🔴 | `class-validator` + `class-transformer` + `ValidationPipe` — §1.2.3 |
| AP-19 | **`csurf`** — DEPRECADO/archivado (feb 2021), SNYK-JS-CSURF-3021144, defaults inseguros. Tampoco `@otterjs/csrf-csrf` (excluido por deprecación). | 🔴 | `csrf-csrf` 4.0.3 (Signed Double-Submit Cookie) — §1.2.6 |
| AP-20 | **Prisma: array de queries en `$transaction([...])`** — no soportado en v7. | 🔴 | `$transaction(async (tx) => {...})` callback — §1.2.4 |
| AP-21 | **Vitest: `test.workspace`** — deprecado en v4. | 🟠 | `test.projects` — §1.3.1 |
| AP-22 | **TypeScript 7.x** (compilador nativo en Go) — no expone la API JS de compilación que requieren `@nestjs/cli` (webpack/ts-loader) y Prisma. | 🔴 | `typescript@5.9.3` (la versión del monorepo de NestJS 11) — §1.1.2 |
| AP-23 | **Render free: asumir envío de email** — SMTP bloqueado desde sept 2025. | 🟠 | Proveedor transaccional por API HTTPS (Resend/SendGrid) — decisión de producto pendiente — §1.4.1 |
| AP-24 | **Neon: conexión directa para Prisma en runtime** — direct no aguanta el pool del runtime (límites `max_connections` ~104-450 según CU). | 🟠 | Pooled URL (`-pooler`) en runtime; direct SOLO para migraciones/reset — §1.4.2 |

### 2.3 Adicionales PH-00 (verificados por los agentes)

| ID | Anti-patrón | Severidad | Contrapartida permitida |
|---|---|---|---|
| AP-25 | **jest-axe** con Vitest (pensado para Jest) | 🟡 | axe-core directo + `@axe-core/react` (unit) + `@axe-core/playwright` (e2e) — §1.3.7 |
| AP-26 | **TanStack Query v6** y **react-hook-form v8** (beta) | 🟠 | Permanecer en v5.101.4 / v7.85.0 — §1.1.5, §1.1.7 |
| AP-27 | **Versiones futuras sin pin:** React 19.3.0 (en desarrollo), React Router v8 (8.3.0), Prisma 8 (RC), @nestjs/swagger 12 (alpha), @nestjs/config 12.0.0-next (prerelease) | 🟠 | Usar las versiones exactas de la tabla maestra §1.0 |
| AP-28 | **@types/node@26** (es para Node 26, no 24) | 🟠 | `@types/node@24.13.3` — §1.0 |
| AP-29 | Mezclar `useQuery` y `useSuspenseQuery` para la misma queryKey en el mismo árbol | 🟡 | Un solo hook por queryKey; `useQuery` por defecto — §1.1.5 |
| AP-30 | Optimistic updates sin la secuencia cancel → snapshot → update → rollback/invalidate | 🟡 | Patrón canónico completo — §1.1.5 |
| AP-31 | `fireEvent` cuando `userEvent` funciona; olvidar `await` en userEvent (todas sus APIs son Promise); `jest.*` en Vitest | 🟡 | `userEvent.setup()` + `await`; `vi.*` — §1.3.2 |
| AP-32 | SQLite / pg-mem como sustituto de integración (PostgreSQL real obligatorio) | 🔴 | Testcontainers `postgres:17-alpine` o service container — §1.3.5, §1.4.3 |
| AP-33 | Hardcodear puerto 5432 en testcontainers; imagen `:latest` | 🟠 | `container.getConnectionUri()`; pin de imagen — §1.3.5 |
| AP-34 | Exclusions silenciosas de axe (`exclude`/`disableRules` sin justificar) | 🟠 | Comentario `// a11y-exclusion <id>: <motivo>` en cada una — §1.3.7 |
| AP-35 | Claim de accesibilidad solo-automatizada (axe cubre ~30-40% de WCAG AA) | 🟠 | axe + checklist manual QA-007 + screen reader (VoiceOver/NVDA) — §1.3.7 |
| AP-36 | Snapshots gigantes frágiles; `data-testid` por defecto | 🟡 | Queries por rol/label; testid solo drag & drop — §1.3.2, §1.3.6 |
| AP-37 | Crear un PrismaClient por request; defaults de pool sin ajustar en Neon | 🟠 | PrismaService singleton; `connection_limit` 5-10, `pool_timeout` 10 s — §1.2.4, §1.4.2 |
| AP-38 | `cookieParser` registrado después del middleware CSRF; devolver el valor del cookie como token CSRF | 🔴 | cookieParser SIEMPRE antes; token vía `generateCsrfToken`/header `x-csrf-token` — §1.2.6 |
| AP-39 | Origin validation que rechaza cuando `Origin` está ausente (GETs same-origin, redirects 302) | 🟡 | Validar cuando presente; no rechazar si ausente — §1.2.6 |
| AP-40 | Prefijo `__Host-` en la cookie CSRF (exige HTTPS; rompe dev local en http) | 🟡 | Nombre custom `csrf-token` — §1.2.6 |
| AP-41 | `ubuntu-latest` en CI (el alias cambiará a 26.04) | 🟡 | Pin `ubuntu-24.04` — §1.4.3 |
| AP-42 | Persistent disk de Render en free (single-instance, mata zero-downtime, no monta en build) | 🟠 | Todo estado en Neon — §1.4.1 |
| AP-43 | Endpoint de reset destructivo público | 🔴 | Reset solo DB-side desde GHA (Opción A); nunca público — §1.4.3 |
| AP-44 | Cron de GHA en el minuto 0 (issue de schedules no registrados en privados free) | 🟡 | Minuto no-cero (`8 8 * * *`) — §1.4.3 |
| AP-45 | Secrets commiteados en el repo | 🔴 | Env vars/secrets del dashboard + `render.yaml` con `sync: false` — §1.4.1 |
| AP-46 | Router (React Router) en estado de React (`useState`/`useMemo`) | 🟠 | Crear una vez, fuera del árbol — §1.1.4 |
| AP-47 | Middleware de auth sin `loader` que fuerce su ejecución client-side | 🟡 | Añadir `loader` (aunque retorne `null`) si se usa middleware — §1.1.4 |
| AP-48 | `handleSubmit` sin try/catch: errores de servidor no mapeados con `setError` (isSubmitSuccessful queda `true`) | 🟡 | try/catch + `setError(name, { type: 'manual' })` — §1.1.7 |
| AP-49 | `z.infer` malinterpretado como input type cuando hay transforms | 🟡 | `z.input`/`z.output` explícitos — §1.1.6 |
| AP-50 | Validación en Zod sin `valueAsNumber: true` para campos numéricos de forms | 🟡 | `register('age', { valueAsNumber: true })` — §1.1.7 |
| AP-51 | `enableImplicitConversion: true` en ValidationPipe (conversiones implícitas no deseadas) | 🟠 | `enableImplicitConversion: false` — §1.2.3 |
| AP-52 | Dejar los defaults de `@nestjs/config` (`allowUnknown: true`, `abortEarly: false`) | 🟠 | `validationOptions: { allowUnknown: false, abortEarly: true }` — §1.2.3 |
| AP-53 | Contraseñas fuera de `@Length(8, 72)` (argon2 ignora bytes >72) | 🟠 | `@Length(8, 72)` — §1.2.3 |
| AP-54 | Parámetros argon2 distintos de OWASP (m=19456, t=2, p=1, argon2id) | 🟠 | Set OWASP explícito en `hash()` — §1.2.5 |
| AP-55 | `Access-Control-Allow-Origin: *` con credenciales | 🔴 | Lista blanca + `credentials: true` — §1.2.10 |
| AP-56 | Wildcards sin nombre en Express 5 (`*`) | 🟠 | `{*splat}` — §1.2.9 |
| AP-57 | `jsonwebtoken` declarado como dependencia directa (es transitiva de `@nestjs/jwt`) | 🟡 | Solo `@nestjs/jwt` — §1.2.2, CR-11 |
| AP-58 | Tests e2e que usan el seed de desarrollo en vez de datos controlados por fixtures | 🟠 | Fixtures que crean/limpian sus propios datos — §1.3.6 |
| AP-59 | `prisma migrate dev` en CI/producción (puede pedir reset) | 🔴 | `migrate deploy` en CI — §1.2.4 |
| AP-60 | `page.waitForTimeout` / sleep ad-hoc en Playwright | 🟡 | Assertions web-first con auto-wait — §1.3.6 |
| AP-61 | `reuseContext: true` de Playwright en E2E (experimental, sin aislamiento) | 🟠 | Contexto nuevo por test (default) — §1.3.6 |

---

## 3. Cross-Cutting Rules

### R-1. "No unverified external API is authorized for implementation"

Ninguna API de ninguna dependencia puede usarse en implementación si no está listada en este documento (sección 1) o si la dependencia no está en la tabla maestra (§1.0). **La lista concreta de lo autorizado** es: todas las entradas de §1.0 (tabla maestra) con sus APIs de las subsecciones §1.1-1.4, y únicamente las verificaciones DOC-002..005 referenciadas. Un agente que necesite una API que no esté aquí debe: (a) verificar contra la documentación oficial (Context7 MCP + `npm view`), (b) resolver la contradicción en el registro de conflictos (§0), y (c) actualizar este documento ANTES de escribir código.

### R-2. Regla de versiones

- Solo las versiones exactas de la tabla maestra (§1.0), derivadas de `technology-matrix.md` (registro npm, 2026-08-11). **Sin rangos (`^`, `~`) y sin `latest`** en `package.json` — pines exactos.
- react y react-dom SIEMPRE a la misma versión. `@nestjs/*` del core al 11.1.29. `vitest` y `@vitest/coverage-v8` al mismo pin. `@prisma/client` y `prisma` al mismo pin.
- Ningún paquete EOL/deprecado autorizado: excluidos `csurf`, `@otterjs/csrf-csrf`, `jest-axe`, `react-beautiful-dnd`, `@node-rs/argon2` (solo plan B condicionado), `jsonwebtoken` (transitiva).
- Versiones futuras (React 19.3.0, RRv8, TQv6, RHFv8, Prisma 8, TS 6/7, swagger 12, config 12.0.0-next, @types/node 26) NO están autorizadas; su adopción requiere revalidación y actualización de este documento.
- Todo pin nuevo (p. ej. pines pendientes de CR-07..CR-12) debe resolverse antes del setup con `npm view <pkg> version` y registrarse en el matrix.

### R-3. Regla de documentación (verificación obligatoria por implementación)

Toda implementación debe citar la sección oficial verificada: `Documento de verificación` + URL oficial + fecha (formato de §1: "Verificado contra: … (2026-08-11)"). Requisitos del baseline mantenidos: (1) la versión exacta consultada; (2) la sección o ejemplo oficial a seguir; (3) un checklist funcional y automatizado; (4) una búsqueda explícita de anti-patrones aplicables (§2); (5) evidencia de tests, no solo presencia de código.

### R-4. Runtime y compatibilidad

- Node **24.19.0 LTS** en local, CI (`node-version: 24`) y Render. `@types/node@24.13.3`. Node 20 se retira de runners GHA el 2026-09-16 — obligatorio Node 24.
- Compatibilidad Node 24 confirmada por dependencia en §1.4.4.

### R-5. Seguridad (stack obligatorio y derivados)

- Orden del stack de seguridad: `helmet` → CORS (lista blanca + `credentials: true`) → `cookieParser` → Origin validation → CSRF (`csrf-csrf` signed double-submit) → guards globales (Throttler → JWT → Roles) → `ValidationPipe` global (§1.2.12).
- Secure-by-default: toda ruta exige JWT salvo `@Public()`. Re-chequear que el usuario está activo en cada request autenticado. Authorize every object by ID (BOLA). Pinar algoritmo JWT y validar `exp`/`iss`/`aud`/firma. Access tokens en cookies HttpOnly, NUNCA en web storage. Limitar tamaño de body, longitudes, paginación y frecuencia (Throttler).
- Transacciones cortas, sin llamadas de red dentro. Historial dentro de la transacción de negocio.
- Migraciones de schema SIEMPRE con el ORM del proyecto (Prisma Migrate); nunca `synchronize: true`. `migrate deploy` en producción/CI.

### R-6. Accesibilidad (WCAG 2.2 AA)

- KeyboardSensor + `sortableKeyboardCoordinates` en todo DndContext. Contrapartida `Move to…` permanente al drag & drop.
- Estado/prioridad/errores representados por texto, no solo color. 320 px + 400% zoom sin pérdida. Contraste 4.5:1 (normal) / 3:1 (grande). Targets táctiles ≥ 44×44 px. Paste/autocomplete/password managers permitidos en login.
- Claim de accesibilidad = axe automatizado (serious/critical, tags WCAG 2.2 AA) + checklist manual + screen reader; exclusions documentadas inline. Nunca claim automation-only.

### R-7. Testing (guards de PH-11)

- Sin snapshots gigantes frágiles; sin test IDs por defecto; sin exclusiones silenciosas de axe; sin claim de accesibilidad solo-automatizada; sin SQLite/pg-mom como sustituto de integración — **PostgreSQL real obligatorio** (Testcontainers `postgres:17-alpine` o service container).
- Preferir `userEvent.setup()` sobre `fireEvent`; queries accesibles por rol/label; Vitest con `vi.*`.
- Coverage thresholds 80/80/70/80 en CI, archivos de infra excluidos. verify_cmd: backend `pnpm typecheck && pnpm test && pnpm test:e2e`; frontend `pnpm typecheck && pnpm test`.

### R-8. Datos y entorno

- Todo estado persistente en Neon (filesystem de Render efímero). Secrets solo en dashboards (env vars / `sync: false` / GHA secrets) — nunca en repo. Región de Render y Neon emparejadas (Oregon o Frankfurt); región de Neon inmutable. Sin endpoint de reset público.
- Render free: sin email SMTP; cold start 30-60 s → loading state + disclosure en README; un solo Web Service free activo.

---

## 4. PH-00 Gate Checklist

> Leyenda: ✔ RESUELTO en este documento · ⬜ PENDIENTE (acción requerida para cerrar el gate)

- [x] **Todas las dependencias directas aparecen en el technology matrix** — RESUELTO CON EXCEPCIONES DOCUMENTADAS: 6 dependencias verificadas en DOC-002..005 no están en el matrix y quedan autorizadas con resolución explícita en §0 (CR-07..CR-12): `joi 18.2.3`, `@prisma/adapter-pg 7.x`, `supertest 7.x`, `@testcontainers/postgresql`, `@axe-core/playwright 4.x`, `@types/express`. ⬜ ACCIÓN: sincronizar el matrix con estas entradas (pines exactos para supertest/@testcontainers/adapter-pg/@types/express antes del setup).
- [x] **Ningún paquete EOL/deprecado autorizado** — ✔ `csurf`, `@otterjs/csrf-csrf`, `jest-axe`, `react-beautiful-dnd`, `@node-rs/argon2` (solo plan B condicionado), `jsonwebtoken` (transitiva, no directa) quedan EXCLUIDOS explícitamente (AP-19, AP-25, AP-57, §3 R-2). ✔ Todas las versiones de la tabla maestra son estables y no-EOL (React 19.2.8 > 19.3.0-dev; Prisma 7.9.1 > 8-RC; TS 5.9.3 > 7.x).
- [x] **Todas las APIs listadas tienen referencia a documentación oficial** — ✔ Cada entrada de §1.1-§1.4 incluye "Verificado contra" con URL oficial y fecha 2026-08-11 (fuentes primarias de DOC-002..005). ⬜ ACCIÓN menor: los pines pendientes (CR-07..CR-12) deben añadir su URL de verificación al matrix tras resolver la versión exacta.
- [x] **Todos los anti-patrones conocidos están documentados** — ✔ 14 heredados de la baseline (AP-01..AP-14) + 47 nuevos de PH-00 (AP-15..AP-61), incluyendo los 10 hallazgos críticos (AP-15..AP-24).
- [x] **Node 24 compatibility confirmada para cada dependencia** — ✔ §1.4.4 (Vite, Prisma, jsdom, Vitest, jest-dom, React Router, NestJS 11, argon2; @types/node 24.13.3; GHA `node-version: 24`).
- [x] **No hay contradicciones entre los 5 documentos fuente** — ✔ 13 contradicciones identificadas y RESUELTAS en §0 (CR-01..CR-13): Vitest 4.1.10, Playwright 1.62.1, jest-dom 7.0.1, @nestjs/core 11.1.29, `postgres:17-alpine`, `ubuntu-24.04`, autorización de joi/adapter-pg/supertest/testcontainers/@axe-core/playwright/@types/express, exclusión de jsonwebtoken directa, Node 24 en CI. ⬜ ACCIÓN: actualizar los templates del qa-tooling-verification.md (postgres:16-alpine → 17-alpine; ubuntu-latest → ubuntu-24.04) para que reflejen las resoluciones.

### Cierre del gate

- [x] Documento consolidado creado con las 4 secciones canónicas: catálogo autorizado (§1), anti-patrones (§2), reglas cross-cutting (§3), checklist (§4).
- [x] Regla "No unverified external API is authorized for implementation" activa con la lista concreta de lo autorizado (§3 R-1).
- [x] Regla de versiones exactas (sin rangos ni latest) activa (§3 R-2).
- [x] Regla de documentación (citar sección oficial verificada) activa (§3 R-3).
- ⬜ ACCIONES PENDIENTES (fuera del alcance de DOC-006, no bloquean la implementación de fases que usen solo pines ya exactos):
  1. Sincronizar technology-matrix.md con CR-07..CR-12 (joi, @prisma/adapter-pg, supertest, @testcontainers/postgresql, @axe-core/playwright, @types/express).
  2. Corregir `postgres:16-alpine` → `postgres:17-alpine` en qa-tooling-verification.md (templates de integración y CI).
  3. Corregir `ubuntu-latest` → `ubuntu-24.04` en el template CI de qa-tooling-verification.md.
