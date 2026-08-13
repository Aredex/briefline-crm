# Plan — Fix de raíz del build de producción (Render): `dist/main.js` no existe

Fecha: 2026-08-13
Slug: `render-build-path-fix`
Estado: propuesta (NO implementado)

---

## 1. Diagnóstico confirmado

### 1.1 Lo que dice el log

```
Error: Cannot find module '/opt/render/project/src/apps/api/dist/main.js'
code: 'MODULE_NOT_FOUND'
```

El proceso murió en `node dist/main.js` (segunda mitad de `start:deploy`). Esto también
demuestra que **`prisma migrate deploy` sí se ejecutó y salió con 0**: el `&&` no habría
llegado a `node` si no. Por tanto las devDependencies (`prisma`, `@nestjs/cli`) **sí** se
instalan en Render pese a `NODE_ENV=production` — no hay un problema de `--prod` de pnpm que
investigar. Descartado.

### 1.2 Causa raíz A — hoist de `rootDir`

Configuración real verificada:

- `apps/api/nest-cli.json`: `sourceRoot: "src"`, `compilerOptions.deleteOutDir: true`. No hay
  `entryFile`, así que Nest asume el default `main` → `dist/main.js`.
- `apps/api/tsconfig.build.json`: extiende `tsconfig.json`, solo pone `noEmit:false` y
  `sourceMap:true`. **No declara `rootDir`.**
- `apps/api/tsconfig.json`: `outDir: "./dist"`, `include: ["src","test"]`, module `NodeNext`
  (heredado de `tsconfig.base.json`).

Sin `rootDir` explícito, `tsc` calcula el *common source directory* de **todos** los ficheros
del programa, incluidos los `.ts` alcanzados por import. Y el API importa el cliente Prisma
generado por ruta relativa cruzando fuera del paquete:

```
apps/api/src/database/prisma.service.ts:4
import { PrismaClient } from '../../../../packages/api-contract/src/generated/prisma/client'
```

Hay **50 ocurrencias en 49 ficheros** (`apps/api/src`, `apps/api/test`, `apps/api/prisma`).
El ancestro común pasa a ser la raíz del repo, así que el emit queda:

```
apps/api/dist/apps/api/src/main.js        <- entrypoint real
apps/api/dist/packages/api-contract/src/generated/prisma/*.js
```

mientras `start`, `start:prod` y `start:deploy` apuntan a `dist/main` / `dist/main.js`.
Verificado contra el `dist/` actual en local: existen `dist/apps` y `dist/packages`, y
`dist/apps/api/src/main.js`.

Esto **no es "frágil según la profundidad de los imports"**, es binario: mientras exista al
menos un import a `.ts` fuera de `apps/api/src`, la raíz es el repo; si desaparecen todos,
colapsa a `dist/main.js`. Un cambio de import puede mover el entrypoint en silencio.

### 1.3 Causa raíz B — el cliente generado es ESM dentro de un build CJS

`packages/api-contract/src/generated/prisma/client.ts:16`:

```ts
globalThis['__dirname'] = path.dirname(fileURLToPath(import.meta.url))
```

Emitido a CJS, Node 24 detecta `import.meta` y reclasifica el fichero como ESM →
`exports is not defined in ES module scope`. Es la razón del `sed` en
`apps/web/test/e2e/start-api-for-e2e.sh`.

Por qué se genera ESM: `prisma-client` (Prisma 7) infiere `moduleFormat` desde
`tsconfig.compilerOptions.module`; con `NodeNext` la versión en uso (7.9.1) resuelve a `esm`.
Documentación de Prisma confirmada vía Context7 (`packages/client-generator-ts/src/module-format.ts`):
la opción **`moduleFormat = "cjs" | "esm"`** existe y su propósito declarado es exactamente
*"allows CommonJS projects to avoid import.meta.url issues"*. Hoy el bloque generator no la
declara:

```prisma
generator client {
  provider        = "prisma-client"
  output          = "../../../packages/api-contract/src/generated/prisma"
  previewFeatures = []
}
```

Versiones: `prisma` 7.9.1 (devDep) y `@prisma/client` 7.9.1 (dep) en `apps/api/package.json`;
`@prisma/adapter-pg` 7.9.1.

### 1.4 Causa raíz C — bug latente NO reportado todavía: el SPA estático apunta mal

`apps/api/src/app.module.ts:84`:

