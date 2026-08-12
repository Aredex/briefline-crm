# Plan — `/api/docs`: servir el OpenAPI existente con Swagger UI

**Slug:** `api-docs-link`
**Fecha:** 2026-08-13
**Estado:** propuesto (no implementado)
**verify_cmd:** `pnpm typecheck && pnpm test && pnpm test:e2e` (lint NO es gate: deuda preexistente)

---

## Resumen ejecutivo

`SwaggerModule.setup()` acepta un `OpenAPIObject` ya construido — no exige decoradores ni
`createDocument()`. Por tanto la solución es: parsear `packages/api-contract/openapi.yaml` en
bootstrap y pasárselo a `SwaggerModule.setup('docs', app, doc, { useGlobalPrefix: true })`.
Cero decoradores en los 11 controllers, cero librerías de UI nuevas (`swagger-ui-dist@5.32.8`
ya está instalado como dependencia de `@nestjs/swagger@11.4.6`), y — verificado sobre el código
de ambos paquetes — **cero cambios en la CSP de helmet**.

Coste real: una dependencia (`js-yaml`), un subpath en los `exports` de `api-contract`, ~35
líneas en `apps/api`, dos tests y una exención acotada del `Cache-Control: no-store`.

---

## 1. Hallazgos de la investigación (verificados sobre el código instalado, no de memoria)

### 1.1 La CSP por defecto de helmet YA es compatible con Swagger UI

`helmet@8.3.0` (`node_modules/.pnpm/helmet@8.3.0/.../index.cjs`, `getDefaultDirectives`):

```
default-src 'self'; base-uri 'self'; font-src 'self' https: data:; form-action 'self';
frame-ancestors 'self'; img-src 'self' data:; object-src 'none'; script-src 'self';
script-src-attr 'none'; style-src 'self' https: 'unsafe-inline'; upgrade-insecure-requests
```

Contrastado con la plantilla real que emite `@nestjs/swagger@11.4.6`
(`dist/swagger-ui/constants.js` + `swagger-ui.js`):

| Recurso del HTML de Swagger UI | Directiva que aplica | ¿Pasa? |
|---|---|---|
| `<script src="./docs/swagger-ui-bundle.js">` | `script-src 'self'` | Sí — fichero same-origin |
| `<script src="./docs/swagger-ui-standalone-preset.js">` | `script-src 'self'` | Sí |
| `<script src="./docs/swagger-ui-init.js">` | `script-src 'self'` | Sí — es una **ruta servida**, no un `<script>` inline |
| Dos bloques `<style>` inline en la plantilla | `style-src ... 'unsafe-inline'` | Sí — helmet ya permite inline styles |
| `swagger-ui.css`, `favicon-16/32x32.png` | `style-src`/`img-src 'self'` | Sí |
| Logo del topbar (data URI de webpack) | `img-src ... data:` | Sí |
| `<svg>` de símbolos inline | no aplica CSP | Sí |

**La premisa del encargo ("Swagger UI suele necesitar scripts inline") no se cumple aquí.**
`toInlineScriptTag` sólo se usa para `customJsStr`, opción que no vamos a pasar. El documento
va embebido dentro de `swagger-ui-init.js` (fichero servido), así que tampoco hay `fetch` del
spec ni necesidad de tocar `connect-src`.

**`unsafe-eval` tampoco hace falta.** Grep sobre `swagger-ui-dist@5.32.8`: `eval(` = 0
ocurrencias; `new Function(` = 1 por bundle, y es el detector de globalThis de webpack, ya
cortocircuitado y envuelto en try/catch:

```js
__webpack_require__.g = function(){ if("object"==typeof globalThis) return globalThis;
  try{ return this || new Function("return this")() } catch(s){ if("object"==typeof window) return window } }()
```

En cualquier navegador moderno el `return globalThis` gana y la línea nunca se ejecuta.

> Esto sigue siendo una **predicción basada en lectura de código**, no una observación. La fase
> de verificación (§5) incluye un test Playwright que escucha `securitypolicyviolation` en el
> navegador real. Si apareciera alguna violación, el fallback está en §7 (Riesgos).

### 1.2 No hay riesgo de path-to-regexp v8 / Express 5

