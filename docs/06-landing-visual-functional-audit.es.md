# Auditoría visual y funcional de la landing — Briefline CRM

**Estado:** Especificación de mejora aprobada  
**Versión:** 1.0  
**Fecha:** 2026-08-12  
**Owner:** Product, Design & Frontend  
**Fuente evaluada:** captura completa de la landing, 2954 × 10734 px  
**Documento base:** `docs/05-landing-footer-spec.es.md`  
**Objetivo:** elevar la landing desde una implementación correcta hasta una pieza de portafolio profesional, memorable y convincente.

## 1. Resumen ejecutivo

La landing actual tiene una base sólida: es limpia, coherente, honesta y presenta el producto con una secuencia lógica. No parece una plantilla SaaS agresiva, no inventa testimonios y comunica adecuadamente el contexto del caso de estudio.

Sin embargo, todavía se percibe como una primera versión funcional. La página explica muchas cosas, pero **demuestra pocas**. Después del hero, gran parte de la evidencia se reduce a listas, tablas y cajas de texto con una escala visual demasiado pequeña. La identidad se apoya casi exclusivamente en el azul y no desarrolla suficientemente el recurso conceptual de `the brief line`.

La mejora no debe consistir en añadir decoración. Debe aumentar cuatro cualidades:

1. **Jerarquía:** hacer que el visitante entienda dónde mirar y qué recordar.
2. **Densidad de prueba:** sustituir afirmaciones por capturas, estados reales y evidencia verificable.
3. **Identidad:** convertir la línea de trabajo cliente → entrega → auditoría en una firma visual propia.
4. **Conversión:** hacer más evidente el siguiente paso para evaluadores no técnicos y técnicos.

### Evaluación actual

| Dimensión | Estado actual | Objetivo después de la mejora |
|---|---:|---:|
| Claridad del propósito | 8/10 | 9/10 |
| Jerarquía visual | 6/10 | 9/10 |
| Diferenciación | 5/10 | 8/10 |
| Evidencia de producto | 4/10 | 9/10 |
| Credibilidad técnica | 7/10 | 9/10 |
| Ritmo y composición | 5/10 | 8/10 |
| Legibilidad | 6/10 | 9/10 |
| Conversión a demo/código | 7/10 | 9/10 |
| Calidad percibida de portafolio | 6/10 | 9/10 |

## 2. Lo que funciona y debe conservarse

### 2.1 Propuesta de valor clara

`Client work, clearly owned.` es un buen titular. Es breve, describe el beneficio y evita lenguaje promocional vacío. Debe conservarse.

### 2.2 Narrativa correcta

La secuencia actual es coherente:

```text
Hero
→ Problem
→ Workflow
→ Product
→ Permissions
→ Engineering
→ Quality
→ Case study
→ Demo CTA
```

No hace falta cambiar el orden general. Hace falta mejorar la fuerza y variedad de cada bloque.

### 2.3 Honestidad del caso de estudio

La página identifica el proyecto como trabajo de portafolio, usa datos ficticios y no inventa clientes o resultados. Esta transparencia es una ventaja y debe mantenerse visible.

### 2.4 Separación entre landing y aplicación

El header público es pequeño y el footer no invade la aplicación. La separación conceptual es correcta.

### 2.5 Lenguaje visual sobrio

La ausencia de gradientes intensos, ilustraciones genéricas y efectos continuos es adecuada para una herramienta interna. La evolución debe continuar siendo sobria.

## 3. Problemas prioritarios

| ID | Hallazgo | Severidad | Impacto |
|---|---|---|---|
| AUD-001 | El hero ocupa demasiado alto y deja una gran superficie vacía | Alta | Reduce densidad, hace que el producto parezca pequeño y retrasa el contenido |
| AUD-002 | La captura del producto en el hero es demasiado pequeña | Alta | Un evaluador no puede leer ni reconocer la calidad real de la aplicación |
| AUD-003 | `Explore the product` no muestra realmente el producto | Crítica | La sección promete evidencia visual, pero presenta principalmente texto |
| AUD-004 | La escala tipográfica del cuerpo y labels es demasiado pequeña | Alta | Disminuye legibilidad, accesibilidad y calidad percibida |
| AUD-005 | Las secciones usan composiciones demasiado parecidas | Alta | El scroll se vuelve monótono y no crea momentos memorables |
| AUD-006 | Engineering y Quality son listas planas sin evidencia | Alta | El stack se afirma, pero no se demuestra |
| AUD-007 | `The brief line` no está desarrollada como firma visual | Media | La identidad podría pertenecer a cualquier dashboard SaaS |
| AUD-008 | La paleta se percibe como azul genérico, no como la identidad especificada | Media | Debilita diferenciación y coherencia con el concepto editorial/operativo |
| AUD-009 | El caso de estudio es demasiado pequeño y administrativo | Media | No cuenta una historia convincente del proceso y las decisiones |
| AUD-010 | El CTA final aparece tarde y con poca contextualización | Media | La página depende de que el visitante llegue al final sin recordatorios útiles |
| AUD-011 | La navegación es demasiado pequeña y el wordmark carece de presencia | Media | La cabecera parece utilitaria, no una entrada de portafolio refinada |
| AUD-012 | El footer tiene jerarquía muy débil | Baja | Los destinos técnicos existen, pero no invitan a profundizar |
| AUD-013 | No se comunica el cold start antes de abrir la demo | Media | Una espera de Render puede parecer un fallo del proyecto |
| AUD-014 | No hay pruebas visibles de responsive, accesibilidad o estados de error | Alta | Se pierde una oportunidad de demostrar trabajo frontend maduro |

