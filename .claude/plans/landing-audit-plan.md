# Plan de ejecución — Auditoría visual y funcional de la landing

**Fecha:** 2026-08-12
**Fuente:** `docs/06-landing-visual-functional-audit.es.md` (§23 priorización, §24 plan de 5 fases, 19–30 h)
**Documentos relacionados:** `docs/05-landing-footer-spec.es.md` (spec original), `docs/08-landing-page.md` (implementación actual)
**Alcance:** solo `apps/web` + un script de captura + metadatos/CI. Sin cambios de schema ni de dominio en la API.
**Estado:** propuesto, sin ejecutar. No se ha tocado código.

---

## 0. Resumen ejecutivo

La auditoría es correcta en el diagnóstico pero está escrita en abstracto. Al leer el código real
aparecen ocho hechos que cambian el orden y el contenido de las fases:

| # | Hallazgo en el código real | Consecuencia para el plan |
|---|---|---|
| H1 | `apps/web/src/pages/Landing.tsx` son 246 líneas con las 9 secciones inline y un array `TABS` local | Antes de reconstruir hay que partirlo en secciones; si no, cada fase edita el mismo archivo y se pisan entre sí |
| H2 | `apps/web/src/router.tsx` importa **estáticamente** las 18 páginas de la app autenticada | La landing carga hoy el bundle completo → incumple el criterio §25 "la landing no carga el bundle completo". Requiere `lazy()`, no es solo cuestión de imágenes |
| H3 | `tokens.css` no contiene `ink/canvas/signal`: la paleta sigue siendo `--color-primary-600: #2563eb` y todos los grises son la escala Tailwind por defecto | La paleta de §5.3 no es "afinar", es introducir tokens nuevos. Y no puede sobrescribir `--color-primary-*`, que la app entera usa |
| H4 | `tokens.css` declara explícitamente *"system stack, no webfonts (fast, no FOUT)"* | La tipografía de §5.4 (Archivo + Public Sans + IBM Plex Mono) **contradice una decisión ya tomada**. Decisión abierta, ver §2 D2 |
| H5 | `#product` está hoy en la sección Problem/Solution (`LAND-SEC-002`), no en el product explorer; no existe `#case-study` | FUN-004 implica renombrar anclas y actualizar `LandingLayout`, `global.css` y `docs/08` |
| H6 | El único medio es `apps/web/public/hero-board.png` (374 KiB, un solo archivo, sin `srcset`) | Ya excede el presupuesto de 250 KiB del §19 antes de añadir nada. Hace falta pipeline de medios, no capturas manuales |
| H7 | `<a href="/accessibility">` en el footer y `https://github.com/username/briefline-crm` son enlaces muertos/placeholder; `/accessibility` no existe en el router y cae en `NotFound` | FUN-006 ("ocultar cualquier enlace sin destino publicado") ya está incumplido hoy |
| H8 | `GET /api/v1/health` **sí existe** (`apps/api/src/modules/health/health.controller.ts`), aunque el comentario de cabecera de `apps/web/playwright.config.ts` afirma lo contrario | FUN-003 (cold start) no necesita backend nuevo: solo cliente. Corregir además el comentario obsoleto |

Orden de ejecución: **F0 preparación → F1 jerarquía → F2 evidencia → F3 narrativa → F4 identidad → F5
hardening → F6 documentación**. Es el orden de la auditoría más una fase 0 (decisiones bloqueantes y
refactor estructural) y una fase 6 (documentación), ambas necesarias en este repo.

---

## 1. Decisiones de arquitectura del plan

**A1 — Partir `Landing.tsx` en secciones antes de rediseñar.**
Nuevo directorio `apps/web/src/components/landing/sections/` con un componente por sección
(`Hero.tsx`, `ProblemSolution.tsx`, `Workflow.tsx`, `ProductExplorer.tsx`, `Permissions.tsx`,
`Engineering.tsx`, `Quality.tsx`, `CaseStudy.tsx`, `FinalCta.tsx`). `Landing.tsx` queda como
composición (~40 líneas). Motivo: cinco fases tocan secciones distintas; con un solo archivo el plan
serializa trabajo que podría no serlo, y cada diff es ilegible.