El repo ya se estrelló con esto (ver el comentario largo de `ServeStaticModule` en
`apps/api/src/app.module.ts`). Auditado `dist/swagger-module.js`: **`SwaggerModule` no registra
ningún patrón wildcard**. Las rutas son literales:

- `GET {finalPath}` y `GET {finalPath}/` y `GET {finalPath}/index.html` → HTML
- `GET {finalPath}/swagger-ui-init.js` (y la variante `/docs/swagger-ui-init.js`)
- `GET {finalPath}/LICENSE` → 404
- `GET {finalPath}-json` y `GET {finalPath}-yaml` (`raw` por defecto es `true`)
- estáticos vía `app.useStaticAssets(swaggerAssetsPath, { prefix: finalPath })`

### 1.3 Orden de registro: no colisiona con nada

`SwaggerModule.setup()` registra directamente sobre el `httpAdapter` (Express), y se llama en
`main.ts` **antes** de `app.listen()`, es decir antes de `app.init()`. Express resuelve por
orden de registro, así que la cadena queda:

```
helmet -> cache-control -> [swagger: /api/docs*] -> [Nest: OriginValidation -> CSRF -> controllers /api/v1/*] -> ServeStatic (prod)
```

- No hay controller en `/api/docs` (todos viven bajo `/api/v1/*` por `enableVersioning`), así
  que no se pisa nada.
- `OriginValidationMiddleware` y `CsrfMiddleware` (`forRoutes('*')`, registrados en `init`)
  quedan **detrás**: nunca ven las peticiones de docs. Correcto — son rutas públicas de sólo
  lectura.
- `ServeStaticModule` (`exclude: ['/api/{*any}']`, registrado en `onModuleInit`) queda aún más
  atrás. Sin interferencia.

### 1.4 El proxy de Vite YA cubre la ruta

`apps/web/vite.config.ts` → `proxy: { '/api': { target: 'http://127.0.0.1:3000' } }`. El
prefijo `/api` cubre `/api/docs`, `/api/docs-json`, `/api/docs/swagger-ui-bundle.js`, etc.
**No hay que tocar `vite.config.ts`.** (Nota: `vite preview` no tiene proxy — irrelevante, no
es un modo soportado del proyecto.)

### 1.5 Puntos que sí requieren decisión

1. **Parseo de YAML.** `js-yaml@4.3.1` existe en el store pero sólo como transitiva
   (`@redocly/openapi-core`, `@nestjs/swagger`). Bajo pnpm estricto **no es importable** desde
   `apps/api`. Hay que declararla.
2. **Resolución de la ruta del fichero** en dev y en prod (`apps/api/dist/main.js`).
3. **`Cache-Control: no-store`** del middleware actual se aplicaría también al bundle de
   Swagger UI (~1,5 MB re-descargados en cada visita).
4. **"Try it out"**: auth por cookie HttpOnly + CSRF double-submit. Sin configurar, todo daría
   401/403 en la cara del reclutador que visita el portafolio.
5. **Validator badge**: Swagger UI por defecto contacta `validator.swagger.io`. Es fuga de
   información y violación de `img-src 'self' data:`.

---

## 2. Decisiones de arquitectura