## 4. Principio rector del rediseño

> **Show the system, not only the claims.**

Cada sección debe ofrecer al menos uno de estos tipos de prueba:

- Captura real.
- Estado real de interfaz.
- Comparación verificable.
- Arquitectura concreta.
- Prueba o criterio medible.
- Enlace a implementación/documentación.

Una afirmación sin prueba puede existir como introducción, pero no como contenido principal de una sección completa.

## 5. Dirección visual revisada

### 5.1 Personalidad

La landing debe sentirse como una mezcla entre:

- Una herramienta operativa bien diseñada.
- Un case study editorial.
- Una documentación técnica accesible.

No debe parecer:

- Una landing de startup genérica.
- Una documentación sin diseño.
- Un dashboard agrandado.
- Un catálogo de tecnologías.

### 5.2 Firma visual: `the brief line`

La línea debe convertirse en el elemento que une la página:

- Comienza cerca del wordmark o del eyebrow del hero.
- Conecta visualmente el texto con la captura del tablero.
- Reaparece en el workflow como eje principal.
- Se utiliza como guía de lectura en Engineering.
- Termina en el CTA final, representando la entrega completada.

No debe ser una línea decorativa que atraviese todos los bloques de forma literal. Debe reaparecer con variaciones controladas:

- Línea continua: progreso.
- Nodo: decisión o estado.
- Bifurcación: frontend/backend.
- Doble trazo: contrato OpenAPI.
- Punto final: trabajo auditado.

### 5.3 Paleta

La implementación actual usa un azul intenso como identidad dominante. Se recomienda recuperar la paleta aprobada y reservar el azul eléctrico para estados funcionales o acciones muy puntuales.

| Token | Hex | Aplicación |
|---|---|---|
| `ink` | `#17201B` | Titulares, texto y footer |
| `canvas` | `#F5F7F3` | Fondo principal |
| `paper` | `#FFFFFF` | Capturas y superficies |
| `signal` | `#3D6B57` | CTA principal, nodos, foco y estado positivo |
| `amber` | `#C9822D` | Prioridad, warning y detalles de proceso |
| `blue-functional` | `#2563EB` | Enlaces técnicos y estados propios de la app |
| `line` | `#D8DED9` | Bordes y divisores |
| `muted` | `#66736C` | Texto secundario, nunca por debajo de contraste requerido |

**Argumento:** una paleta verde tinta conecta mejor con responsabilidad, proceso y herramienta profesional. El azul puede conservarse dentro de capturas reales sin monopolizar la identidad de la landing.

### 5.4 Tipografía

La captura muestra una escala de cuerpo demasiado pequeña y un contraste muy débil en labels y supporting copy.

Se propone:

| Rol | Familia | Tamaño desktop | Tamaño mobile | Line-height |
|---|---|---:|---:|---:|
| Display hero | Archivo Variable | 64–72 px | 42–48 px | 0.98–1.04 |
| H2 | Archivo Variable | 38–44 px | 30–34 px | 1.08–1.15 |
| H3 | Archivo Variable | 22–26 px | 20–22 px | 1.2 |
| Lead | Public Sans | 19–21 px | 17–19 px | 1.55 |
| Body | Public Sans | 16–18 px | 16–17 px | 1.55–1.7 |
| Small | Public Sans | 14–15 px | 14–15 px | 1.5 |
| Eyebrow/data | IBM Plex Mono | 12–13 px | 11–12 px | 1.4 |

Reglas:

- Ningún contenido significativo por debajo de 14 px.
- Los labels monoespaciados pueden ser pequeños, pero necesitan tracking moderado y contraste suficiente.
- El H1 puede mantener dos líneas, pero la segunda no debe parecer un salto accidental.
- El ancho de párrafo del hero debe limitarse a 38–44 caracteres aproximados por línea.

