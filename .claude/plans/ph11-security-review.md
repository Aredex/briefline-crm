# SEC-002 — Revisión de seguridad exhaustiva (PH-11)

Fecha: 2026-08-11
Alcance: `apps/api` (NestJS 11, Prisma 7, PostgreSQL) + `apps/web` (React 19 SPA)
Estado del código: `pnpm typecheck` limpio, 120/120 tests de integración pasan (7 specs: auth, clients, profile, tasks, users, csrf, db-integrity).

## Veredicto global: 🟢 Riesgo BAJO-MEDIO

La superficie de seguridad de la API está muy bien construida: autorización por objeto dentro de transacciones, allowlist estricta en DTOs + ValidationPipe global, cookies HttpOnly/`__Host-`/SameSite, CSRF double-submit firmado con rotación, throttling por capas, helmet + CORS allowlist, logging redactado, cero SQL raw y sin secrets commiteados. No se encontraron vulnerabilidades explotables de categoría Critical ni High en el código de la API. Los hallazgos relevantes son Medium condicionados al despliegue (credenciales demo públicas) y un conjunto de hardening Low accionable.

---

## 1. BOLA/IDOR — ✅ Sin hallazgos explotables

Modelo verificado: CRM single-team, no multi-tenant. La visibilidad team-wide de resources activos es el diseño documentado (permission-matrix.md §4) y la autorización por objeto está correctamente implementada:

- `apps/api/src/modules/tasks/tasks.policy.ts` — `canViewTask` (archived → solo ADMIN), `canEditTask` (ADMIN any; MEMBER solo `creatorId === actor.id || assigneeId === actor.id`), `canArchiveTask` (ADMIN). Predicados puros, única superficie de autorización de tasks.
- `tasks.service.ts` — autorización **dentro de la transacción** de cada mutación (`assertCanEdit`, línea 522): member sobre task archivada → 404 idéntico a not-found (BR-016); admin → 409 TASK_ARCHIVED; member sin relación → 403 sin insinuar existencia (BR-013/BR-014).
- `clients.service.ts` — `findOne` (línea 103): ARCHIVED + member → 404 (BR-005). `buildListWhere` (línea 229): member nunca ve ARCHIVED, ni con `?status=ARCHIVED` (filtro vacío, sin 403).
- `users.service.ts` + `users.controller.ts` — recurso completo con `@Roles(UserRole.ADMIN)` a nivel de clase; LAST_ADMIN protegido en transacción SERIALIZABLE con retry P2034.
- `profile.controller.ts` — scoped por JWT (`user.id` del CurrentUser, nunca del body, AP-05).
- `dashboard.service.ts` — `myTasks` filtra por `assigneeId: actor.id`; `recentActivity` excluye eventos de tasks archivadas para members (DASH-003, sin leak de actividad oculta).

Cobertura de tests: `test/integration/tasks/tasks.spec.ts` y `apps/web/test/e2e/forbidden-mutation.spec.ts` (FLOW-003: member PATCH de task ajena → 403 y versión intacta, verificado por E2E real).

## 2. Mass assignment — ✅ Sin hallazgos

- ValidationPipe global (`apps/api/src/common/pipes/app-validation.pipe.ts`): `whitelist: true`, `forbidNonWhitelisted: true`, `forbidUnknownValues: true`, sin conversión implícita de tipos (AP-51). Propiedades desconocidas → 400 UNKNOWN_PROPERTY.
- DTOs con allowlist manual estricta: `create-task.dto.ts`, `update-task.dto.ts` (status NO editable — endpoint dedicado), `create-client.dto.ts`, `update-profile.dto.ts` (solo `name`).
- Los services **construyen el objeto `data` explícitamente** (nunca `{...dto}`), y los campos de autoría (`creatorId`, `createdById`) se asignan del actor JWT, nunca del body.
- `update()` de users/clients rechaza bodies vacíos (`Object.values(dto).some(...)`) — no hay no-op silenciosos.

## 3. Cookies — ✅ Sin hallazgos