| # | Decisión | Alternativas descartadas |
|---|---|---|
| D1 | Servir el `openapi.yaml` existente con `SwaggerModule.setup(path, app, documentObject)` | **Decorar los 11 controllers** con `@ApiTags`/`@ApiProperty`: duplica la fuente de verdad, contradice `packages/api-contract/src/index.ts` ("openapi.yaml is the single source of truth") y arriesga divergencia contrato↔runtime. **Scalar/Redoc**: dependencia nueva; Redoc CDN rompe `script-src 'self'`; Scalar self-hosted añade peso sin ventaja sobre un `swagger-ui-dist` ya instalado y ya pagado. |
| D2 | **No tocar la CSP de helmet.** Ni `contentSecurityPolicy` custom, ni middleware por ruta, ni nonces | Relajar `script-src` con `'unsafe-inline'` sólo en `/api/docs`: innecesario (§1.1) y debilitaría la postura de seguridad que el propio caso de estudio presume en la landing. |
| D3 | `js-yaml@^4.1.2` como dependencia directa de `apps/api` (+ `@types/js-yaml`) | `yaml@2`: igual de válido, pero `js-yaml` ya está en el árbol y el root `pnpm.overrides` ya fija `js-yaml: ">=4.1.2"` — misma versión física, cero dedupe nuevo. Pre-convertir a `openapi.json` en build: añade un artefacto generado más que mantener sincronizado. |
| D4 | Resolver el fichero con `require.resolve('@briefline/api-contract/openapi.yaml')`, previa adición del subpath a `exports` | `resolve(__dirname, '../../../packages/api-contract/openapi.yaml')`: funciona hoy (el patrón ya se usa para `web/dist` en `app.module.ts`) pero se rompe silenciosamente si cambia la profundidad de `outDir`. El symlink de workspace `apps/api/node_modules/@briefline/api-contract` existe siempre que la dependencia esté declarada — y lo está. |
| D5 | **Fail-fast** en bootstrap si el YAML falta o no es OpenAPI 3.x | Degradar a "no montar docs y loguear": reproduce exactamente el bug que estamos arreglando (404 silencioso en producción). Coherente con el fail-fast de Joi en `ConfigModule`. |
| D6 | Eximir `/api/docs` del `Cache-Control: no-store` | Dejar `no-store`: 1,5 MB en cada carga. La exención es segura: son assets públicos estáticos sin dato de usuario. |
| D7 | `supportedSubmitMethods: ['get']` + `withCredentials: true` | `[]` (referencia pura): pierde el gancho interactivo. Todos los métodos: los `POST/PATCH/DELETE` fallarían 403 por CSRF y parecería una API rota. Con GET + cookies, un visitante logueado en la demo ejecuta lecturas reales. |
| D8 | `validatorUrl: null` | Dejar el default: envía el spec a un tercero y pinta un badge bloqueado por CSP. |

---

## 3. Ficheros a tocar

| # | Fichero | Acción |
|---|---|---|
| 1 | `packages/api-contract/package.json` | Añadir subpath `"./openapi.yaml": "./openapi.yaml"` a `exports` |
| 2 | `apps/api/package.json` | `dependencies`: `"js-yaml": "^4.1.2"` · `devDependencies`: `"@types/js-yaml": "^4.0.9"` |
| 3 | `apps/api/src/docs/openapi-document.ts` | **Nuevo.** Loader + validación mínima del documento |
| 4 | `apps/api/src/docs/api-docs.setup.ts` | **Nuevo.** `setupApiDocs(app)` — encapsula el `SwaggerModule.setup` y sus opciones |
| 5 | `apps/api/src/main.ts` | Llamar `setupApiDocs(app)` tras `enableVersioning` · eximir `/api/docs` del `no-store` · actualizar el comentario de cabecera del stack |
| 6 | `apps/api/test/unit/openapi-document.spec.ts` | **Nuevo.** Test del loader (rápido, sin Docker) |
| 7 | `apps/web/test/e2e/api-docs.spec.ts` | **Nuevo.** Playwright: render real, CSP, sin axe |
| 8 | `apps/web/src/components/landing/LandingLayout.tsx:134` | `target="_blank" rel="noreferrer"` |
| 9 | `apps/web/src/components/layout/AppShell.tsx:47` | `target="_blank" rel="noreferrer"` |
| 10 | `docs/05-landing-footer-spec.es.md`, `docs/README.md` | Marcar `/api/docs` como implementado; documentar `/api/docs-json` y `/api/docs-yaml` |

**No se tocan:** `apps/web/vite.config.ts` (§1.4), `apps/api/src/app.module.ts`, ningún
controller, ninguna configuración de helmet.

---

## 4. Fases de ejecución

Ejecución **secuencial**. Máximo 2 agentes vivos, nunca en paralelo sobre estos ficheros
(F1 y F2 comparten `main.ts`/tests). Commit al cerrar cada fase.

### F1 — Backend: montar `/api/docs` (agente: `backend-developer`)

**Ficheros:** 1, 2, 3, 4, 5, 6.

**T1.1 — Subpath de exports** (`packages/api-contract/package.json`)

```json
"exports": {
  ".": "./src/generated/api-types.ts",
  "./openapi.yaml": "./openapi.yaml"
}
```