### 5.5 Contenedor y ritmo

- Ancho máximo del contenido principal: 1240 px.
- Padding lateral desktop: 40–56 px.
- Padding lateral móvil: 20–24 px.
- Separación entre secciones principales: 112–152 px en desktop y 72–96 px en móvil.
- No aplicar el mismo padding vertical a todas las secciones.
- Alternar secciones compactas, visuales y narrativas.

**Argumento:** la página actual tiene mucho espacio, pero no ritmo. El espacio profesional no significa distribuir grandes áreas vacías uniformemente; significa dar aire proporcional a la importancia del contenido.

## 6. Mejoras del header

### Situación actual

- Altura muy baja.
- Wordmark pequeño.
- Navegación con texto reducido.
- El CTA tiene presencia suficiente, pero parece desconectado del resto.

### Especificación

- Altura inicial: 72–80 px.
- Wordmark: símbolo + `Briefline`, altura visual mínima 24 px.
- Navegación: 14–15 px, gap 28–36 px.
- CTA: altura mínima 40–44 px.
- Contenedor alineado con hero y footer.
- Estado sticky activado después de 80–120 px de scroll.
- Al activarse sticky: fondo `canvas` con 88–94% de opacidad, blur sutil y borde inferior `line`.
- Añadir enlace `Case study` o sustituir `Quality` por `Case study`; Quality seguirá dentro de la página, pero no necesita ocupar navegación primaria.
- Mantener `Product`, `Workflow`, `Engineering`, `Case study`.
- Añadir estado activo según sección visible.

### Funcionalidad

- Scroll a secciones respetando `scroll-margin-top`.
- El hash de URL se actualiza sin interrumpir navegación.
- El CTA `Open live demo` muestra un microcopy o tooltip accesible: `Demo data resets daily`.
- En móvil: menú en panel, foco controlado, cierre con Escape y al elegir destino.

### Criterios

- Todos los targets alcanzan al menos 44 px en dimensión táctil recomendada.
- El header no oculta headings después de navegar por hash.
- El estado activo tiene forma o peso además de color.

## 7. Mejoras del hero

### Diagnóstico

El hero es la mayor oportunidad de mejora. La composición está bien planteada, pero se encuentra demasiado abajo dentro de un contenedor muy alto. La captura real del producto aparece pequeña y rodeada de demasiado vacío. Esto hace que el visitante vea primero una gran superficie blanca y después una prueba visual difícil de leer.

### Nueva composición

```text
┌──────────────────────────────────────────────────────────────┐
│ Eyebrow + availability                                       │
│                                                              │
│ Client work,              ┌────────────────────────────────┐ │
│ clearly owned.            │  Large real product viewport   │ │
│                           │  with readable task details    │ │
│ Supporting copy           │                                │ │
│ [Open demo] [Case study]  └────────────────────────────────┘ │
│ Admin + Member · Daily reset · OpenAPI                        │
└──────────────────────────────────────────────────────────────┘
```

### Cambios visuales

- Reducir el hero desde aproximadamente un viewport y medio a 78–90vh, con mínimo de contenido y máximo razonable.
- Alinear el contenido verticalmente cerca del centro, no en el tercio inferior.
- Aumentar el H1 a 64–72 px en desktop.
- Aumentar la captura entre 35% y 55% respecto a su tamaño actual.
- Permitir que la captura invada ligeramente el límite del contenedor para crear tensión visual controlada.
- Usar sombra corta y borde definidos; eliminar glow excesivamente difuso.
- Incorporar dos ampliaciones flotantes pequeñas tomadas de la app real:
  - Un cambio de estado o prioridad.
  - Una entrada del historial.
- Incluir un badge textual discreto: `Live demo · Fictional data · Daily reset`.

### Cambios funcionales

- El CTA principal abre `/login`.
- El secundario desplaza o abre el case study.
- Añadir enlaces de rol debajo, no como botones competidores:
  - `Try as administrator`.
  - `Try as member`.
- Si Render está iniciando, mostrar una pantalla/estado honesto: `The demo is waking up. This can take up to 60 seconds.`
- La captura puede tener un enlace `View full board screenshot` que abre un lightbox accesible o página de media; no debe ser un zoom al hover.

### Argumento

El hero tiene que probar que existe un producto real. Para un portafolio, una captura legible vale más que una ilustración decorativa. El visitante debe reconocer el tablero, la densidad y la calidad de la UI sin entrar todavía a la demo.

## 8. Mejoras de la sección problema/solución