`apps/api/src/modules/auth/auth.constants.ts` + `auth.service.ts`:
- JWT en cookie: `httpOnly: true`, `sameSite: 'lax'`, `secure: isProduction`, `path: '/'`, `maxAge` = 8h.
- Producción usa `__Host-briefline-token` (implica Secure + Path=/ + sin Domain — validado por el navegador); dev/tests usan nombre sin prefijo (ADR-001). Sin atributo `domain` — correcto para `__Host-`.
- Cookie CSRF: `httpOnly: true`, `sameSite: 'strict'`, `secure: isProduction` (sin `__Host-` por diseño AP-40: es double-submit y el token viaja por body).
- JWT strategy (`jwt.strategy.ts`): `algorithms: ['HS256']` fijado, `issuer` y `audience` pinnados, `ignoreExpiration: false`, y **recarga el usuario de la DB por request** exigiendo `status === 'ACTIVE'` — deactivación surte efecto inmediato (AP-06).
- Fallback Bearer header documentado (ADR-001) para clientes API.

## 4. CSRF — ✅ Sin hallazgos

`apps/api/src/common/csrf/` + `auth.service.ts`:
- Middleware global (`forRoutes('*')`) exigiendo X-CSRF-Token válido en **todo** POST/PATCH/PUT/DELETE, incluido login y rutas públicas; GET/HEAD/OPTIONS exentos.
- Double-submit **firmado** (csrf-csrf 4.0.3), token ligado al session identifier = **valor de la cookie JWT** — un token robado de otra sesión no sirve (y los tokens pre-login solo valen con sesión 'anonymous').
- Rotación en login (línea 74: se liga al JWT recién emitido) y en logout (rebinding a 'anonymous').
- Defensa en profundidad: `OriginValidationMiddleware` (rechaza Origin cross-site no allowlisted vía `URL.origin` exacta, no substring; peticiones sin header Origin pasan, AP-39) + SameSite=Lax/Strict.
- Frontend: token en memoria (nunca web storage, AP-04/ADR-001); ante 403 CSRF_INVALID refresca y reintenta una vez (`apps/web/src/api/client.ts`).
- Tests: `test/integration/csrf.spec.ts` (sin token → 403; rotación post-login; re-binding en logout).

## 5. Throttling — ✅ OK con matiz de despliegue (ver hallazgo LOW-1)

- Global: 100 req/min por IP (`ThrottlerModule.forRoot`, 'default').
- Login: 5/min con block 300s (`@Throttle` por ruta en `auth.controller.ts`; el named 'auth' global existe solo como referencia, comentado correctamente en `app.module.ts`).
- Todos los endpoints pasan por `ThrottlerGuard` (APP_GUARD global). Endpoints sensibles restantes (logout, me, csrf) a 100/min global — aceptable.

## 6. Headers — ✅ Sin hallazgos

`apps/api/src/main.ts`:
- `helmet()` por defecto: CSP `default-src 'self'`, `X-Content-Type-Options: nosniff`, `Strict-Transport-Security`, `X-Frame-Options`, `Referrer-Policy`, etc.
- CORS allowlist desde `CORS_ORIGINS` (comma-separated, comparación exacta) con `credentials: true` — correcto para cookies HttpOnly.
- Body limit 100kb, cookie-parser, compression, `trust proxy 1` (ver LOW-1).
- API pura (JSON); la SPA se sirve separada por Vite.

## 7. Secrets — ⚠️ Hallazgos MEDIUM-1 y MEDIUM-2

- ✅ No hay `.env` committeado; docker/compose.yml solo credenciales dev explícitas.
- ✅ `JWT_SECRET`/`CSRF_SECRET` requeridos por Joi (min 32 chars) sin defaults — boot falla si faltan (`configuration.ts`).
- ⚠️ Ver MEDIUM-1 (credenciales demo en el bundle del frontend) y MEDIUM-2 (seed con password demo pública).

## 8. Logs — ✅ Sin hallazgos

`apps/api/src/common/logger/custom.logger.ts`:
- Redacción recursiva de claves sensibles (`password`, `pass`, `token`, `secret`, `authorization`, `cookie`, `set-cookie`, `x-csrf-token`, `csrf`, `jwt`, `apikey`, `api_key`), JWTs completos (regex `eyJ...`) y connection strings PG con credenciales.
- `problem-details.filter.ts`: 500s nunca devuelven stack ni mensaje interno al cliente (fixed `INTERNAL_ERROR`), stack y SQL solo en logs server-side con traceId.
- Eventos de auth logueados sin credenciales ni emails (API-005).