**T1.2 — Dependencias.** `pnpm --filter @briefline/api add js-yaml@^4.1.2` y
`pnpm --filter @briefline/api add -D @types/js-yaml@^4.0.9`. Comprobar que el lockfile sigue
resolviendo `js-yaml` a una sola versión (el override root lo garantiza).

**T1.3 — `apps/api/src/docs/openapi-document.ts`**

- `require.resolve('@briefline/api-contract/openapi.yaml')` → `readFileSync(path, 'utf8')` →
  `load()` de `js-yaml`.
- Validación mínima antes de castear a `OpenAPIObject`: es objeto no nulo, `openapi` es string
  que empieza por `'3.'`, `info` presente, `paths` es objeto con ≥1 clave. Si falla, lanzar un
  `Error` con el path resuelto en el mensaje (D5).
- Exportar `loadOpenApiDocument(): OpenAPIObject`. Memoizar en módulo (se lee una vez).
- Ojo `noUncheckedIndexedAccess` + `strict`: `load()` devuelve `unknown`; nada de `as any`
  suelto — estrechar con type guards y castear una sola vez al final.
- Comentario de cabecera al estilo del repo, explicando **por qué** se carga el YAML en vez de
  generar el documento por decoradores (enlazar a ADR-005 / `api-contract/src/index.ts`).

**T1.4 — `apps/api/src/docs/api-docs.setup.ts`**

```ts
SwaggerModule.setup('docs', app, loadOpenApiDocument(), {
  useGlobalPrefix: true,        // globalPrefix 'api' -> /api/docs (la versión NO se aplica)
  customSiteTitle: 'Briefline CRM API — OpenAPI 3.1',
  swaggerOptions: {
    validatorUrl: null,         // D8: no enviar el spec a validator.swagger.io
    withCredentials: true,      // D7: la cookie HttpOnly viaja en las pruebas GET
    supportedSubmitMethods: ['get'],
    docExpansion: 'list',
    persistAuthorization: false,
  },
})
```

- **No** pasar `customJsStr` ni `customCss` no vacío innecesariamente: `customJsStr` es la única
  vía por la que la plantilla emitiría un `<script>` inline y rompería la CSP (§1.1).
- Dejar `raw` en su default (`true`): expone `/api/docs-json` y `/api/docs-yaml` gratis, útiles
  para el portafolio.
- La función recibe `NestExpressApplication` y no devuelve nada.

**T1.5 — `apps/api/src/main.ts`**

- Insertar `setupApiDocs(app)` inmediatamente **después** de `app.enableVersioning(...)` y antes
  de `useGlobalPipes`. Debe ir después de `setGlobalPrefix` (lo lee `useGlobalPrefix`) y antes
  de `listen()`.
- Exención de cache (D6):

```ts
app.use((req: Request, res: Response, next: NextFunction) => {
  // /api/docs* es contenido público estático (Swagger UI, ~1.5MB de bundle):
  // no-store obligaría a re-descargarlo en cada visita y no protege ningún dato.
  if (req.path.startsWith('/api') && !req.path.startsWith('/api/docs')) {
    res.setHeader('Cache-Control', 'no-store')
  }
  next()
})
```

  Cuidado: `startsWith('/api/docs')` también cubre `/api/docs-json` y `/api/docs-yaml`, que es
  lo deseado.
- Actualizar el comentario de cabecera del "Stack order (R-5)" para incluir la capa swagger.

**T1.6 — `apps/api/test/unit/openapi-document.spec.ts`** (corre en `pnpm test`, sin Docker;
`vitest.config.ts` ya tiene `maxWorkers: 2`)

- `loadOpenApiDocument()` no lanza.
- `openapi` empieza por `'3.1'`; `info.title === 'Briefline CRM API'`.
- `Object.keys(paths).length > 0`.
- `servers[0].url === '/api/v1'` — este es el que hace que "Try it out" apunte al sitio
  correcto tanto tras el proxy de Vite como en producción same-origin.

**Gate F1:** `pnpm typecheck && pnpm --filter @briefline/api test`.

### F2 — Frontend + e2e (agente: `frontend-designer`)

**Ficheros:** 7, 8, 9.