### Diagnóstico

La comparación roja/verde es clara, pero se siente como una alerta de formulario ampliada. Es correcta, aunque demasiado literal y genérica.

### Especificación

- Mantener la comparación de dos columnas.
- Cambiar títulos a:
  - `Scattered work`.
  - `One operational view`.
- Añadir una frase de situación real arriba:

> A client request starts in chat, priorities live in a spreadsheet, and delivery status depends on who remembers to update whom.

- Convertir cada columna en una composición editorial, no en dos cajas coloreadas idénticas.
- Columna problema:
  - Fondo casi neutro con borde rojo tenue.
  - Fragmentos visuales de chat/hoja de cálculo desenfocados y abstractos, sin marcas de terceros.
- Columna solución:
  - Fragmento real de Briefline mostrando cliente, propietario y estado.
- Mantener cuatro puntos, pero aumentar texto a 15–16 px.

### Argumento

La sección debe demostrar que el problema surge de información fragmentada, no solo afirmar que existe. La solución debe mostrar cómo cambia la estructura de la información.

## 9. Mejoras del workflow

### Diagnóstico

La lista vertical actual es ordenada, pero visualmente parece un timeline de documentación. Todas las tarjetas tienen la misma importancia y la línea azul no se integra con el resto de la identidad.

### Especificación

- Conservar las cinco etapas.
- Aumentar el contraste entre etapa, verbo y evidencia.
- Reemplazar tarjetas uniformes por una composición alternada:

```text
01 CLIENT        [client record crop]
       │
02 BACKLOG                          [task crop]
       │
03 ACTIVE WORK   [board crop]
       │
04 COMPLETED                        [completed state]
       │
05 AUDITED       [history crop]
```

- Numerar porque aquí sí existe una secuencia real.
- Usar `the brief line` con `signal` y nodos funcionales.
- Cada etapa contiene:
  - Nombre.
  - Acción humana.
  - Regla relevante.
  - Evidencia visual pequeña.
- Destacar `Blocked` como bifurcación temporal, no como destino final.
- Añadir en `Audited` un ejemplo legible: `Status · In progress → Blocked · by Jordan Lee · 14:32`.

### Funcionalidad

- En desktop, reveal progresivo opcional siguiendo la línea.
- En móvil, secuencia completamente vertical.
- Cada preview puede enlazar a la sección real de la demo, conservando login redirect.
- Reduced motion muestra todos los elementos sin animación.

### Argumento

El workflow debe ser el momento distintivo de la landing. Actualmente informa, pero no construye identidad ni demuestra cómo se transforma el trabajo.

## 10. Reconstrucción de `Explore the product`

### Diagnóstico crítico

La sección actual es la principal debilidad. El título promete `Real screens from the working application — not mockups`, pero la captura muestra tabs y un gran contenedor con texto. No existe suficiente producto real para cumplir la promesa.

### Nueva estructura

```text
┌──────────────────────────────────────────────────────────────┐
│ Explore the working product                                  │
│ [Plan work] [Coordinate delivery] [Keep accountability]      │
│                                                              │
│ ┌──────────────────────────────────────┐ ┌─────────────────┐ │
│ │ Large real screenshot / short video │ │ Feature title   │ │
│ │                                      │ │ Explanation     │ │
│ │                                      │ │ 3 proof points  │ │
│ └──────────────────────────────────────┘ │ [Open in demo]  │ │
│                                          └─────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

### Contenido por tab

#### Plan work

- Captura de cliente + creación de tarea + backlog.
- Explicar:
  - Client context travels with the task.
  - Backlog work can remain unassigned.
  - Active work requires an owner.
- CTA: `Open backlog in demo`.

#### Coordinate delivery

- Captura o vídeo corto del movimiento Pending → In progress → Blocked.
- Mostrar filtro por responsable y prioridad.
- Explicar que existe alternativa `Move to…` al drag-and-drop.
- CTA: `Open task board`.

#### Keep accountability

- Captura del drawer con historial.
- Mostrar un conflicto de versión o un estado read-only archivado.
- Explicar autorización por objeto y transacción atómica.
- CTA: `Inspect task history`.

### Interacción

- Tabs reales con roving focus conforme a patrón accesible o botones simples si el coste no lo justifica.
- El estado seleccionado se refleja en query/hash para poder compartirlo.
- Cambio instantáneo sin reflow grande.
- Preload solo del siguiente medio; no cargar todos los vídeos inicialmente.
- En móvil, convertir tabs en botones horizontales con scroll local o selector, manteniendo contenido visible.

### Criterios

- Cada tab incluye al menos una captura real legible.
- Cada tab tiene un CTA profundo.
- La sección sigue siendo comprensible si JavaScript falla: el primer panel permanece visible y los demás aparecen como bloques estáticos o enlaces.
- No existe autoplay con sonido.

## 11. Mejoras de permisos

### Diagnóstico

La tabla comunica bien la diferencia entre roles, pero ocupa mucho ancho para pocos datos y el tamaño actual dificulta la lectura. Los `Yes/No` apenas construyen evidencia.

### Especificación

- Aumentar body de tabla a 15–16 px.
- Añadir caption visible o visually hidden completo.
- Fijar primera columna más ancha.
- Usar `Allowed`, `Owned only` y `Not allowed` cuando corresponda, en lugar de reducir todo a Yes/No.
- Añadir una fila diferenciadora:
  - `Edit a task created by another member`.
- Añadir bloque lateral o inferior con una petición negativa real:

```text
PATCH /api/v1/tasks/:id
Member without ownership
→ 404 Resource not found
→ No task or history record changed
```

- Conservar el mensaje:

> Permissions are enforced by the API, not only hidden in the interface.

### Argumento

La tabla debe demostrar autorización de servidor y protección contra BOLA, no limitarse a describir diferencias visuales entre menús.

## 12. Reconstrucción de Engineering

### Diagnóstico

La sección actual presenta dos columnas de texto muy pequeño y un botón. Es técnicamente correcta, pero visualmente indistinguible de una lista de CV.

### Nueva composición

```text
                    OpenAPI contract