## 9. SQL injection — ✅ Sin hallazgos

- Cero usos de `$queryRaw`/`$executeRaw` en `apps/api/src` (grep completo).
- Todas las queries son Prisma typed (findMany/findUnique/count con `where`); los `contains` con `mode: 'insensitive'` son parametrizados por el driver.
- Params de query con validación estricta: UUIDs `@IsUUID`, enums `@IsEnum`, fechas `@Transform`+`@IsDate`, `limit` capado a 100 (`@Max(100)` en los tres query DTOs) — sin paginación desbordable (DoS de lectura acotada).

## 10. Dependencies — ⚠️ 1 vulnerabilidad HIGH, no explotable en runtime (ver LOW-3)

`pnpm audit --prod`: 1 high — `js-yaml 5.2.1` (GHSA-pm4m-ph32-ghv5, DoS por parsing exponencial en flow collections) vía `@nestjs/swagger@11.4.6`.

---

## 🐛 Hallazgos

### MEDIUM-1 — Credenciales demo hardcodeadas en el bundle del frontend
- **Ubicación**: `apps/web/src/pages/Login.tsx:38-39` (y `apps/web/src/mocks/data.ts:347`, `apps/web/src/mocks/handlers.ts:34`)
- **Descripción**: `DEMO_ACCOUNTS` expone en el JavaScript de producción `admin@northstar.digital` / `member@northstar.digital` con password `Briefline2026!`, con botones de autofill en la página de login. Además **no coinciden** con el seed local (`apps/api/prisma/seed.ts`: `admin@briefline.demo` / `member@briefline.demo` con `briefline-demo-2026`), lo que sugiere que apuntan a un despliegue demo externo no versionado en el repo.
- **Impacto**: Si el despliegue público crea cuentas con esas credenciales (o las hereda de una versión anterior del seed), cualquier visitante entra como ADMIN. Divergencia: si no existen, el botón demo no funciona (confusión de UX, no seguridad).
- **Fix**: (1) Confirmar que el entorno desplegado NO crea cuentas con esas credenciales. (2) Alinear `DEMO_ACCOUNTS` con las cuentas del seed versionado, o leerlas de `import.meta.env` (solo definir en dev/demo). (3) Considerar ocultar `fillDemo` en producción (flag de entorno).

### MEDIUM-2 — Seed con password demo pública y hash precomputado compartido
- **Ubicación**: `apps/api/prisma/seed.ts:19-33` — `DEMO_PASSWORD_HASH` publicado (PHC con salt fijo) y la misma password `briefline-demo-2026` para TODAS las cuentas (documentado como demo pública OBJ-005).
- **Descripción**: Cualquiera que lea el repo conoce la password de los 2 admin del seed. Todos los usuarios del seed comparten el mismo hash (mismo salt) — intencional, pero amplifica si el hash se reutiliza.
- **Impacto**: Si `prisma:seed` se ejecutara en un entorno con datos reales o alcanzable públicamente con datos sintéticos sensibles, compromiso total como ADMIN.
- **Fix**: (1) Gate explícito en el seed: abortar si `NODE_ENV === 'production'` o si `DATABASE_URL` no es la URL de demo conocida. (2) Mantener la demo en un entorno aislado y documentarlo en el README de deploy. (3) Opcional: generar el hash en runtime en vez de precomputado (misma password, salts únicos).

### LOW-1 — `trust proxy: 1` + rate limiting por IP dependiente del despliegue
- **Ubicación**: `apps/api/src/main.ts:36`, `app.module.ts:41-44`
- **Descripción**: Express confía en `X-Forwarded-For` del primer salto para `req.ip` (base del throttler). Si la API fuera accesible sin proxy intermedio que normalice XFF (p. ej. puerto expuesto directo, redirección accidental, orquestación mal configurada), un atacante rota el header para bypassear el 5/min de login y el 100/min global.
- **Fix**: Verificar en el deployment (Render) que el API solo escucha tras el proxy (que sobrescribe XFF). Considerar `keyGenerator` que mezcle IP + un hash del user agent, y/o deny explícito de peticiones con XFF en entornos donde el proxy es el único front.