```ts
rootPath: resolve(__dirname, '../../web/dist'), // apps/api/dist -> <repo>/web/dist
```

El comentario asume `__dirname = apps/api/dist`, es decir, el layout `dist/main.js` que nunca
ocurre. Con el layout real (`dist/apps/api/src`) resuelve a
`apps/api/dist/apps/web/dist`, que no existe → `ServeStaticModule` en producción sirve nada y
todo lo que no sea `/api/*` cae al 404 de Nest.

Esto **no aparece en el log** porque el proceso muere antes, y solo se activa con
`NODE_ENV=production`. Si se arregla únicamente la ruta del entrypoint (opción 2 del encargo),
el deploy arranca verde, el health check pasa… y el fallback del SPA sigue roto en silencio.
Cualquier fix debe cubrir este tercer punto.

### 1.5 Daño colateral ya conocido

`pnpm dev` (`nest start --watch`) tampoco puede arrancar el API: usa el mismo default
`dist/main`. Está documentado en el comentario de `start-api-for-e2e.sh`.

---

## 2. Solución elegida

**Devolver el cliente Prisma generado al interior de `apps/api/src`, fijar `moduleFormat = "cjs"`
y blindar el layout con un `rootDir` explícito.**

Es decir: opción 4 del encargo como fix de raíz, opción 3 para el choque ESM/CJS, y opción 1
como *guardia* (que solo es aplicable después de la 4).

### 2.1 Por qué la opción 4 aquí es barata, no una reestructuración

El temor del encargo era romper `packages/api-contract`. Verificado que no aplica:

- `packages/api-contract/src/index.ts` exporta **solo** `./generated/api-types`. El cliente
  Prisma **no forma parte de la superficie pública del paquete**.
- El `exports` map del `package.json` expone `"."` → `api-types.ts` y `"./openapi.yaml"`.
  El directorio `generated/prisma` **no está exportado**.
- Búsqueda global de `generated/prisma`: **cero** consumidores fuera de `apps/api`
  (`src` 30, `test` 4, `prisma/seed.ts`, `prisma/reset.ts`). `apps/web` no lo toca; su alias de
  Vite es solo `@ → src`.
- El movimiento ya estaba pre-autorizado por el propio diseño:
  `.claude/plans/data-model.md:369` — *"If ARCH/BE move the client inside `apps/api`, that is a
  local path change only — but register it in the plan/ADR-005"*. Este plan es ese registro.

Con el cliente dentro de `apps/api/src`, **todas las suposiciones existentes vuelven a ser
verdad a la vez**, sin tocar ningún script de arranque:

| Suposición existente | Hoy | Tras el fix |
|---|---|---|
| `start` / `start:prod` → `dist/main` | rota | correcta |
| `start:deploy` → `dist/main.js` | rota | correcta |
| `nest start --watch` (`pnpm dev`) | rota | correcta |
| `resolve(__dirname,'../../web/dist')` | rota (silenciosa) | correcta |
| `sed` sobre el `client.js` emitido | necesario | innecesario |

### 2.2 Por qué se descartan las demás

**Opción 2 (apuntar los scripts a `dist/apps/api/src/main.js`).** Rechazada. Arregla el
síntoma del log y deja tres minas: el `rootPath` del SPA sigue mal (§1.4) y nadie se entera
hasta que un usuario pide `/` en producción; `pnpm dev` sigue sin arrancar; y el entrypoint
sigue siendo un valor *inferido* por `tsc`, no declarado — el día que se limpie el último
import cruzado, la ruta colapsa a `dist/main.js` y el deploy vuelve a romper. Coste de
implementación casi idéntico al fix de raíz.

**Opción 1 en solitario (`rootDir: "./src"` en `tsconfig.build.json`).** Imposible hoy: `tsc`
aborta con `TS6059: File ... is not under 'rootDir'` para los 18 ficheros de
`packages/api-contract/src/generated/prisma` mientras los imports crucen el límite del paquete.
`rootDir` no reubica ficheros, solo *afirma* la raíz y falla si alguien la viola. Por eso pasa
de solución a guardia: aplicada **después** de la 4, convierte cualquier futuro import fuera de
`apps/api/src` en un **error de compilación**, no en un cambio silencioso de layout.

**Opción 3 en solitario.** Necesaria pero insuficiente: solo cubre la mitad ESM. Se adopta
como parte del fix.