React application ───────────────────── NestJS API
       │                                      │
       │ Query cache                          │ Auth + policies
       │ Forms + a11y                         │ Transactions
       └────────────── PostgreSQL ────────────┘
```

### Contenido

Cuatro decisiones, cada una con evidencia:

1. **Contract-first integration**
   - OpenAPI 3.1.
   - Generated frontend types.
   - Link: `Inspect the API contract`.
2. **Server-enforced permissions**
   - Global authentication.
   - Object-level policies.
   - Link: `Read the permission matrix`.
3. **Atomic change history**
   - Task mutation and TaskChange in one transaction.
   - Link: `View the data model`.
4. **Conflict-safe interactions**
   - `expectedVersion` and 409 recovery.
   - Link: `Read ADR-004`.

### Visual

- Diagrama central o izquierda.
- Cuatro decisiones como filas o nodos, no tarjetas genéricas idénticas.
- Código solo cuando comunica una decisión; máximo 4–7 líneas.
- Mostrar stack como labels secundarios, no contenido principal.

### CTA

- Primario: `Explore the repository`.
- Secundarios: `Open API docs`, `Read the architecture`.

### Argumento

Un reclutador ya puede leer React/Nest/PostgreSQL en el README. La landing debe mostrar cómo se usan y qué decisiones profesionales habilitan.

## 13. Reconstrucción de Quality and accessibility

### Diagnóstico

Actualmente es una lista dividida en dos columnas. Las afirmaciones son valiosas, pero no tienen jerarquía ni evidencia.

### Especificación

Crear una matriz de cuatro pruebas:

| Evidencia | Qué demuestra | Destino |
|---|---|---|
| Keyboard-complete task move | DnD no es la única interacción | Demo o vídeo corto |
| PostgreSQL integration tests | Constraints y transacciones reales | Test matrix |
| Negative authorization tests | Permisos de servidor y rollback | Security review |
| Daily deterministic reset | Demo pública recuperable | Operations runbook |

Añadir un pequeño panel de evidencia:

```text
Quality evidence
178 unit tests
120 PostgreSQL integration tests
5 critical Playwright journeys
WCAG 2.2 AA target + manual keyboard review
```

Reglas:

- Las cifras deben derivarse del estado real y actualizarse automáticamente o durante release.
- Evitar una barra de progreso de cobertura sin contexto.
- Añadir enlace `Review the testing strategy`.
- Incluir una captura de la alternativa `Move to…` o del foco visible.

### Argumento

Las pruebas son parte del producto de portafolio. Presentarlas como evidencia concreta mejora la confianza mucho más que una lista de promesas.

## 14. Reconstrucción de About this case study

### Diagnóstico

La sección actual usa labels pequeños y respuestas en una caja. Parece metadata de proyecto, no una historia de diseño y desarrollo.

### Nueva composición

Usar un case study teaser en tres momentos:

```text
01 Ambiguous brief
   A freelance listing asked for a CRM-style task manager.

02 Product decisions
   Scope, roles, permissions, data model, API contract and accessible board.

03 Working outcome
   Public demo, documented architecture, reproducible tests and deployment.