**T2.1 — Enlaces.** Añadir `target="_blank" rel="noreferrer"` en ambos sitios. En `AppShell`
es funcionalmente relevante: sin ello, pulsar "API docs" hace una navegación completa y tira al
usuario fuera de la SPA autenticada. Mantener el `href` relativo `/api/docs` (funciona en dev
por el proxy y en prod por Nest). Revisar si `landing.spec.ts` o `test/a11y.test.tsx` asertan
sobre ese `<a>` y ajustar.

**T2.2 — `apps/web/test/e2e/api-docs.spec.ts`.** El `webServer` de Playwright ya levanta la API
real en `:3000` (`NODE_ENV=development`) y Vite en `:5173`; no requiere seed ni login, así que
el spec es orden-independiente como `landing.spec.ts`.

Aserciones:
1. `page.goto('/api/docs')` → `response.status() === 200`, content-type `text/html`.
2. **Cero violaciones de CSP**: registrar `page.on('console')` filtrando `Content Security
   Policy`, y `page.addInitScript` con un listener de `securitypolicyviolation` que acumule en
   `window`. Aserción: array vacío. *Este es el test que convierte la predicción de §1.1 en
   hecho observado.*
3. Swagger UI renderiza de verdad: `await expect(page.locator('#swagger-ui .info .title')).toContainText('Briefline CRM API')` y `expect(await page.locator('.opblock').count()).toBeGreaterThan(10)` — prueba que se parsearon los paths, no sólo que cargó el shell.
4. Cero `pageerror` (atrapa un fallo de `new Function` si la lectura de §1.1 fuera errónea).
5. `GET /api/docs-json` → 200, JSON parseable, `openapi` empieza por `'3.1'`.
6. **Regresión de seguridad:** `GET /api/v1/health` sigue devolviendo `cache-control: no-store`
   (que la exención D6 no se haya comido de más).

**No añadir esta página a la suite de axe.** Swagger UI tiene violaciones de accesibilidad
conocidas y de terceros; meterla en el barrido pondría la suite en rojo por código que no
mantenemos. Dejarlo escrito en el comentario de cabecera del spec para que nadie lo "arregle"
añadiéndola después.

**Gate F2:** `taskpolicy -c utility pnpm --filter @briefline/web test:e2e -- api-docs`.

### F3 — Documentación (agente: ninguno, directo)

Ficheros 10. `docs/05-landing-footer-spec.es.md:84` y `docs/README.md:79` ya prometen la ruta:
confirmarlas como implementadas y añadir `/api/docs-json` / `/api/docs-yaml`. Revisar si
`README.md` (ya modificado en el working tree) debe mencionarlo.

### F4 — QA y verificación completa (agente: `qa-risk-analyzer`, ámbito acotado)

Sólo si F1–F3 pasan. Alcance: `git diff HEAD` — foco en la exención de cache-control, el orden
de middlewares y que ninguna ruta `/api/v1/*` haya cambiado de comportamiento. No es un cambio
de auth ni de datos, así que el agente va con ámbito reducido, no auditoría completa.

---

## 5. Verificación

### Local, dev

```bash
cd /Users/ac/develop_projects/portfolio/briefline-crm
pnpm dev
# navegador -> http://localhost:5173/api/docs   (a través del proxy de Vite)
# navegador -> http://127.0.0.1:3000/api/docs   (directo contra Nest)
```

Comprobar **con la consola del navegador abierta**: 0 errores CSP, 0 errores JS, la lista de
endpoints se despliega, y "Try it out" en un GET devuelve 401 si no hay sesión / 200 si la hay.

```bash
curl -si http://127.0.0.1:3000/api/docs | head -20                 # 200 + text/html
curl -s  http://127.0.0.1:3000/api/docs-json | head -c 200         # JSON 3.1.0
curl -si http://127.0.0.1:3000/api/v1/health | grep -i cache       # sigue no-store
curl -si http://127.0.0.1:3000/api/docs | grep -i cache            # SIN no-store
curl -si http://127.0.0.1:3000/api/docs/swagger-ui-bundle.js | head -5   # 200 + JS
```

### Producción (simulada en local)