**Alternativa "de libro" (compilar `@briefline/api-contract` a `dist/` con `exports` map y
consumirlo como dependencia resuelta).** Rechazada por coste/beneficio. Obligaría a añadir un
paso de build y un orden de build al paquete compartido, que hoy sirve `.ts` crudo a Vite sin
fricción, y aun así dejaría el cliente Prisma alojado en un paquete que ningún otro consumidor
usa. Resuelve el mismo problema con más piezas móviles.

---

## 3. Cambios exactos

### F1 — Generador Prisma

**`apps/api/prisma/schema.prisma`**

```prisma
generator client {
  provider        = "prisma-client"
  output          = "../src/generated/prisma"
  moduleFormat    = "cjs"
  previewFeatures = []
}
```

Actualizar también el comentario de cabecera del fichero (hoy dice *"Generated client output
target: packages/api-contract/src/generated/prisma (DATA-001 spec)"*), porque ese texto se
serializa dentro del propio cliente generado (`internal/class.ts`, campo `inlineSchema`) y
quedaría mintiendo. Documentar la razón del `moduleFormat` y del cambio de destino.

Nota: aunque tras el movimiento el `package.json` más cercano al output pasa a ser
`apps/api/package.json` (sin `"type"`, lo que en versiones recientes ya inferiría `cjs`), la
opción se declara **explícita**: 7.9.1 emitió ESM con esta misma configuración y no se depende
de una inferencia.

Después: `pnpm --filter @briefline/api prisma:generate` y `git rm -r
packages/api-contract/src/generated/prisma` (18 ficheros versionados).

### F2 — Reescritura de los 50 imports

Codemod (script desechable en el scratchpad, no versionado) sobre los 49 ficheros. No usar un
`sed` con profundidad fija: hay tres familias de profundidad distintas. Calcular la ruta con
`path.relative(path.dirname(fichero), 'apps/api/src/generated/prisma')`. Resultado esperado:

| Origen | Antes | Después |
|---|---|---|
| `src/database/prisma.service.ts` | `../../../../packages/api-contract/src/generated/prisma/client` | `../generated/prisma/client` |
| `src/modules/*/x.ts` | `../../../../../packages/...` | `../../generated/prisma/client` |
| `src/modules/*/dto/x.ts` | `../../../../../../packages/...` | `../../../generated/prisma/client` |
| `test/integration/*.spec.ts` | `../../../../packages/...` | `../../src/generated/prisma/client` |
| `test/integration/*/x.ts` | `../../../../../packages/...` | `../../../src/generated/prisma/client` |
| `prisma/seed.ts`, `prisma/reset.ts` | `../../../packages/...` | `../src/generated/prisma/client` |

Regla mental de comprobación: para ficheros bajo `src/`, la nueva profundidad es `N-3`; para
`test/`, `N-2` más el prefijo `src/`.

No introducir un alias de `paths` de TypeScript como atajo: `tsc` no reescribe `paths` en el
emit y haría falta `tsc-alias` en el pipeline. Rutas relativas.

### F3 — Blindaje del layout

**`apps/api/tsconfig.build.json`** — añadir `"rootDir": "./src"` con un comentario que explique
que es la guardia contra el hoist. `exclude` ya saca `test/`, y `prisma/*.ts` nunca estuvo en
`include`, así que ningún fichero fuera de `src` entra al programa de build.

**`apps/api/package.json`** — los scripts `start`/`start:prod`/`start:deploy` **no cambian**.
Añadir una aserción de post-build que falle el build (no el deploy) si el entrypoint no aterriza
donde toca:

```json
"postbuild": "node -e \"require('node:fs').accessSync('dist/main.js')\""
```

Con `nest build` esto corre después del emit; `deleteOutDir: true` no interfiere. La aserción
es redundante con `rootDir` por diseño: `rootDir` cubre el hoist por import, `postbuild` cubre
cualquier otra vía (cambio de `entryFile`, de `outDir`, de builder).

### F4 — Limpieza de `packages/api-contract`

- `packages/api-contract/package.json`: eliminar la dependencia `@prisma/client` (7.9.1). Tras
  F1/F2 el paquete no contiene ni referencia nada de Prisma; su `include: ["src"]` pasa a cubrir
  solo `index.ts` + `generated/api-types.ts`.
- Verificar que `pnpm --filter @briefline/api-contract typecheck` sigue verde.
- `apps/api` ya declara `@prisma/client` y `@prisma/adapter-pg` como dependencias propias: no
  hay que añadir nada.

### F5 — Simplificar el arranque de e2e

**`apps/web/test/e2e/start-api-for-e2e.sh`**: eliminar el bloque `CLIENT_JS` + `sed` + `.bak`
completo y cambiar la última línea a `exec node apps/api/dist/main.js`. Reescribir el comentario
de cabecera: ya no describe un workaround, sino la secuencia normal (deploy → reset → build →
run). Mantener los pasos `prisma:deploy` / `prisma:reset` y la explicación de por qué es `reset`
y no `seed` — esa parte sigue siendo válida.

### F6 — Documentación

- `apps/api/prisma/README.md:18` (dice que el output apunta fuera de `apps/api`).
- `docs/07-api-architecture.md:400` (misma afirmación).
- `.gitignore`: la nota de las líneas 27-29 solo menciona `api-types.ts`; ampliarla para dejar
  claro que el cliente Prisma generado sigue versionado, ahora en `apps/api/src/generated/prisma`.
  Ningún patrón actual (`dist/`, `build/`) lo ignora — confirmado.
- Registrar la decisión en ADR-005, tal y como exigía `.claude/plans/data-model.md:369`.
- Opcional, bajo riesgo: añadir `apps/api/src/generated/**` a los ignores de ESLint. Los
  ficheros generados ya llevan `/* eslint-disable */` y `@ts-nocheck`, así que no es bloqueante
  (y lint no es gate del proyecto).

**No se toca**: `render.yaml`, `nest-cli.json`, `package.json` raíz (`render-build`),
`apps/api/src/app.module.ts`. El `rootPath` del SPA se arregla solo al volver `__dirname` a
`apps/api/dist`, que es justo lo que su comentario ya afirmaba.

---

## 4. Orden de ejecución

Máximo 2 agentes en paralelo; en la práctica esto es una cadena secuencial — F2 depende del
output de F1 y todo lo demás depende de F2. Un único ejecutor backend, commit al cerrar el
bloque F1-F5. Comandos pesados con `taskpolicy -c utility`.

1. F1 (schema + regenerar + `git rm` del directorio viejo).
2. F2 (codemod de los 50 imports).
3. Gate intermedio: `pnpm typecheck` — debe pasar antes de seguir.
4. F3 + F4.
5. F5.
6. Verificación §5 completa.
7. F6 (docs) — puede ir en el mismo commit o en uno de documentación aparte.

---

## 5. Verificación

### 5.1 Aserciones de artefacto (antes de cualquier test)

```bash
pnpm --filter @briefline/api prisma:generate
# 1) el cliente generado ya no lleva import.meta:
grep -rn "import.meta" apps/api/src/generated/prisma   # -> 0 resultados
# 2) el emit aterriza donde dicen los scripts:
pnpm --filter @briefline/api build
test -f apps/api/dist/main.js                          # -> existe
test ! -d apps/api/dist/packages                       # -> NO existe
test ! -d apps/api/dist/apps                           # -> NO existe
```

Si (1) falla, `moduleFormat = "cjs"` no tuvo el efecto esperado en 7.9.1 y hay que reevaluar
antes de continuar (fallback: `generatedFileExtension`/`importFileExtension`, o mantener el
parche pero solo en e2e). Si (2) falla, `rootDir` está mal puesto.

### 5.2 Smoke de producción en local — reproducir Render antes de tocar Render

Este es el paso que nunca se hizo y por eso §1.4 pasó desapercibido.

```bash
pnpm --filter @briefline/web build
pnpm --filter @briefline/api build
NODE_ENV=production PORT=3001 \
DATABASE_URL=... DIRECT_URL=... JWT_SECRET=... CSRF_SECRET=... \
CORS_ORIGINS=http://localhost:3001 \
node apps/api/dist/main.js
```

Comprobaciones contra el proceso vivo:

- `curl -sf http://localhost:3001/api/v1/health` → 200. Cubre §1.1 y §1.2 (si el cliente
  siguiera siendo ESM, el proceso ni arranca).
- `curl -s http://localhost:3001/ | grep -q '<div id="root"'` → **cubre §1.4**. Sirve el
  `index.html` del build de Vite, probando que `rootPath` resuelve. Sin esta comprobación el
  bug del SPA se va a producción otra vez.
- `curl -s -o /dev/null -w '%{http_code}' http://localhost:3001/login` → 200 (deep-link
  fallback del SPA).
- `curl -s -o /dev/null -w '%{http_code}' http://localhost:3001/api/v1/tasks` → 401, no 200 ni
  index.html (el `exclude: ['/api/{*any}']` sigue ganando sobre el estático).

Levantar con `NODE_ENV=production` es imprescindible: el bloque `ServeStaticModule` solo se
registra en ese modo.

### 5.3 `verify_cmd` del proyecto

```bash
taskpolicy -c utility pnpm typecheck && \
taskpolicy -c utility pnpm test && \
taskpolicy -c utility pnpm test:e2e
```

Binario, sin excepciones. `test:e2e` incluye la suite de `apps/web`, que arranca el API con el
script F5 — es la validación de que la simplificación del script no rompió nada. Lint no es
gate (deuda preexistente).

### 5.4 Regresión de dev

`pnpm --filter @briefline/api dev` debe arrancar y responder `/api/v1/health`. Hoy no arranca;
si tras el fix sigue sin arrancar, el `rootDir` no colapsó como se esperaba.

### 5.5 Determinismo de la regeneración

`pnpm --filter @briefline/api prisma:generate && git diff --exit-code apps/api/src/generated`
→ sin diff (invariante REP-006, el mismo que ya se exige a `api-types.ts`).

### 5.6 Render

Solo después de 5.1-5.5 en verde. Push a `main` (`autoDeploy: true`), seguir el log del deploy y
confirmar:

- `prisma migrate deploy` termina en 0 (ya lo hacía),
- el proceso arranca sin `MODULE_NOT_FOUND` ni `exports is not defined`,
- el health check de `/api/v1/health` pasa,
- `curl https://<servicio>.onrender.com/` devuelve el `index.html` del SPA (no un 404 de Nest),
- la app real en `briefline.alexcuesta.dev` (Cloudflare Pages, proxy `/api/*`) sigue
  autenticando: el flujo de login end-to-end contra el origen público.

---

## 6. Riesgos y puntos abiertos

| # | Riesgo | Mitigación |
|---|---|---|
| R1 | `moduleFormat = "cjs"` no elimina `import.meta` en 7.9.1 (la doc de Context7 viene de `main`, no de la tag exacta) | Aserción 5.1(1) corta la ejecución ahí mismo; el plan no avanza sobre una suposición. Fallback: `generatedFileExtension = "cts"` / `importFileExtension = "cjs"`, que la propia inferencia trata como señal de CJS |
| R2 | El codemod de 50 imports deja alguno mal (tres familias de profundidad distintas) | Se calcula con `path.relative`, no con `sed` de profundidad fija; `pnpm typecheck` como gate inmediato tras F2 |
| R3 | Ficheros generados dentro de `src/` entran en lint/coverage y ensucian métricas | Ya vienen con `eslint-disable` + `@ts-nocheck`; opcionalmente ignorarlos en ESLint (F6). No bloqueante |
| R4 | El cliente generado tuviera assets no-`.ts` que `tsc` no copia | Verificado: el directorio actual solo contiene `.ts` (Prisma 7 Rust-free, sin binarios de engine porque se usa driver adapter). Si apareciera alguno, `nest-cli.json` → `compilerOptions.assets` |
| R5 | Diverge el `inlineSchema` embebido en `internal/class.ts` respecto al comentario del schema | Se regenera en F1, queda sincronizado por construcción; 5.5 lo verifica |
| R6 | Otro consumidor futuro necesite tipos Prisma desde `apps/web` | Es precisamente lo que ADR-005 prohíbe: el límite de integración es `api-types.ts` (OpenAPI). El movimiento refuerza esa frontera en vez de debilitarla |

Punto abierto (no bloqueante para este plan): `packages/api-contract/tsconfig.json` declara
`declaration`/`emitDeclarationOnly`/`outDir: ./dist`, pero ningún script del paquete ejecuta
`tsc` en modo emit — solo `typecheck` con `--noEmit`. Es config muerta; limpiarla queda fuera
de alcance.

---

## 7. Próximos pasos inmediatos

1. Confirmar el plan.
2. Ejecutar F1 y parar en la aserción 5.1(1) — es el único punto donde el plan podría tener que
   cambiar de estrategia.
3. F2 + gate `pnpm typecheck`.
4. F3-F5, luego el smoke de producción local (5.2) **antes** que `verify_cmd`: es más rápido y
   detecta los tres fallos de un tiro.
5. `verify_cmd` completo, commit, push, y seguimiento del deploy de Render (5.6).