```

Añadir una línea de alcance:

> I owned product definition, UX direction, frontend, backend, data, testing, and deployment.

Añadir una línea de honestidad:

> This is an independent portfolio case study inspired by a marketplace brief, not commissioned client work.

CTA:

- `Read the full case study`.
- `View the development plan` como enlace secundario técnico.

### Argumento

El visitante debe entender no solo qué se construyó, sino cómo se convirtió una petición ambigua en decisiones trazables. Eso demuestra seniority mejor que repetir el stack.

## 15. Mejora del CTA final

### Situación actual

El titular es correcto y los botones por rol son útiles, pero el bloque podría resolver mejor la expectativa de cada visitante.

### Especificación

Headline:

> See how Briefline turns client context into accountable work.

Supporting copy:

> Use the administrator account to manage the full workspace, or the member account to test ownership-based permissions. No registration required.

Acciones:

- `Open administrator demo` — primario.
- `Open member demo` — secundario.
- `Prefer the code? View the repository` — enlace.

Añadir:

- `Demo data resets daily`.
- `First load may take up to 60 seconds on the free hosting tier`.

### Funcionalidad

- Preseleccionar rol en login.
- No autenticar mediante GET.
- Mostrar estado de warm-up si la API está dormida.
- Ofrecer `Continue to case study` si la demo falla.

## 16. Mejora del footer

### Diagnóstico

El footer oscuro produce un cierre adecuado, pero los grupos y la descripción son demasiado pequeños y hay poco contraste jerárquico.

### Especificación

- Aumentar padding vertical a 64–80 px.
- Wordmark a 22–24 px.
- Descripción a 15–16 px y máximo 34 caracteres por línea aproximados.
- Headings de columna a 12–13 px mono, con contraste adecuado.
- Links a 14–15 px con estado hover/focus visible.
- Añadir `Main portfolio` y `Architecture` si existen.
- Incluir versión `v1.0.0` y estado `Live demo` con punto y texto; no depender solo de color.
- Mantener declaración de datos ficticios.
- Un único landmark `contentinfo`.

### Estructura

```text
Briefline                       Product            Project
A full-stack CRM workflow       Live demo          GitHub
case study for small teams.     Case study         Architecture
                                API docs           Accessibility

v1.0.0 · Live demo              Built as an independent portfolio case study.
```

## 17. Mejoras funcionales transversales

### FUN-001 — Deep links de producto

Cada preview debe poder abrir el punto relevante:

- Board → `/app/tasks`.
- Historial → `/app/tasks/:taskId`.
- Clientes → `/app/clients/:clientId`.
- Usuarios → `/app/users` solo para demo admin.

Si el visitante no está autenticado, conservar `returnTo` después de login.

### FUN-002 — Selección explícita de rol

- `/login?demo=admin` y `/login?demo=member` rellenan/seleccionan credenciales públicas.
- El visitante debe confirmar con un botón.
- El copy explica qué puede probar con cada rol.

### FUN-003 — Manejo del cold start

- Antes de navegación o al cargar login, comprobar health con timeout corto.
- Si el servicio despierta:
  - Mostrar progreso indeterminado.
  - Explicar causa y tiempo estimado.
  - Reintentar con backoff limitado.
  - No mostrar error genérico durante los primeros segundos razonables.
- Si falla definitivamente, ofrecer retry, GitHub y case study.

### FUN-004 — Navegación por secciones

- Hashes estables: `#product`, `#workflow`, `#engineering`, `#quality`, `#case-study`.
- `scroll-margin-top` para header sticky.
- Back/forward conserva sección.
- No usar smooth scroll si reduced motion está activo.

### FUN-005 — Capturas ampliables

- Lightbox accesible o página de media con cierre, Escape, foco inicial y retorno.
- No zoom solo mediante hover.
- Cada captura incluye caption con el escenario demostrado.

### FUN-006 — Evidencia enlazada

- API contract → OpenAPI real.
- Permission matrix → documento real.
- Test strategy → documento real.
- ADR → archivo real.
- Repositorio → URL real.
- Ocultar cualquier enlace sin destino publicado; no placeholders.

### FUN-007 — Media progressive enhancement

- Poster estático primero.
- Vídeo solo tras interacción o cuando entra cerca del viewport.
- Pause visible.
- Sin audio.
- Reduced motion conserva poster.

### FUN-008 — Metadata social

- Open Graph con captura grande y legible.
- Title/description coherentes con la landing.
- La imagen social debe mostrar producto + titular, no toda la página reducida.

### FUN-009 — Página de accesibilidad

Debe explicar:

- Objetivo WCAG.
- Interacciones verificadas manualmente.
- Limitaciones conocidas.
- Cómo informar un problema.
- Fecha de última revisión.