**A2 — La landing conserva CSS propio (`Landing.css`), no se migra a Tailwind ni a los primitivos `ui/*`.**
El rediseño en curso está migrando `ui/*` a Tailwind + CVA (`Button.tsx` ya usa `cva`). La landing
necesita escalas, alturas y composiciones que no son las del producto. Acoplarla a unos primitivos
que están cambiando a la vez es la vía rápida al conflicto. Excepción: el CTA primario puede usar
`Button` con `size="lg"` si su altura coincide con la especificada (44–48 px).

**A3 — La paleta editorial se introduce como tokens `--landing-*` en `tokens.css`, sin tocar `--color-primary-*`.**

```css
/* Landing — paleta editorial (audit §5.3). No usar en la app autenticada. */
--landing-ink: #17201b;
--landing-canvas: #f5f7f3;
--landing-paper: #ffffff;
--landing-signal: #3d6b57;
--landing-amber: #c9822d;
--landing-line: #d8ded9;
--landing-muted: #66736c;
/* el azul funcional sigue siendo --color-primary-600, reservado a enlaces técnicos */
```

Espejo en `@theme` de `tailwind.css` solo si alguna sección acaba usando utilidades. Motivo: las
capturas del producto son azules; si la landing también lo es, no hay contraste entre marco y
producto — pero renombrar la paleta del producto invalidaría todas las capturas y el trabajo sin
commitear.

**A4 — Escala tipográfica de landing con `clamp()`, tokens `--landing-text-*`.**
`tokens.css` llega hasta `--text-4xl` (36 px); el hero pide 64–72 px. Se añade una escala propia en
vez de estirar la del producto.

**A5 — Los medios se generan con un script reproducible, no a mano.**
`apps/web/scripts/capture-landing-media.ts`: arranca API+web sembradas (reutilizando la configuración
de `playwright.config.ts`), navega a los escenarios y guarda AVIF/WebP 1x/2x en
`apps/web/public/media/`. Motivo: §13 exige que las cifras y evidencias se deriven del estado real, y
§26 pide capturas coherentes entre README y landing. Capturas manuales caducan en el primer rediseño.
Requiere `sharp` como `devDependency` de `apps/web`.

**A6 — Las cifras de Quality se derivan, no se escriben.**
`scripts/collect-test-counts.mjs` → `apps/web/src/data/quality-evidence.json` (unit, integración,
journeys Playwright, fecha). Se ejecuta en release. Prohibido teclear números en el JSX (§22).

**A7 — Deep links reutilizan `?next=`, no se inventa `returnTo`.**
`router.tsx` ya implementa `?next=<path>` en `requireAuth`. FUN-001 se implementa como
`/login?next=%2Ftasks&demo=admin`.

**A8 — El cold start es cliente puro contra `/api/v1/health`.**
Hook `apps/web/src/hooks/useDemoWarmup.ts` con timeout corto, backoff limitado y estados
`idle | waking | ready | failed`. Nunca autenticar por GET (§15).

---

## 2. Decisiones — resueltas 2026-08-12