```bash
taskpolicy -c utility pnpm --filter @briefline/web build
taskpolicy -c utility pnpm --filter @briefline/api build
NODE_ENV=production ... node apps/api/dist/main.js
```

Aquí se valida lo que dev **no** valida: que `require.resolve` encuentre el YAML desde
`apps/api/dist/`, y que la capa `ServeStaticModule` no se coma `/api/docs`.

### verify_cmd

```bash
taskpolicy -c utility pnpm typecheck
taskpolicy -c utility pnpm test
taskpolicy -c utility pnpm test:e2e     # api (Testcontainers) + web (Playwright)
```

`vitest.e2e.config.ts` de la API usa `fileParallelism: false` y `pool: 'forks'`; Playwright usa
`workers: 1`. Ambos ya respetan el límite de 2 núcleos sin cambios.

---

## 6. Criterios de aceptación

- [ ] `GET /api/docs` devuelve 200 con Swagger UI funcional en dev (vía Vite) y en build de producción.
- [ ] Cero violaciones de CSP y cero `pageerror`, verificado por Playwright en navegador real.
- [ ] `apps/api/src/main.ts` **no** contiene ninguna configuración custom de `helmet`.
- [ ] Ningún controller adquiere decoradores de `@nestjs/swagger`; `openapi.yaml` sigue siendo la única fuente de verdad.
- [ ] `/api/v1/*` conserva `Cache-Control: no-store` (test de regresión).
- [ ] Swagger UI no hace ninguna petición a un host externo (`validatorUrl: null`), comprobable en la pestaña Network.
- [ ] La ruta no queda cubierta por la suite de axe.
- [ ] `pnpm typecheck && pnpm test && pnpm test:e2e` en verde.

---

## 7. Riesgos y contingencias

| Riesgo | Prob. | Mitigación / plan B |
|---|---|---|
| **La predicción de CSP de §1.1 falla en navegador real** | Baja — es lectura directa de la plantilla y de los bundles, no memoria | El test de F2 lo detecta antes del commit. Plan B por orden de preferencia: (1) `customCssUrl` en vez de `customCss` si el problema fuera un estilo; (2) un middleware que **sólo** en `/api/docs*` reemplace la directiva concreta que falle, dejando el resto de la CSP global intacta — nunca `contentSecurityPolicy: false` global. |
| `require.resolve` del subpath falla en el build de Render | Baja | `render-build` hace `pnpm install --frozen-lockfile` en la raíz: el symlink de workspace existe. Se valida en la prueba de producción local (§5) antes de desplegar. Fallback: `resolve(__dirname, '../../../packages/api-contract/openapi.yaml')`. |
| Fail-fast (D5) tumba el arranque en producción si falta el YAML | Muy baja | Se descubre en el build local de §5, que es paso obligatorio antes del deploy. Preferible a un 404 silencioso — es el bug original. |
| `useGlobalPrefix` interactúa mal con `enableVersioning` | Baja | Leído `swagger-module.js`: `finalPath` se compone sólo de `globalPrefix + path`, la versión URI no interviene. Cubierto por el test 1 de F2. |
| `GET /api/docs/LICENSE` lanza `NotFoundException` fuera del pipeline de Nest → 500 HTML de Express en vez de RFC 9457 | Muy baja | Cosmético, ruta que nadie visita. Se documenta, no se arregla. |
| El bundle de 1,5 MB penaliza Lighthouse de la landing | Nula | `/api/docs` es otra página y ahora abre en pestaña nueva; no entra en las métricas de `/`. |

---

## 8. Preguntas abiertas

1. **D7 — `supportedSubmitMethods: ['get']`**: ¿es el equilibrio que quieres, o prefieres
   referencia pura (`[]`) para que nada pueda dar 401/403 delante de un reclutador?
2. **Enlace de vuelta**: ¿añadir un `customSiteTitle` con link de retorno a la landing? No es
   trivial sin `customJsStr` (que es justo lo que rompería la CSP). Se puede con `customCss`
   sobre el topbar. Fuera de alcance salvo que lo pidas.
3. `docs/plans/04-development-plan.es.md:215` menciona "artefacto OpenAPI JSON": con `raw: true`
   queda cubierto por `/api/docs-json`. ¿Se da por cerrado ese ítem del plan?