### FUN-010 — Estado de enlaces y demo

- Comprobación automática de enlaces internos en CI.
- Smoke de landing, login, repo, API docs y case study.
- No bloquear la landing porque el backend esté dormido.

## 18. Accesibilidad específica

| ID | Mejora | Verificación |
|---|---|---|
| A11Y-LAND-001 | Aumentar cuerpo mínimo a 16 px en contenido principal | Inspección y zoom 100/200/400% |
| A11Y-LAND-002 | Corregir contraste de supporting text y labels | Medición 4.5:1 o criterio aplicable |
| A11Y-LAND-003 | Header sticky no tapa foco ni headings | Keyboard + hash navigation |
| A11Y-LAND-004 | Tabs/product previews tienen patrón completo | Keyboard, screen reader y estados ARIA |
| A11Y-LAND-005 | Capturas tienen captions/alt adecuados | Revisión manual |
| A11Y-LAND-006 | Workflow conserva orden semántico | Screen reader outline |
| A11Y-LAND-007 | Tabla de permisos usa caption, th y scope | DOM + lector |
| A11Y-LAND-008 | Motion desactivable | prefers-reduced-motion |
| A11Y-LAND-009 | Todos los CTA alcanzan target táctil | Medición ≥44 px recomendado |
| A11Y-LAND-010 | Lightbox/panel controla foco correctamente | Tab, Shift+Tab, Escape, return focus |
| A11Y-LAND-011 | No hay información solo en hover | Keyboard/touch review |
| A11Y-LAND-012 | 320 px sin scroll horizontal global | Responsive inspection |

## 19. Rendimiento

### Riesgos de las mejoras

Las capturas, vídeos y fuentes pueden degradar la landing. La evidencia visual solo aporta valor si no vuelve lenta la primera impresión.

### Presupuesto

- Hero screenshot responsive: ≤250 KiB.
- Cada screenshot secundaria: ≤180 KiB.
- Vídeos cortos: objetivo ≤1.5 MiB cada uno; máximo dos cargados bajo demanda.
- JS específico de landing: ≤100 KiB gzip, excluyendo app autenticada.
- No importar librería de animación si CSS/IntersectionObserver resuelve el único efecto.
- No cargar bundle `/app` desde `/`.

### Objetivos

- LCP ≤2.5 s.
- CLS ≤0.1.
- INP ≤200 ms.
- Hero renderizado con contenido útil aunque la captura tarde.
- Capturas con `width`, `height`, `srcset` y `sizes`.

## 20. Responsive

### Desktop

- Hero 46/54 o 44/56 a favor del producto.
- Capturas grandes y texto con ancho controlado.
- Alternancia compositiva entre secciones.

### Tablet

- Hero puede conservar dos columnas si la captura sigue legible.
- Engineering pasa a diagrama superior + decisiones inferiores.
- Footer 2×2.

### Mobile

- Copy antes de medio.
- H1 42–48 px.
- Producto mostrado con recorte preparado, no screenshot desktop microscópica.
- Workflow vertical.
- Product tabs accesibles con scroll local o selector.
- Tabla de permisos con scroll local y primera columna sticky, o cards equivalentes.
- Engineering sin diagrama ilegible; usar secuencia textual.
- Footer apilado.

## 21. Copy revisado

### Header

- Product
- Workflow
- Engineering
- Case study
- Open live demo

### Hero support line

> Plan client work, assign clear ownership, move delivery forward, and keep every important change accountable.

### Proof strip

> React · NestJS · PostgreSQL · Two real permission levels · Daily-reset demo

### Product section eyebrow

> Real product evidence

### Engineering section subtitle

> The portfolio value is in the decisions: contract-first integration, server-enforced permissions, atomic history, and conflict-safe updates.

### Quality section subtitle

> Tested where failure matters: permissions, transactions, keyboard workflows, and public-demo recovery.

### Final CTA support

> No registration required. Choose a role and explore the same workflow under different permissions.

## 22. Elementos que deben eliminarse o evitarse

- Exceso de altura vacía en el hero.
- Texto secundario de 11–12 px.
- Sección `Explore the product` sin capturas reales.
- Listas de stack como contenido principal.
- Repetición de fondos gris/blanco con el mismo patrón exacto.
- Tarjetas del mismo tamaño para toda la información.
- Azul como única señal de identidad.
- Shadows/glows difusos que disminuyen nitidez del producto.
- Enlaces placeholder.
- Animación al hacer scroll en cada sección.
- Métricas inventadas o cobertura presentada sin contexto.
- Iconos de check sin texto.