### LOW-2 — Ausencia de `Cache-Control: no-store` en respuestas autenticadas
- **Ubicación**: `apps/api/src/main.ts` (no hay middleware de cache headers)
- **Descripción**: Respuestas JSON con datos de clientes/tasks/usuarios no llevan `Cache-Control: no-store`. Un proxy intermedio (CDN, proxy corporativo, caché compartida) podría cachear y servir datos de un usuario a otro.
- **Fix**: Middleware global que añada `Cache-Control: no-store` (y `Pragma: no-cache`) a las rutas `/api/`, o como mínimo a las rutas autenticadas. Coste nulo.

### LOW-3 — `js-yaml` 5.2.1 vulnerable vía `@nestjs/swagger` (no ejecutado en runtime)
- **Ubicación**: `apps/api/package.json` (`@nestjs/swagger@11.4.6`) → `pnpm audit` GHSA-pm4m-ph32-ghv5
- **Descripción**: DoS por parsing exponencial de YAML en flow collections. `SwaggerModule` no se usa en `main.ts` (grep: cero usos de SwaggerModule/openapi en src); `@nestjs/swagger` solo aporta decoradores metadata. El path `js-yaml` no se ejecuta en el runtime actual.
- **Fix**: (1) `pnpm add -D` no aplica (es dep directa): actualizar `@nestjs/swagger` cuando publique versión con `js-yaml >= 5.2.2`, o añadir `pnpm.overrides` para `js-yaml@^5.2.2`. (2) Opcional: eliminar la dependencia si no se usa (revisar decoradores `@Api*` en el código — si no existen, se puede retirar entera).

### LOW-4 — Fallback Bearer header amplía superficie post-XSS
- **Ubicación**: `apps/api/src/modules/auth/strategies/jwt.strategy.ts:25-29`
- **Descripción**: El JWT se acepta también como `Authorization: Bearer`. Con un XSS en el origen, el token en memoria del frontend es exfiltrable de todos modos (la cookie HttpOnly no lo frena), pero el fallback Bearer además permite tokens robados de clientes API de 8h sin cookie. Es un trade-off documentado (ADR-001).
- **Fix**: Documentar el riesgo en el ADR; opcionalmente restringir el extractor Bearer a rutas no-browser (p. ej. exigir header de API-key en peticiones con Bearer) o eliminar el fallback si no hay clientes API reales.

### LOW-5 — Logout no revoca el JWT server-side
- **Ubicación**: `apps/api/src/modules/auth/auth.service.ts:92-108`
- **Descripción**: `logout` borra la cookie y rota el CSRF, pero el JWT sigue siendo válido hasta 8h si fue exfiltrado (mientras el usuario permanezca ACTIVE). El DB-check por request reduce la ventana (basta deactivar el usuario), pero no hay revocación proactiva.
- **Fix**: Aceptable para el contexto; opción futura: versión de sesión en DB (revocación inmediata) o TTL más corto. Registrarlo como decisión conocida en el ADR si no se aborda.

### LOW-6 — Secrets de E2E versionados en `playwright.config.ts`
- **Ubicación**: `apps/web/playwright.config.ts:31-32` (`JWT_SECRET`/`CSRF_SECRET` de e2e)
- **Descripción**: Secrets de test versionados (necesarios para que el harness E2E firme tokens). Solo afectan a entornos de test.
- **Fix**: Aceptable; mantenerlos inequívocamente test-only (prefijo `briefline-e2e-`) y nunca reutilizarlos como secrets reales. Verificar que el CI no los inyecte en el build de prod.

---

## 💥 Modos de fallo considerados y descartados

- **Login CSRF / login CSRF attack**: bloqueado — POST /auth/login exige token CSRF válido (middleware global) y SameSite=Lax.
- **Enumeración de usuarios por login**: mitigado — error genérico INVALID_CREDENTIALS en email desconocido, password errónea e inactivo; sin respuesta diferencial (AP-07). El endpoint `/users` es admin-only. Queda un vector menor: `PATCH /users/:id` admin devuelve 404 vs 400 según formato, y `create-user` devuelve 409 EMAIL_ALREADY_EXISTS (solo para admins — no explotable).
- **Token CSRF pre-login reutilizable**: ligado a identifier 'anonymous'; al loguear se rota y queda ligado al valor del JWT — el token anónimo deja de servir (testeado en csrf.spec.ts).
- **Task archivar como member**: bloqueado por policy + @Roles en el endpoint.
- **Deactivación del último admin**: bloqueada (transacción SERIALIZABLE + retry, USR-005).
- **Inyección vía `q`/filtros**: parametrizado por Prisma; `limit` capado a 100.
- **Errores Prisma / UUIDs malformados**: ParseUUIDPipe con 400 INVALID_FORMAT en todos los `:id`; nunca 500 por cast.