**D1 — URL real del repositorio y del deploy: el repo aún no está publicado en GitHub.**
`https://github.com/username/briefline-crm` sigue siendo placeholder hoy en `LandingLayout.tsx`,
`Landing.tsx` y `README.md`. Resolución: **ocultar** ese enlace en la landing (footer y CTA final)
hasta que exista una URL real, en vez de dejarlo apuntando a un placeholder — cumple FUN-006 ("ocultar
cualquier enlace sin destino publicado"). No se crea un `<a>` deshabilitado ni un `href="#"`: el nodo
simplemente no se renderiza. Mantener el enlace al deploy en vivo (Render) y a la documentación
interna (`docs/`), que sí existen. T3.5 y T6.2 deben registrar esto como decisión, no como pendiente.

**D2 — Webfonts: se adoptan.** Se revierte la decisión de `tokens.css` ("system stack, no webfonts").
Self-hostear subset `woff2` de **dos** familias: Archivo (display, hero/H2/H3) e IBM Plex Mono
(eyebrow/data/labels); el cuerpo (Public Sans o system stack, decidir en T1.8 según legibilidad) usa
`font-display: swap` y `preload` solo de los pesos del display. Coste estimado ~45–60 KiB, dentro del
presupuesto §19. Actualizar el comentario de `tokens.css` para que documente la nueva decisión y su
razón (identidad editorial de la landing), no solo borrar la nota anterior.

**D3 — Destino de los documentos de evidencia: enlazar a `.claude/plans/` tal cual.**
`permission-matrix.md`, `test-matrix.md`, `data-model.md` y `adrs.md` se quedan donde están; no se
duplican en `docs/`. Los enlaces de Engineering apuntan a esas rutas dentro del repo. Si D1 se resuelve
más adelante (repo publicado), esos enlaces automáticamente funcionan porque ya son rutas relativas del
propio repositorio.

---

## 3. Fases

### F0 — Preparación y refactor estructural

**Objetivo:** dejar el terreno listo para que las fases visuales no colisionen con el rediseño en curso.
**Agente:** orquestador (D1–D3, git) + `frontend-designer` (T0.3–T0.4).
**Estimación:** 2–3 h (fuera de las 19–30 h de la auditoría; es el coste de este repo).

| ID | Tarea | Archivos |
|---|---|---|
| T0.1 | Registrar D1, D2, D3 (ya resueltas §2) en `docs/01-decision-log.md` | `docs/01-decision-log.md` |
| T0.2 | Commitear o aislar el trabajo en curso del design system (58 archivos sin commitear) en su propio commit, con `verify_cmd` verde, antes de tocar la landing | — (git) |
| T0.3 | Partir `Landing.tsx` en `sections/*` (A1), sin ningún cambio visual: mismo DOM, mismas clases | `apps/web/src/pages/Landing.tsx`, `apps/web/src/components/landing/sections/*.tsx` (9 nuevos) |
| T0.4 | Test de baseline de la landing: H1, las 9 secciones presentes, roles de tabs, `caption`/`scope` de la tabla, un único `contentinfo` | `apps/web/test/landing.test.tsx` (nuevo) |
| T0.5 | Medir el bundle actual de `/` (`pnpm --filter @briefline/web build` + tamaño de chunks) y anotarlo como línea base para H2/§19 | — (registro en este plan) |

**verify_cmd:** `pnpm typecheck && pnpm test`
**Gate:** T0.3 no debe alterar ningún snapshot ni test existente. Si `router.test.tsx` o
`auth.test.tsx` cambian de resultado, el refactor no fue neutral.

---

### F1 — Jerarquía y legibilidad (audit §24 F1, P0.2 + P0.3)

**Objetivo:** AUD-001, AUD-002, AUD-004, AUD-011, AUD-012. Que el primer viewport contenga H1,
propuesta, CTA y una captura legible.
**Agente:** `frontend-designer`.
**Estimación:** 4–6 h.

| ID | Tarea | Archivos |
|---|---|---|
| T1.1 | Añadir tokens `--landing-*` de color (A3) y escala tipográfica `clamp()` (A4); espejo en `@theme` si procede | `apps/web/src/styles/tokens.css`, `apps/web/src/styles/tailwind.css` |
| T1.2 | Contenedor 1240 px y ritmo vertical no uniforme: `--landing-container`, `--landing-section-gap-{compact,normal,wide}`; eliminar el `padding: var(--space-10)` idéntico de `.landing-section` | `apps/web/src/components/landing/Landing.css` |
| T1.3 | Hero: altura 78–90vh (no `min-height: 80vh` con `padding-top: 140px`), contenido centrado, H1 a 64–72 px, captura +35–55 %, sombra corta en lugar de `--shadow-lg` difusa, proof strip inferior | `sections/Hero.tsx`, `Landing.css` |
| T1.4 | Subir el cuerpo: ningún texto significativo por debajo de 14 px. Auditar los usos de `--text-xs` (12 px) en `Landing.css` — hoy están en eyebrow, nota del hero, caption de tabla, `th`, `dt` del case study, headings y bottom del footer | `Landing.css` |
| T1.5 | Contraste: sustituir `--color-gray-400`/`500` sobre blanco en texto de apoyo por `--landing-muted` verificado a 4.5:1 | `Landing.css` |
| T1.6 | Header: altura 72–80 px, wordmark ≥24 px, nav 14–15 px con gap 28–36 px, CTA ≥40 px, sticky tras 80–120 px, estado activo por sección con peso además de color | `LandingLayout.tsx`, `Landing.css`, `--header-height` en `tokens.css` si aplica |
| T1.7 | Footer: padding 64–80 px, wordmark 22–24 px, columnas con jerarquía, versión + estado de demo con punto **y** texto | `LandingLayout.tsx`, `Landing.css` |
| T1.8 | Self-hostear Archivo + IBM Plex Mono (D2), subset `woff2`, `font-display: swap`, `preload` del display; actualizar el comentario de `tokens.css` | `apps/web/public/fonts/*`, `tokens.css`, `apps/web/index.html` (preload) |

**verify_cmd:** `pnpm typecheck && pnpm test`
**Gate:** `router.test.tsx:30` afirma el H1 `Client work, clearly owned.` — la auditoría §2.1 dice
conservarlo, así que ese test debe seguir verde sin editarlo. Si hay que editarlo, algo se salió del alcance.

---

### F2 — Evidencia de producto (audit §24 F2, P0.1 + P1.3 + P1.4)

**Objetivo:** AUD-003 (crítica), AUD-002, FUN-001, FUN-005, FUN-007. Es la fase de mayor valor.
**Agente:** `general-purpose` para T2.1–T2.2 (pipeline y optimización de medios, trabajo de tooling);
`frontend-designer` para T2.3–T2.7.
**Estimación:** 5–8 h.

| ID | Tarea | Archivos |
|---|---|---|
| T2.1 | Script de captura reproducible (A5): escenarios board, detalle con historial, cliente, backlog, conflicto 409, foco visible, menú `Move to…` | `apps/web/scripts/capture-landing-media.ts` (nuevo), `apps/web/package.json` (script + `sharp`) |
| T2.2 | Generar AVIF/WebP 1x/2x con presupuesto (hero ≤250 KiB, secundarias ≤180 KiB); sustituir `hero-board.png` (374 KiB, H6) | `apps/web/public/media/*`, borrar `apps/web/public/hero-board.png` |
| T2.3 | Reconstruir el product explorer: tabs reales con roving focus, `aria-controls`/`id` en cada panel (hoy hay un solo `role="tabpanel"` sin `id` ni `aria-labelledby`), captura grande + 3 proof points + CTA profundo por tab | `sections/ProductExplorer.tsx`, `Landing.css` |
| T2.4 | Estado de tab en el hash para poder compartirlo, con panel 1 visible sin JS | `sections/ProductExplorer.tsx` |
| T2.5 | Deep links FUN-001 con `?next=` (A7): board → `/tasks`, historial → `/tasks/:taskId`, cliente → `/clients/:clientId` | `sections/*.tsx` |
| T2.6 | Lightbox accesible (foco inicial, Escape, retorno de foco) reutilizando el `Drawer`/Radix Dialog ya presente, o componente propio si el acoplamiento con `ui/*` en migración lo complica | `apps/web/src/components/landing/LandingLightbox.tsx` (nuevo) |
| T2.7 | Tabla de permisos: cuerpo a 15–16 px, `Allowed`/`Owned only`/`Not allowed` en vez de Yes/No, fila `Edit a task created by another member`, y el bloque de petición negativa `PATCH /api/v1/tasks/:id → 404` | `sections/Permissions.tsx`, `Landing.css` |
| T2.8 | Problem/Solution editorial (§8): titulares `Scattered work` / `One operational view`, frase de situación, fragmento real de Briefline en la columna solución | `sections/ProblemSolution.tsx`, `Landing.css` |

**verify_cmd:** `pnpm typecheck && pnpm test && pnpm test:e2e`
**Por qué e2e aquí:** T2.5 introduce deep links que atraviesan el gate de autenticación
(`requireAuth` + `?next=`). Eso solo se comprueba con la app real; jsdom no lo cubre.

---

### F3 — Narrativa técnica (audit §24 F3, P0.4 + P0.5 + P0.6)

**Objetivo:** AUD-006, AUD-009, FUN-006, FUN-009.
**Agente:** `frontend-designer` (T3.1–T3.4) + `general-purpose` (T3.5).
**Estimación:** 4–6 h.

| ID | Tarea | Archivos |
|---|---|---|
| T3.1 | Engineering: sustituir el `<ul>` de 10 tecnologías por el diagrama React ─ OpenAPI ─ NestJS ─ PostgreSQL y las **cuatro decisiones** con enlace a evidencia | `sections/Engineering.tsx`, `Landing.css` |
| T3.2 | Quality: matriz de cuatro pruebas + panel de evidencia leído del JSON derivado (A6), no del JSX | `sections/Quality.tsx`, `apps/web/src/data/quality-evidence.json` |
| T3.3 | Case study teaser en tres momentos + línea de alcance + línea de honestidad, sustituyendo el `<dl>` de metadata | `sections/CaseStudy.tsx`, `Landing.css` |
| T3.4 | CTA final §15: copy nuevo, `Open administrator demo` / `Open member demo` con `?demo=`, aviso de reset diario y de 60 s de arranque | `sections/FinalCta.tsx` |
| T3.5 | Enlaces de evidencia a `.claude/plans/` (D3); **ocultar** el enlace a GitHub mientras el repo no esté publicado (D1) — no renderizar el nodo, no dejar `href="#"`. Crear `/accessibility` como ruta real (FUN-009) o retirar el enlace del footer (H7) | `apps/web/src/pages/Accessibility.tsx` (nuevo), `router.tsx`, `LandingLayout.tsx` |
| T3.6 | Script de conteo de tests (A6) | `scripts/collect-test-counts.mjs` (nuevo) |

**verify_cmd:** `pnpm typecheck && pnpm test`
**Gate:** cero enlaces placeholder en el DOM renderizado. Añadir la aserción a `landing.test.tsx`:
ningún `href` contiene `username/` ni `#` vacío.

---

### F4 — Identidad y motion (audit §24 F4, P1.1 + P1.2 + P2.2)

**Objetivo:** AUD-007, AUD-008, AUD-005.
**Agente:** `frontend-designer`.
**Estimación:** 3–5 h.

| ID | Tarea | Archivos |
|---|---|---|
| T4.1 | `the brief line` como firma con variaciones (línea, nodo, bifurcación, doble trazo, punto final). Hoy es un `::before` azul de 2 px en `.landing-workflow`. Implementar con CSS + un SVG inline por variación, sin librería | `Landing.css`, `sections/Workflow.tsx`, `sections/Engineering.tsx`, `sections/Hero.tsx` |
| T4.2 | Workflow alternado y numerado (§9), con evidencia visual por etapa, `Blocked` como bifurcación y el ejemplo legible de `Audited` | `sections/Workflow.tsx`, `Landing.css` |
| T4.3 | Aplicar `--landing-signal` a CTA, nodos y foco; dejar el azul para enlaces técnicos y para el interior de las capturas | `Landing.css` |
| T4.4 | **Un solo** momento de motion (reveal del workflow) con IntersectionObserver, sin librería de animación (§19) | `sections/Workflow.tsx` |
| T4.5 | `prefers-reduced-motion`: sin animación y todo visible. Revisar además el `scroll-behavior: smooth` global de `global.css` | `Landing.css`, `apps/web/src/styles/global.css` |

**verify_cmd:** `pnpm typecheck && pnpm test`

---

### F5 — Hardening (audit §24 F5, P0.7 + P0.8)

**Objetivo:** FUN-003, FUN-004, FUN-008, FUN-010, §18 completo, §19 completo.
**Agente:** `general-purpose` (T5.1–T5.3, T5.6) + `frontend-designer` (T5.4) + `qa-risk-analyzer`
(cierre de fase: toca autenticación, deep links y el bundle de producción).
**Estimación:** 3–5 h + QA.

| ID | Tarea | Archivos |
|---|---|---|
| T5.1 | Cold start (A8): hook de warm-up contra `/api/v1/health` con backoff, estado explicado, retry y salida a case study/GitHub si falla definitivamente | `apps/web/src/hooks/useDemoWarmup.ts` (nuevo), `apps/web/src/pages/Login.tsx`, `sections/Hero.tsx`, `sections/FinalCta.tsx` |
| T5.2 | `/login?demo=admin\|member` preselecciona credenciales con confirmación explícita del visitante. **Verificar antes las credenciales reales contra el seed:** `README.md` dice `maria@briefline.demo` y `Login.tsx:41` usa `member@briefline.demo` — una de las dos está mal | `apps/web/src/pages/Login.tsx`, `apps/api/prisma/seed.ts` (solo lectura) |
| T5.3 | **Code splitting (H2):** `lazy()` + `Suspense` para las rutas autenticadas de `router.tsx`, de modo que `/` no arrastre el bundle de la app. Medir contra la línea base de T0.5 | `apps/web/src/router.tsx`, `apps/web/src/App.tsx` |
| T5.4 | Anclas FUN-004 (H5): `#product` pasa al product explorer, Problem/Solution recibe `#problem`, se añade `#case-study`; `scroll-margin-top` por sección en lugar del `scroll-padding-top: 5rem` global; nav del header actualizada (`Quality` → `Case study`, §6) | `sections/*.tsx`, `LandingLayout.tsx`, `Landing.css`, `global.css` |
| T5.5 | Metadata + Open Graph (FUN-008): `index.html` hoy no tiene ni `description`. Imagen social 1200×630 generada por el script de T2.1 | `apps/web/index.html`, `apps/web/public/media/og.png` |
| T5.6 | Suite e2e de landing: axe con `@axe-core/playwright` (ya instalado), 320 px sin scroll horizontal, zoom 400 %, recorrido completo por teclado, `prefers-reduced-motion`, y comprobación de enlaces internos (FUN-010) | `apps/web/test/e2e/landing.spec.ts` (nuevo), `.github/workflows/ci.yml` |
| T5.7 | Corregir el comentario obsoleto de `playwright.config.ts` que afirma que la API no tiene `/health` (H8) | `apps/web/playwright.config.ts` |

**verify_cmd:** `pnpm typecheck && pnpm test && pnpm test:e2e`
**QA obligatorio:** sí. T5.1–T5.3 tocan el flujo de login, el gate de autenticación y el grafo de
carga de producción. Cumple el invariante de `qa-risk-analyzer` (autenticación + refactor multi-módulo).

---

### F6 — Documentación y cierre

**Objetivo:** §26 Definition of Done.
**Agente:** orquestador.
**Estimación:** 1–2 h.

| ID | Tarea | Archivos |
|---|---|---|
| T6.1 | Reescribir `docs/08-landing-page.md`: secciones, anclas nuevas, medios, componentes por sección | `docs/08-landing-page.md` |
| T6.2 | Actualizar el bloque "Landing Page (public)" del README (menciona la nav vieja y `Landing.css` como archivo único) y las capturas | `README.md` |
| T6.3 | Registrar en la auditoría qué P1/P2 quedan fuera, con decisión escrita por cada exclusión (§26) | `docs/06-landing-visual-functional-audit.es.md` (sección de cierre), `docs/01-decision-log.md` |

**verify_cmd:** `pnpm typecheck && pnpm test && pnpm test:e2e` (cierre completo antes del commit final)

---

## 4. Riesgos y dependencias

**R1 — 58 archivos sin commitear (riesgo alto, mitigado por T0.2).**
El rediseño en curso toca `tokens.css`, `tailwind.css`, `ui/*`, `TaskBoard`, `Dashboard`,
`TaskDetailModal` y `vitest.setup.ts`. Si F1 empieza sobre ese árbol sucio, un fallo de
`verify_cmd` será indistinguible entre "lo rompió la landing" y "ya estaba roto". **T0.2 es
bloqueante**: commit del design system, verde, antes de la primera línea de landing.

**R2 — Colisión de paleta.** Si el rediseño en curso planea cambiar `--color-primary-*`, A3 debe
revisarse: la landing podría heredar la paleta nueva en lugar de definir `--landing-*`. Preguntar
antes de F1 si el rediseño incluye cambio de paleta de producto.

**R3 — Las capturas caducan.** F2 fotografía una UI que el rediseño está cambiando ahora mismo.
Mitigación: A5 (script reproducible) y ejecutar T2.1–T2.2 **después** de que el rediseño de
`TaskBoard`/`TaskDetailModal` esté commiteado. Es la razón por la que F2 va después de F1 y no en paralelo.

**R4 — `Landing.css` monolítico (740 líneas).** Cuatro fases lo editan. Mitigación: F1 introduce
separadores por sección con el mismo orden que `sections/`, o se parte en
`sections/<Section>.css`. Decidir en T1.2.

**R5 — Presupuesto de performance contra evidencia visual.** §19 pide ≤250 KiB de hero y ≤100 KiB de
JS de landing; el hero actual ya son 374 KiB y el JS incluye toda la app. T5.3 y T2.2 son los que
hacen viable el resto: sin ellos, cada captura añadida empeora el LCP.

**R6 — Divergencia de credenciales de demo (H8/T5.2).** Publicar en la landing un rol que no exista
en el seed rompe la promesa central del CTA. Verificar contra `prisma/seed.ts`, no contra el README.

**R7 — El e2e de landing es nuevo territorio.** Ningún spec actual visita `/`. Los 5 specs existentes
entran por `/login`. `workers: 1` y login limitado a 5/min por IP: la suite de landing debe evitar
autenticarse salvo cuando el caso lo exija.

---

## 5. Trazabilidad audit → fases

| Prioridad de la auditoría (§23) | Fase |
|---|---|
| P0.1 Reconstruir `Explore the product` | F2 (T2.3, T2.4) |
| P0.2 Corregir hero | F1 (T1.3) |
| P0.3 Tipografía y contraste | F1 (T1.1, T1.4, T1.5) |
| P0.4 Reconstruir Engineering | F3 (T3.1) |
| P0.5 Quality verificable | F3 (T3.2, T3.6) |
| P0.6 Case study teaser | F3 (T3.3) |
| P0.7 Cold start | F5 (T5.1) |
| P0.8 Responsive/teclado/foco/motion/enlaces | F4 (T4.5) + F5 (T5.4, T5.6) |
| P1.1 `the brief line` | F4 (T4.1, T4.2) |
| P1.2 Paleta ink/canvas/signal | F1 (T1.1) + F4 (T4.3) |
| P1.3 Previews ampliables y deep links | F2 (T2.5, T2.6) |
| P1.4 Tabla de permisos con caso negativo | F2 (T2.7) |
| P1.5 Header sticky y footer | F1 (T1.6, T1.7) |
| P1.6 Open Graph | F5 (T5.5) |
| P2.1 Vídeos 8–12 s | **Fuera de alcance.** Registrar la exclusión (§26). Presupuesto de 1.5 MiB por vídeo contra un hero que ya excede el suyo |
| P2.2 Reveal del workflow | F4 (T4.4) |
| P2.3 Versión/estado de demo en footer | F1 (T1.7) |
| P2.4 Prueba con cinco evaluadores | Fuera de alcance técnico |

---

## 6. Estimación

| Fase | Horas | Auditoría §24 |
|---|---|---|
| F0 Preparación | 2–3 | — (coste propio de este repo) |
| F1 Jerarquía | 4–6 | 4–6 |
| F2 Evidencia | 5–8 | 5–8 |
| F3 Narrativa | 4–6 | 4–6 |
| F4 Identidad | 3–5 | 3–5 |
| F5 Hardening | 4–6 | 3–5 (+T5.3 code splitting, no previsto) |
| F6 Documentación | 1–2 | — |
| **Total** | **23–36 h** | 19–30 h |

La diferencia son F0, F6 y T5.3: refactor estructural, documentación y code splitting. La auditoría
no los contempla porque no miró el código.
