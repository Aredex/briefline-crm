# PH-12 — Code Changes (OPS-001 / OPS-004 / OPS-006)

**Date:** 2026-08-11
**Status:** Implementado y verificado (`pnpm typecheck` + unit tests OK)

---

## OPS-001 — Unified production build (ServeStaticModule)

### Cambios
- `apps/api/src/app.module.ts`: `ServeStaticModule.forRoot()` condicional solo con
  `NODE_ENV === 'production'`, sirviendo `resolve(__dirname, '../../web/dist')`
  (= `<repo>/web/dist`, resuelto desde `apps/api/dist/app.module.js` — robusto al cwd).
- `apps/api/package.json`: `@nestjs/serve-static@5.0.5` **ya estaba** en dependencies
  (PH-04) — sin cambios necesarios.

### Desviaciones documentadas del enunciado (obligatorias — verificado empíricamente)
El patrón literal del enunciado (`serveRoot: '/'` + `renderPath: '*'` + exclude
`'/api/(.*)'`) **crashea con este stack** (`@nestjs/serve-static@5.0.5` + Express 5.2.1,
ambos sobre path-to-regexp v8.4.2 — probado con probe real contra express 5.2.1):

| Literal del enunciado | Error real |
|---|---|
| `renderPath: '*'` | `PathError: Missing parameter name at index 3` (al arrancar; `*` desnudo es inválido en v8) |
| `serveRoot: '/'` + renderPath → concatena `'//*'` | mismo `PathError` al arrancar |
| `exclude: ['/api/(.*)']` | `TypeError: Unexpected ( at index 5` en **cada request** que llega al fallback (sintaxis v6, inválida en v8) |

**Configuración final** (semánticamente idéntica a la intención del enunciado):
```ts
ServeStaticModule.forRoot({
  rootPath: resolve(__dirname, '../../web/dist'),
  exclude: ['/api/{*any}'], // sintaxis v8; '/api/(.*)' rompería en runtime
})
```
- `serveRoot`/`renderPath` en defaults → `express.static` montado en `/` y fallback
  `'{*any}'` (el default del paquete para Express 5) → deep refresh del SPA funciona.
- **Orden real de middleware** (verificado contra el source de serve-static v5):
  el loader registra vía `onModuleInit` (después del router de Nest) →
  `helmet → cache-control → CORS → cookie-parser → compression → [Nest: OriginValidation → CSRF → controllers] → serve-static (fallback final)`.
  Los controllers ganan siempre sobre `/api/*`; el exclude hace que rutas API sin match
  sigan su 404 normal (nunca devuelven HTML del SPA).

### Probe de validación (express 5.2.1, orden real de producción)
```
/                -> 200 index.html
/clients         -> 200 index.html (deep refresh)
/tasks/board     -> 200 index.html (deep refresh)
/api/v1/health   -> 200 JSON (controller gana)
/api/v1/unknown  -> 404 (excluido de static)
/assets/x.js     -> 200 index.html (fallback SPA)
```

---

## OPS-004 — Deploy migration

### Cambios
- `apps/api/package.json`: nuevo script
  `"start:deploy": "prisma migrate deploy && node dist/main.js"`:
  - `prisma migrate deploy` usa `prisma.config.ts` (que ya carga `../../.env` con dotenv;
    en Render las variables `DATABASE_URL`/`DIRECT_URL` del entorno prevalecen porque
    dotenv no sobreescribe).
  - Fracaso → `&&` corta y el exit code del migrate se propaga (pnpm preserva el exit
    code del child) → deploy bloqueado.
  - `start:prod` se mantiene intacto (simulación local de prod sin migrar).
- `package.json` (raíz): nuevo script
  `"render-build": "pnpm install --frozen-lockfile && pnpm --filter @briefline/web build && pnpm --filter @briefline/api build"`.
  - Paso 2 del enunciado (`api-contract build`) **omitido**: `packages/api-contract` no
    tiene script `build` (solo `generate`/`validate`/`typecheck`) — los tipos generados
    (`api-types.ts`, client prisma en `src/generated/prisma`) están commiteados (ADR-005).
- `render.yaml`: `buildCommand` actualizado a `pnpm run render-build` (una sola fuente
  de verdad; pasos idénticos a los inline previos). `startCommand` ya apuntaba a
  `start:deploy` (creado en la fase de docs OPS-002).

---

## OPS-006 — TLS / headers / proxy

### Verificado (ya cumplido, sin cambios)
- `app.set('trust proxy', 1)` — ya presente en `apps/api/src/main.ts` (AUTH-004).
- Cookies `secure: true` en producción — ya implementado:
  `AUTH_COOKIE_OPTIONS(isProduction)` en `auth.constants.ts` (`secure: isProduction`),
  usado por login y logout. Cookie de prod además usa prefijo `__Host-` (implica
  Secure + Path=/ + sin Domain).

### Añadido
- Nuevo `GET /api/v1/health` (público, sin autenticación — `@Public()`):
  - `apps/api/src/modules/health/health.controller.ts` — devuelve
    `{ status: 'ok', timestamp: new Date().toISOString() }` (sin tocar DB a propósito:
    probe de liveness del proceso).
  - `apps/api/src/modules/health/health.module.ts` — registrado en `AppModule`.
  - Ruta final: prefix `api` + versioning `v1` → `/api/v1/health`, consumido por
    `healthCheckPath` de render.yaml, smoke tests (OPS-008) y daily-reset (OPS-007).

---

## Verificación

- `pnpm typecheck` (api + web + api-contract): **OK**.
- `pnpm --filter @briefline/api test` (unit): **47/47 OK** (los e2e no cargan
  ServeStaticModule: `NODE_ENV=test` en `vitest.e2e.config.ts`, y el condicional solo
  se activa con `production`).
- No se modificaron tests existentes.

## Archivos tocados
- `apps/api/src/app.module.ts` (editado)
- `apps/api/src/modules/health/health.controller.ts` (nuevo)
- `apps/api/src/modules/health/health.module.ts` (nuevo)
- `apps/api/src/main.ts` (solo comentario de bootstrap)
- `apps/api/package.json` (script `start:deploy`)
- `package.json` (raíz, script `render-build`)
- `render.yaml` (buildCommand → `pnpm run render-build`)
