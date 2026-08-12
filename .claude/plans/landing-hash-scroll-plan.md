# Plan: landing hash-scroll (deep links en frío + sliver del hero)

Slug: `landing-hash-scroll`
Fecha: 2026-08-12
Estado: aprobado, listo para ejecución
Alcance: `apps/web` (landing pública). Sin cambios en `apps/api`.

---

## 1. Diagnóstico (verificado sobre el código, no sobre la hipótesis)

### Bug 1 — deep links en frío: causa raíz confirmada, con un matiz añadido

La hipótesis del encargo es **correcta en lo esencial**, y el código la respalda con
evidencia dura:

1. `apps/web/index.html` sirve `<div id="root"></div>` vacío + `<script type="module"
   src="/src/main.tsx">`. No hay SSR. Cuando el navegador procesa la navegación inicial
   a `/#product`, ejecuta su paso de "scroll to the fragment" con el DOM de `index.html`,
   donde `#product` no existe. El navegador no reintenta cuando React inserta el árbol.
2. **Nadie más asume esa responsabilidad.** `apps/web/src/router.tsx` usa
   `createBrowserRouter` (Data Mode) y `App.tsx` monta `RouterProvider` sin
   `<ScrollRestoration>` (verificado por grep: no aparece en todo `src/`). Documentación
   de React Router v7 (Context7, `/remix-run/react-router`): `ScrollRestoration` "emula
   el scroll del navegador **en cambios de location**" — la carga inicial es hidratación,
   no una navegación, así que ni siquiera montándolo se cubriría este caso.
3. **Por qué sí funciona el clic en la nav**: `LandingLayout.tsx` renderiza los enlaces de
   sección como `<a href="#id">` planos (no `<Link>`). Es una navegación de fragmento
   nativa del mismo documento con el elemento ya en el DOM. El navegador la resuelve solo.
   No hay código nuestro implicado ni en el caso que funciona ni en el que falla — esa
   asimetría es exactamente la firma del bug.

**Matiz que la hipótesis no cubre, y que el código ya delata:**
`ProductExplorer.tsx:136-141` contiene un `useEffect` privado que hace
`sectionRef.current?.scrollIntoView({ block: 'start' })` cuando el hash trae `?tab=`, con
este comentario:

> "A deep link that lands on this section's hash on first paint should scroll it into
> view — the browser can't do this on its own because the fragment also carries the
> `?tab=` query, so it never matches an element id."

Es decir: **ya existe un parche puntual del mismo bug**, escrito para una sola sección y
por una razón adyacente (el hash compuesto `#explore-product?tab=<key>` nunca casa con
ningún `id`, ni en frío ni en caliente). Confirma el diagnóstico y define el trabajo:
generalizar ese parche a un único dueño y borrar el ad-hoc, no añadir un segundo.

Ese efecto además arrastra un defecto latente: llama a `scrollIntoView` sin `behavior`, y
`global.css:22` declara `html { scroll-behavior: smooth }`. Un deep link en frío a
`?tab=coordinate` **anima** un scroll de ~5.500px en lugar de aterrizar.

### Bug 2 — sliver del hero: **refutada** la hipótesis de causa compartida

No es una carrera y no tiene nada que ver con el estado sticky del header. Es
determinista y aritmético:

| Pieza | Valor | Origen |
|---|---|---|
| Altura real del header | `76px` fija en todos los breakpoints | `tokens.css:151` + `.landing-header__inner { height: var(--landing-header-height) }` (Landing.css:47). No hay override por media query. |
| `scroll-margin-top` de las secciones | `calc(76px + 24px)` = **100px** | `Landing.css:352` (y `:362` para `.landing-anchor`), con `--space-6: 1.5rem` (`tokens.css:77`) |