---

## 🧪 Cobertura de tests de seguridad (estado actual)

Existe y pasa (120 integración + 5 E2E Playwright):
- `csrf.spec.ts` — 403 sin token, rotación en login, re-binding en logout.
- `tasks.spec.ts` / `clients.spec.ts` / `users.spec.ts` — 403/404 BOLA (archived, foreign tasks, LAST_ADMIN, roles).
- `auth/login.spec.ts` — credenciales inválidas, enumeración, throttling.
- `db-integrity.spec.ts` — invariantes DB (CHECKs, FKs).
- E2E `forbidden-mutation.spec.ts` — member muta task ajena → 403 y versión intacta contra API real.

**Gaps recomendados** (prioridad):
1. Test de throttling de login a nivel integración (6 intentos → 429 con `Retry-After` y 300s) — verificar si ya existe en login.spec; si no, añadirlo.
2. Test que un member con `?status=ARCHIVED` en /clients recibe lista vacía y 200 (no 403, no datos).
3. Test de redacción del logger (log un objeto con `password`/`token` → `[REDACTED]` en salida) — no existe actualmente.
4. Test de `Cache-Control: no-store` si se implementa LOW-2.
5. Test de mass assignment ya cubierto por UNKNOWN_PROPERTY en varios specs — mantener como guard.

## 🏆 Acciones prioritarias

1. **[MEDIUM-1]** Decidir y fijar el modelo de credenciales demo: alinear `Login.tsx` con el seed versionado o gatearlas por entorno; confirmar que el despliegue público no crea cuentas con `Briefline2026!`.
2. **[MEDIUM-2]** Gate del seed (`NODE_ENV !== 'production'` + URL demo conocida) para que jamás pueda sembrar cuentas admin con password pública en un entorno real.
3. **[LOW-1]** Verificar que la API solo es alcanzable tras el proxy de Render (normalización de X-Forwarded-For) — sin esto, el rate limiting es eludible.
4. **[LOW-3]** Actualizar `@nestjs/swagger` o añadir override de `js-yaml@>=5.2.2`; eliminar la dependencia si es decoradores-only.
5. **[LOW-2]** Añadir `Cache-Control: no-store` global en rutas `/api`.

## Archivos clave revisados

- Auth/CSRF: `apps/api/src/modules/auth/{auth.controller,auth.service,auth.constants,jwt.strategy}.ts`, `apps/api/src/common/csrf/{csrf.middleware,csrf.init,csrf.module}.ts`, `apps/api/src/common/middleware/origin-validation.middleware.ts`
- Autorización: `apps/api/src/modules/tasks/{tasks.policy,tasks.service,tasks.controller}.ts`, `apps/api/src/modules/clients/{clients.service,clients.controller}.ts`, `apps/api/src/modules/users/{users.service,users.controller}.ts`, `apps/api/src/modules/profile/{profile.service,profile.controller}.ts`, `apps/api/src/modules/dashboard/{dashboard.service,dashboard.controller}.ts`
- DTOs: `apps/api/src/modules/{tasks,clients,users,profile}/dto/*.ts`
- Infra: `apps/api/src/{main.ts,app.module.ts}`, `apps/api/src/config/configuration.ts`, `apps/api/src/common/{pipes/app-validation.pipe.ts,filters/problem-details.filter.ts,logger/custom.logger.ts}`, `apps/api/src/database/prisma.service.ts`
- Frontend: `apps/web/src/{api/client.ts,lib/auth-session.ts,pages/Login.tsx}`
- Seed/deploy: `apps/api/prisma/seed.ts`, `docker/compose.yml`, `apps/web/playwright.config.ts`
- Tests: `apps/api/test/integration/{csrf.spec.ts,auth/login.spec.ts,tasks/tasks.spec.ts,clients/clients.spec.ts,users/users.spec.ts,db-integrity.spec.ts}`, `apps/web/test/e2e/forbidden-mutation.spec.ts`
