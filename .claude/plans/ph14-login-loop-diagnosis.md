# PH-14 — Diagnóstico: loop de refrescos en el login (http://localhost:5173)

Fecha: 2026-08-11
Estado: diagnóstico cerrado (sin cambios de código aplicados)

## Síntoma

Entrando a `http://localhost:5173`, la página hace ~20 recargas/redirects automáticos
antes de detenerse en el login. Ocurre sin interacción del usuario, con sesión no
iniciada (backend en `:3000`, `/api/v1/auth/me` → 401, mocks deshabilitados).

## Causa raíz

**`ensureSession()` en `apps/web/src/router.tsx` (línea 36) llama a `GET /auth/me`
sin `skipUnauthorizedRedirect: true`.** La única llamada que respeta la opción es
`fetchCurrentUser()` en `client.ts` (línea 66), usada por el bootstrap de
`AuthProvider`. Los loaders del router NO la usan.

Consecuencia en `rawFetch` (`apps/web/src/api/client.ts`, líneas 163-171): al recibir
401 y no estar marcada la opción, el handler global hace `clearSession()` +
`redirectToLogin(...)` → como `setUnauthorizedHandler` **nunca se registra en ningún
sitio** (solo existe la definición en `client.ts:75`; el handler queda `null`), cae en
`window.location.assign('/login?next=...')` — **una recarga completa de página**.

### El loop, paso a paso

1. `GET /` → loader índice → redirect SPA a `/dashboard`.
2. Loader `requireAuth` de `/dashboard` → `ensureSession()` → sesión vacía →
   `api.get('/auth/me')` **sin skip** → 401 →
   `window.location.assign('/login?next=...')` → **reload completo**. (El
   `throw redirect()` de `requireAuth` también ocurre, pero la navegación real del
   navegador gana y descarta el estado SPA.)
3. Se carga `/login?next=...` → `loginLoader` → `ensureSession()` → de nuevo
   `api.get('/auth/me')` sin skip → 401 → `window.location.assign(...)` → **reload
   completo**.
4. Repite indefinidamente. Cada iteración es un document load completo, no un
   redirect del router.

El cese observado tras ~20 recargas coincide con la heurística anti-loop de recargas
de Chrome ("kept refreshing"): el navegador deja de recargar y muestra la última
página cargada (el login). Sin esa heurística el loop sería infinito.

### Por qué `fetchCurrentUser` (AuthProvider) no lo corta

`fetchCurrentUser` usa `skipUnauthorizedRedirect: true` (correcto), pero los loaders
del data router corren ANTES del montaje de React y son ellos quienes disparan el
`assign`. El loop lo mantiene `loginLoader` en cada carga de `/login`, no el
AuthProvider.

## Bugs secundarios detectados

1. **`next` siempre apunta al endpoint, no a la página original** — `client.ts:167-168`:
   `redirectToLogin` recibe `url.pathname + url.search` donde `url` es la URL del
   FETCH (`/api/v1/auth/me`), no la de la página. Resultado: `next=%2Fapi%2Fv1%2Fauth%2Fme`
   en lugar del destino real.
2. **`setUnauthorizedHandler` es código muerto** — el comentario de `client.ts:74`
   ("AuthProvider registers this so 401s navigate without a full page reload") no se
   cumple: ninguna llamada registra el handler, así que todo 401 genérico causa
   reload completo por diseño. Esto multiplica la visibilidad del bug (20 recargas
   en lugar de 1 redirect).

## Fix propuesto

### Fix principal (obligatorio, 1 línea)

`apps/web/src/router.tsx`, línea 36:

```ts
// ANTES
const user = await api.get<UserResponse>('/auth/me')
// DESPUÉS
const user = await api.get<UserResponse>('/auth/me', { skipUnauthorizedRedirect: true })
```

Efecto: 401 → `ApiError(401)` → `ensureSession` lo captura y devuelve `null` →
`requireAuth` redirige por el router (SPA, sin reload) → `loginLoader` en `/login`
recibe `null` y renderiza el login. Un único redirect, sin loop. El diseño de la
opción ya existía exactamente para esto (comentario en `client.ts:100-101`).

### Fix secundario recomendado

`apps/web/src/api/client.ts`, líneas 167-168 — derivar `next` de la página actual:

```ts
// ANTES
const destination = new URL(url, window.location.origin)
// DESPUÉS
const destination = new URL(window.location.href)
```

### Decisión pendiente (no bloqueante para el bug)

Conectar `setUnauthorizedHandler` en `AuthProvider` (navegación SPA vía
`react-router`) o mantener el diseño actual de "401 = full reload". El comentario
de `client.ts:74` sugiere que la intención era registrarlo; hoy no se hace.
Recomendación: registrarlo con `navigate()` para evitar recargas completas en 401
genéricos (p. ej., sesión expirada con pestaña abierta).

## Archivos involucrados

- `apps/web/src/router.tsx` (líneas 32-43, 62-71) — `ensureSession` / `loginLoader`
- `apps/web/src/api/client.ts` (líneas 65-68, 74-92, 163-171) — 401 handler,
  `skipUnauthorizedRedirect`, handler muerto, `next` incorrecto
- `apps/web/src/providers/AuthProvider.tsx` — bootstrap correcto (usa skip); no
  registra `setUnauthorizedHandler`
- `apps/web/src/App.tsx` — orden de providers correcto (ErrorBoundary > QueryProvider
  > AuthProvider > RouterProvider); sin problema
- `apps/web/src/main.tsx` — sin problema (StrictMode + mocks opt-in)
- `apps/web/src/lib/auth-session.ts` — store en memoria sin persistencia; sin problema

## Verificación del fix

- Sin sesión: `GET /` → un solo redirect SPA a `/login?next=%2Fdashboard`; cero
  recargas (contar document loads en DevTools).
- Con sesión válida: `GET /` → `/dashboard` directo, sin 401.
- `login` → vuelve a `next` correcto (tras fix secundario).