El header sticky es `position: fixed` y ocupa exactamente `0..76px`. La sección aterriza
en `y = 100px`. Quedan **24px de ventana** entre el borde inferior del header y el borde
superior de la sección — y esa ventana no es blanco neutro: deja ver los últimos 24px de
la sección anterior. Para `#problem`, la sección anterior es el Hero, cuyo último elemento
es `.landing-hero__proof` ("Admin + Member · Daily reset · OpenAPI", `Hero.tsx:51`), sobre
`--landing-canvas` mientras la sección va sobre `--landing-paper` — de ahí que se lea como
una franja de otro color. Los ~8px medidos son la porción visible de esa tira dentro de la
ventana de 24px.

El comentario de `Landing.css:347-351` explica la intención ("keeps a little breathing room
above the heading instead of touching the header"), pero el mecanismo elegido es el
equivocado: `scroll-margin-top` no inserta aire, **abre una mirilla al contenido
anterior**. El aire ya lo pone la propia sección con su `padding-top`
(`--landing-section-gap-normal`: 80→136px, `tokens.css:146`).

Se reproduce igual tras un clic en la nav, no solo en carga fría — confírmalo antes de
tocar nada (paso F0).

**Conclusión: son dos bugs independientes.** Bug 1 es un vacío de responsabilidad en el
arranque de la SPA; bug 2 es un valor de CSS mal elegido. Se arreglan por separado y el
segundo no necesita ningún JavaScript.

---

## 2. Diseño de la solución

### 2.1 Bug 2 — un solo valor de CSS

`scroll-margin-top: var(--landing-header-height)` en `.landing-section` y en
`.landing-anchor`. La sección aterriza a ras del borde inferior del header; su propio
`padding-top` da el aire. Ninguna mirilla, ningún JS, ningún estado transitorio.

No rompe el test e2e existente `header nav anchor scrolls the target heading into view,
clear of the sticky header`: ese test exige `headingBox.y >= headerBottom - 1`, y el
heading queda ≥80px por debajo del borde superior de la sección.

### 2.2 Bug 1 — un hook, un dueño

Nuevo archivo `apps/web/src/components/landing/useHashScrollOnLoad.ts`. Se invoca **una
sola vez**, desde `apps/web/src/pages/Landing.tsx`. No es global: hoy el problema solo
existe en la landing, que es la única ruta con anclas de contenido.

Contrato:

```ts
/** Puro y exportado: es la unidad testeable sin DOM. */
export function resolveHashTargetId(hash: string): string | null

export function useHashScrollOnLoad(): void
```

`resolveHashTargetId`:
- `''`, `'#'` → `null`
- `'#product'` → `'product'`
- `'#explore-product?tab=coordinate'` → `'explore-product'` (corta en el primer `?`)
- decodifica con `decodeURIComponent`, tolerando `URIError` → `null`

`useHashScrollOnLoad` (efecto de montaje, `[]`):
1. `resolveHashTargetId(window.location.hash)`; si `null`, no hace nada.
2. **Si `window.scrollY > 0`, aborta.** El navegador o el usuario ya resolvieron la
   posición; el hook nunca pelea contra un scroll existente.
3. `requestAnimationFrame` → localiza `document.getElementById(id)`; si no existe, aborta.
4. `el.scrollIntoView({ block: 'start', behavior: 'instant' })`.
   `'instant'` es **obligatorio**: con `behavior: 'auto'` la spec de CSSOM-View resuelve al
   `scroll-behavior` computado, que es `smooth` (global.css:22), y un deep link en frío
   animaría ~5.500px en vez de aterrizar.
5. **Pasada de corrección por fuentes.** `index.html` precarga solo Archivo Variable;
   IBM Plex Mono es `font-display: swap` (`tokens.css:194-201`) y no está precargada, así
   que su swap cambia las métricas de eyebrows/labels/datos de todas las secciones
   *después* del montaje y desplaza el destino. Tras el `scrollIntoView` inicial, guardar
   `expectedScrollY = window.scrollY` y encadenar:
   `document.fonts?.ready?.then(...)` → si (a) el efecto no se ha limpiado, (b)
   `window.scrollY === expectedScrollY` (el usuario no ha tocado nada) y (c)
   `Math.abs(el.getBoundingClientRect().top - headerHeight) > 2`, repetir el
   `scrollIntoView({ block: 'start', behavior: 'instant' })`. En cualquier otro caso, no
   hacer nada.
6. Limpieza: `cancelAnimationFrame` + flag `cancelled` que corta la continuación de
   `fonts.ready`, para que una navegación rápida fuera de la landing no scrollee otra
   página.
7. Defensas jsdom: `document.fonts` puede ser `undefined` y `scrollIntoView` puede no ser
   función — usar acceso opcional y `typeof el.scrollIntoView === 'function'`.
   `--landing-header-height` se lee con
   `getComputedStyle(document.documentElement).getPropertyValue('--landing-header-height')`
   con fallback numérico si viene vacío (jsdom no resuelve el token).

### 2.3 Consolidación

Eliminar de `ProductExplorer.tsx` el `useEffect` de scroll y el `sectionRef` que solo
existe para él (`selectTab`, `readTabFromHash` y el estado inicial del tab **se quedan**:
siguen siendo suyos). El hook cubre ese caso al cortar el hash por el `?`. Dejar dos
dueños del mismo scroll produciría dos saltos compitiendo.

### 2.4 Alternativas rechazadas

| Alternativa | Por qué no |
|---|---|
| Montar `<ScrollRestoration>` | No actúa en la carga inicial (es hidratación, no navegación — Context7/RR v7). Además activaría restauración de scroll vía `sessionStorage` en **toda** la app (Board, listas), un cambio de comportamiento fuera del alcance de este bug. |
| `useLocation()` + efecto en cada cambio de hash | El caso en caliente ya funciona nativamente. Duplicarlo añade un segundo scroll compitiendo con el del navegador. |
| Retry con `MutationObserver` o polling | Sin cota, y pelea contra el scroll del usuario. El montaje de React es el momento determinista; no hace falta observar nada. |
| Quitar `scroll-behavior: smooth` global | Regresaría la experiencia de clic en nav que F4 entregó a propósito. El problema es solo el caso frío, y `behavior: 'instant'` lo aísla. |
| Compensar el sliver pintando el hueco (p. ej. `scroll-margin` + fondo) | Trata el síntoma. El offset correcto es la altura real del header; nada más. |

---

## 3. Fases

`verify_cmd` (por fase, salvo indicación):
```
pnpm --filter @briefline/web typecheck && pnpm --filter @briefline/web lint && pnpm --filter @briefline/web test
```
`verify_cmd` completo (F3 en adelante) añade e2e:
```
pnpm --filter @briefline/web test:e2e
```
E2E necesita Postgres arriba (`docker/compose.yml`); si el 5432 está ocupado, exportar
`E2E_DATABASE_URL`. Nada de commits parciales: un commit al cerrar cada fase.

---

### F0 — Reproducción y línea base (orquestador, directo)

| ID | Tarea | Criterio de aceptación | Compl. |
|---|---|---|---|
| REP-1 | Con la app en `127.0.0.1:5173`, medir en frío `/#problem`: `window.scrollY`, `document.querySelector('#problem').getBoundingClientRect().top`, `document.elementFromPoint(x, 78)` | Queda registrado que en frío `scrollY === 0` | S |
| REP-2 | Repetir la medida **tras un clic en la nav** hacia `#problem` (no en frío) | Se confirma o refuta que el sliver aparece también en caliente. Si aparece → bug 2 es 100% CSS (esperado). Si NO aparece → detener F1 y reabrir el diagnóstico del bug 2 antes de tocar CSS | S |

Sin este paso, F1 se ejecuta a ciegas sobre una causa raíz declarada pero no reproducida.

---

### F1 — Offset del header (bug 2) — `frontend-designer`

| ID | Tarea | Archivo | Criterio de aceptación | Compl. | Dep. |
|---|---|---|---|---|---|
| CSS-1 | `scroll-margin-top: var(--landing-header-height)` en `.landing-section` | `Landing.css:352` | Sin `+ var(--space-6)` | S | REP-2 |
| CSS-2 | Mismo cambio en `.landing-anchor` | `Landing.css:362` | Los dos valores coinciden | S | CSS-1 |
| CSS-3 | Actualizar el comentario `Landing.css:347-351` para que explique el mecanismo real (el aire lo pone el `padding-top` de la sección; `scroll-margin-top` extra abre una mirilla a la sección anterior) | `Landing.css` | El comentario ya no afirma que el `--space-6` da "breathing room" | S | CSS-1 |
| CSS-4 | Verificación visual manual en `#problem`, `#workflow`, `#engineering`, `#quality`, `#case-study` a 1440px y a 375px | — | Ninguna sección muestra contenido de la anterior bajo el header | S | CSS-2 |

Gate: `verify_cmd` base + el test e2e existente `header nav anchor scrolls…` sigue verde.

---

### F2 — Hook de hash en carga fría (bug 1) — `frontend-designer`

| ID | Tarea | Archivo | Criterio de aceptación | Compl. | Dep. |
|---|---|---|---|---|---|
| HOOK-1 | Crear `useHashScrollOnLoad.ts` con `resolveHashTargetId` (puro, exportado) y `useHashScrollOnLoad` según §2.2 | `src/components/landing/useHashScrollOnLoad.ts` (nuevo) | Implementa los 7 puntos del contrato, incluida la guarda `scrollY > 0` y la limpieza | M | F1 |
| HOOK-2 | Invocar el hook desde `Landing()` | `src/pages/Landing.tsx` | Una sola llamada, sin props | S | HOOK-1 |
| HOOK-3 | Borrar el `useEffect` de scroll y el `sectionRef` de `ProductExplorer` | `sections/ProductExplorer.tsx:133-141` | El `<section>` ya no lleva `ref`; `readTabFromHash` y el estado inicial del tab intactos; sin imports huérfanos (`useRef` puede seguir usándose por `tabRefs`) | S | HOOK-1 |
| HOOK-4 | Comentario de cabecera del hook que registre por qué existe: SPA sin SSR + RR v7 no scrollea el fragmento en la carga inicial, y el hash compuesto `?tab=` nunca casa con un `id` | — | Un lector futuro no lo confunde con un parche redundante del navegador | S | HOOK-1 |

Gate: `verify_cmd` base. Comprobación manual: recarga en frío de `/#product`,
`/#case-study` y `/#explore-product?tab=accountability` → aterriza sin animación.

---

### F3 — Red de tests — `unit-test-creator`

**Unitarios** (`apps/web/test/landing.test.tsx` o archivo nuevo junto al hook):

| ID | Caso | Criterio |
|---|---|---|
| UT-1 | `resolveHashTargetId('')` y `('#')` → `null` | Determinista, sin DOM |
| UT-2 | `resolveHashTargetId('#product')` → `'product'` | |
| UT-3 | `resolveHashTargetId('#explore-product?tab=coordinate')` → `'explore-product'` | **El caso que motivó el parche ad-hoc borrado en HOOK-3** |
| UT-4 | `resolveHashTargetId('#case%2Dstudy')` → decodifica | Tolera `URIError` → `null` |
| UT-5 | Los tests existentes de `landing.test.tsx` siguen verdes con el hook montado (jsdom: sin `document.fonts`, sin `scrollIntoView`) | Ninguno lanza | 

**E2E** (`apps/web/test/e2e/landing.spec.ts`, tests **nuevos** — los 8 actuales se
mantienen verdes):

| ID | Test | Forma |
|---|---|---|
| E2E-1 | `cold load of /#product scrolls to the product explorer` | `page.goto('/#product')`; `await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(1000)`; `await expect(page.getByRole('heading', { name: 'Explore the product' })).toBeInViewport()` |
| E2E-2 | `cold load of /#case-study scrolls to the case study section` | Igual, con `About this case study`. Segunda ancla ⇒ prueba que el arreglo no es específico de `#product` |
| E2E-3 | `cold load of /#problem lands flush under the sticky header` | Tras la carga: `boundingBox()` de `#problem` con `y` dentro de `[headerBottom - 1, headerBottom + 2]`, **y** `page.evaluate` con `document.elementFromPoint(cx, headerBottom + 2)?.closest('#problem') !== null`. Guarda a nivel de píxel del bug 2 |
| E2E-4 | `cold load of /#explore-product?tab=accountability selects the tab and scrolls` | El tab `Keep accountability` tiene `aria-selected="true"`, el heading `Permissions and history` está `toBeInViewport()` y `scrollY > 1000`. Guarda de la consolidación HOOK-3 |
| E2E-5 | Extender el test existente `header nav anchor scrolls the target heading into view…` con la misma comprobación `elementFromPoint` de E2E-3 | Cubre el camino en caliente sin añadir un noveno test redundante |

Reglas anti-flake obligatorias: usar `expect.poll` / `toBeInViewport` (auto-retry), nunca
`waitForLoadState('networkidle')` ni `waitForTimeout`. `page.goto` con hash resuelve en
`load`; el scroll ocurre después, así que toda aserción de posición debe ser reintentable.

Gate: `verify_cmd` completo, incluido `test:e2e`. **13 tests en `landing.spec.ts`, todos
verdes** (8 existentes + 4 nuevos + 1 extendido, que sigue contando como existente → 12
totales; el número exacto se fija al ejecutar, no se declara de antemano).

---

### F4 — QA y cierre — `qa-risk-analyzer`

Cambio pequeño y acotado a la landing pública (sin auth, sin datos, sin migraciones): QA
proporcional, no barrido completo. Foco explícito:

| ID | Riesgo a auditar |
|---|---|
| QA-1 | ¿Puede el hook scrollear una página que ya no es la landing? (limpieza del rAF y del flag tras `fonts.ready`) |
| QA-2 | ¿Doble scroll si el navegador *sí* acierta el fragmento nativamente? (guarda `scrollY > 0`) |
| QA-3 | La pasada de corrección por fuentes, ¿puede robarle el scroll a un usuario que empezó a leer? (comparación `window.scrollY === expectedScrollY`) |
| QA-4 | `prefers-reduced-motion`: `behavior: 'instant'` es coherente con `global.css:157`, y el test axe (que emula reduced-motion) sigue verde |
| QA-5 | ¿Queda algún `scroll-margin-top` con la fórmula antigua en `Landing.css`? |

F5 — commit (orquestador, nunca delegado).

---

## 4. Riesgos y cuestiones abiertas

- **Destello antes del salto.** Con la caché fría, `document.fonts.ready` puede tardar y la
  pasada de corrección se ve como un segundo salto. El primer `scrollIntoView` ya ocurre en
  el `rAF` inicial, así que el usuario no ve el Hero durante toda la carga de fuentes; la
  corrección es un ajuste de pocos píxeles. Si en F2 se observa un salto grande, la causa
  es otra (imágenes sin `width`/`height`) y hay que investigarla antes de aceptar el hook.
- **`behavior: 'instant'`** tiene soporte universal en navegadores actuales, pero jsdom no
  implementa `scrollIntoView`: los unitarios dependen de la guarda `typeof … === 'function'`
  (UT-5 lo verifica).
- **`--landing-header-height` es un token estático de 76px.** Si en el futuro el header
  cambia de altura por breakpoint, tanto el CSS de F1 como la comprobación de la pasada de
  corrección dejan de ser exactos. Registrado, no resuelto: hoy no hay ningún override.
- **REP-2 puede refutar el diagnóstico del bug 2.** Es la única bifurcación real del plan;
  si el sliver no aparece en caliente, F1 se detiene.

## 5. Siguiente paso inmediato

Ejecutar F0 (REP-1/REP-2) con la app corriendo, y con REP-2 confirmado lanzar F1.