## 23. Priorización

### P0 — Necesario antes de publicar en el portafolio

1. Reconstruir `Explore the product` con capturas reales.
2. Corregir hero: altura, escala, screenshot y proof strip.
3. Aumentar tipografía y contraste del cuerpo completo.
4. Reconstruir Engineering con decisiones y enlaces reales.
5. Convertir Quality en evidencia verificable.
6. Mejorar case study teaser y transparencia del rol.
7. Añadir manejo visible del cold start.
8. Validar responsive, teclado, foco, reduced motion y enlaces.

### P1 — Alto valor después del P0

1. Desarrollar `the brief line` en hero/workflow/engineering.
2. Revisar paleta hacia `ink/canvas/signal`.
3. Añadir previews ampliables y deep links.
4. Mejorar tabla de permisos con caso negativo real.
5. Mejorar header sticky y footer.
6. Crear Open Graph definitivo.

### P2 — Pulido opcional

1. Vídeos silenciosos de 8–12 segundos.
2. Reveal único del workflow.
3. Estado público de versión/demo en footer.
4. Prueba moderada de comprensión con cinco evaluadores.

## 24. Plan de ejecución

### Fase 1 — Jerarquía y legibilidad, 4–6 h

- Ajustar contenedor y spacing.
- Reducir hero.
- Actualizar escala tipográfica.
- Corregir contraste.
- Mejorar header/footer.

### Fase 2 — Evidencia de producto, 5–8 h

- Seleccionar escenarios reales.
- Crear capturas responsive.
- Reconstruir product explorer.
- Añadir deep links.
- Mejorar permisos con caso negativo.

### Fase 3 — Narrativa técnica, 4–6 h

- Diagrama y decisiones de Engineering.
- Evidencia de Quality.
- Case study teaser.
- Enlaces a documentos reales.

### Fase 4 — Identidad y motion, 3–5 h

- Implementar `the brief line`.
- Afinar paleta.
- Añadir un único momento de motion.
- Reduced motion.

### Fase 5 — Hardening, 3–5 h

- Cold start.
- Responsive completo.
- Auditoría a11y.
- Performance y metadata.
- Links/smoke tests.

### Estimación total

**19–30 horas**, dependiendo de si se producen vídeos y una página de case study independiente.

## 25. Criterios de aceptación globales

- El primer viewport muestra H1, propuesta, CTA y una captura legible del producto.
- Un evaluador puede identificar el producto en menos de 30 segundos.
- `Explore the product` contiene tres escenarios reales y no solo texto.
- Cada afirmación técnica importante enlaza a evidencia real.
- Engineering comunica decisiones, no solo nombres de tecnologías.
- Quality comunica pruebas y limitaciones con datos actuales.
- El caso de estudio declara origen y responsabilidad con honestidad.
- La página no contiene texto significativo por debajo de 14 px y usa 16 px o más como base.
- El producto funciona a 320 px y 400% zoom sin pérdida ni scroll horizontal global.
- El recorrido completo es operable con teclado.
- Reduced motion elimina animaciones no esenciales.
- El cold start tiene estado explicado y recuperable.
- Todos los links productivos pasan verificación automática.
- La landing no carga el bundle completo de la aplicación.
- LCP, CLS e INP cumplen los objetivos definidos o cualquier desviación queda documentada.
- No existen testimonios, logos, métricas comerciales o clientes ficticios presentados como reales.

## 26. Definition of Done

La mejora estará completa cuando:

- P0 esté implementado íntegramente.
- P1 esté implementado o cada exclusión tenga una decisión registrada.
- Existan capturas definitivas de desktop y móvil.
- Se hayan probado Chrome, Firefox, Safari y Edge según la matriz del proyecto.
- Se hayan ejecutado axe y revisión manual de teclado, foco, zoom y reduced motion.
- La landing se haya probado con backend activo, dormido y no disponible.
- Los enlaces a demo, API, arquitectura, pruebas, accesibilidad, GitHub y case study sean reales.
- La página social Open Graph esté verificada.
- El README y el caso de estudio utilicen capturas coherentes con la landing final.
- Una revisión visual final confirme que ninguna sección se siente como placeholder o lista de CV.

## 27. Resultado esperado

La landing final no debe intentar impresionar por cantidad de efectos. Debe convencer porque presenta un sistema real, explica decisiones concretas y permite verificar cada afirmación importante.

El visitante debe terminar con tres ideas claras:

1. Briefline resuelve un problema empresarial comprensible.
2. La aplicación existe, funciona y está cuidada.
3. Quien la construyó sabe tomar decisiones de producto, frontend, backend, accesibilidad, seguridad y entrega.
