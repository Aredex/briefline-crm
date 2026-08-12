# Especificación de landing pública y footer — Briefline CRM

**Estado:** Aprobado para implementación  
**Versión:** 1.0  
**Fecha:** 2026-08-12  
**Owner:** Product & Architecture  
**Idioma del producto:** Inglés  
**Idioma del documento:** Español  
**Alcance:** Portfolio MVP  
**Requisitos relacionados:** OBJ-005, OBJ-006, NFR-ACC-001–004, NFR-PERF-001, NFR-RESP-001, NFR-DOC-001

## 1. Decisión

Briefline CRM tendrá:

- Una landing page pública en `/`.
- Un footer global pequeño, exclusivo de la landing pública.
- Ningún footer tradicional dentro de la aplicación autenticada.
- Un bloque secundario `About this project` al final de la navegación de la aplicación.

La landing forma parte del Portfolio MVP porque es el punto de entrada del evaluador. No se considera una web comercial independiente ni una simulación de empresa SaaS.

## 2. Problema

Enviar a un reclutador o posible cliente directamente a una pantalla de login obliga a entender el producto sin contexto. El evaluador no conoce el problema, el alcance, los roles ni las decisiones técnicas, y puede abandonar antes de descubrir el valor del proyecto.

La landing debe explicar y demostrar Briefline antes de pedir interacción con la demo.

## 3. Job to be Done

> Cuando evalúo un proyecto de portafolio, quiero entender rápidamente el problema, ver evidencia real del producto y acceder a su implementación técnica, para decidir si merece una exploración más profunda.

## 4. Audiencias

### Evaluador freelance

Busca evidencia de que el desarrollador entiende necesidades empresariales, define alcance y entrega software público utilizable.

### Reclutador o responsable técnico

Busca claridad arquitectónica, calidad de frontend, permisos reales, modelo de datos, pruebas y capacidad de explicar compromisos.

### Visitante exploratorio

Necesita comprender el producto sin documentación previa, registro ni datos propios.

## 5. Objetivos

| ID | Objetivo | Señal de éxito |
|---|---|---|
| LAND-GOAL-001 | Comunicar el propósito del producto inmediatamente | Un evaluador nuevo describe correctamente Briefline en menos de 30 segundos |
| LAND-GOAL-002 | Llevar al visitante a una demo funcional | El CTA principal abre el recorrido demo sin registro |
| LAND-GOAL-003 | Demostrar competencias técnicas sin abrumar | Arquitectura, seguridad, accesibilidad y pruebas se entienden mediante una sección escaneable |
| LAND-GOAL-004 | Conectar producto, repositorio y caso de estudio | GitHub, documentación técnica, API y caso de estudio son accesibles desde la landing |
| LAND-GOAL-005 | Mantener coherencia con el CRM | La landing y la aplicación comparten tokens, tipografía, vocabulario y calidad visual |

## 6. No objetivos

- No vender una suscripción ni mostrar precios.
- No captar leads, emails ni newsletter.
- No fingir clientes, testimonios, ingresos, adopción o métricas comerciales.
- No explicar exhaustivamente cada endpoint o tabla.
- No duplicar la aplicación mediante una demo interactiva falsa.
- No añadir un blog, changelog público o centro de ayuda.
- No incorporar analítica de terceros en el MVP.
- No crear un footer dentro de las vistas operativas del CRM.

## 7. Arquitectura de rutas

| Ruta | Acceso | Propósito |
|---|---|---|
| `/` | Público | Landing del caso de estudio |
| `/login` | Público | Login y selección de cuenta demo |
| `/case-study` | Público | Caso de estudio completo; puede integrarse con el portafolio principal |
| `/accessibility` | Público | Declaración de accesibilidad del proyecto |
| `/app` | Autenticado | Dashboard |
| `/app/tasks` | Autenticado | Tablero/lista de tareas |
| `/app/tasks/:taskId` | Autenticado | Detalle direccionable de tarea |
| `/app/clients` | Autenticado | Clientes |
| `/app/clients/:clientId` | Autenticado | Detalle de cliente |
| `/app/users` | Admin | Usuarios |
| `/app/profile` | Autenticado | Perfil |
| `/api/v1/*` | Según contrato | API REST |
| `/api/docs` | Público de solo lectura | OpenAPI/Swagger del caso de estudio |
| `/api/docs-json`, `/api/docs-yaml` | Público de solo lectura | Artefacto OpenAPI 3.1 crudo (mismo documento que `packages/api-contract/openapi.yaml`) |

### Reglas de navegación

- Un visitante autenticado puede seguir abriendo `/`; no será redirigido automáticamente al dashboard.
- `Open live demo` conduce a `/login`.
- Los CTA de rol pueden usar `/login?demo=admin` y `/login?demo=member` para seleccionar la cuenta, sin autenticar automáticamente mediante GET.
- `/app/*` conserva el destino solicitado cuando redirige a login.
- La landing y la aplicación se despliegan bajo el mismo origen.

## 8. Principio de contenido

La página debe seguir esta secuencia narrativa:

```text
Understand the problem
        ↓
See the workflow
        ↓
Inspect the real product
        ↓
Understand permissions and engineering
        ↓
Open the demo or inspect the work
```

Cada sección debe responder una pregunta distinta. No se repetirán las mismas características con títulos diferentes.

## 9. Header público

### Contenido

**Identidad**

- Wordmark `Briefline`, enlazado a `/`.

**Navegación**

- `Product` → sección de producto.
- `Workflow` → sección de flujo.
- `Engineering` → sección técnica.
- `Case study` → `/case-study`.
- `GitHub` → repositorio público.

**Acción principal**

- `Open live demo` → `/login`.

### Comportamiento

- Sticky solo después de abandonar el hero.
- Fondo sólido o ligeramente translúcido con contraste suficiente.
- El estado activo no dependerá solo del color.
- En móvil, menú colapsado mediante botón nativo con nombre accesible y estado expandido.
- `Escape` cierra el menú móvil y devuelve el foco al botón.
- Habrá un enlace `Skip to main content` como primer elemento enfocable.

## 10. Secciones de la landing

### LAND-SEC-001 — Hero

**Propósito:** comunicar la tesis y ofrecer acceso inmediato a la demo.

**Copy aprobado**

Eyebrow:

> Full-stack portfolio case study

H1:

> Client work, clearly owned.

Texto:

> Briefline connects client context, priorities, ownership, and change history in one focused workspace for small digital agencies.

CTA principal:

> Open live demo

CTA secundario:

> View case study

Enlace terciario:

> Explore the source on GitHub

Nota:

> Try the administrator and member accounts. All data is fictional and resets daily.

**Visual**

- Captura real del tablero en escritorio.
- Debe mostrar backlog, al menos tres estados activos, prioridades, responsables y un cliente.
- No utilizar mockup tridimensional ni interfaz inventada.
- El elemento `the brief line` conecta cliente, backlog, responsable, progreso e historial.

**Criterios de aceptación**

- H1 y CTA principal aparecen en el primer viewport de escritorio y móvil.
- Sin JavaScript, el contenido y enlaces principales siguen disponibles.
- La imagen tiene alternativa textual apropiada.
- La imagen reserva dimensiones para evitar layout shift.

### LAND-SEC-002 — Problema y respuesta

**Propósito:** demostrar comprensión del contexto empresarial.

Columna A:

**When client work lives everywhere**

- Ownership becomes unclear.
- Priorities drift.
- Blocked work loses context.
- Important changes disappear into chat history.

Columna B:

**Briefline creates one operational view**

- Every task has context.
- Every active task has an owner.
- Every important change is recorded.
- Every role receives appropriate permissions.

**Criterios de aceptación**

- Las columnas se convierten en secuencia vertical lógica en móvil.
- La relación problema/solución no depende de posición o color.
- No usar una cuadrícula genérica de tarjetas e iconos.

### LAND-SEC-003 — Flujo de trabajo

**Propósito:** explicar el modelo operacional y convertir el nombre Briefline en una identidad visual.

```text
CLIENT
  │  Brief and context
  ▼
BACKLOG
  │  Prioritize and assign
  ▼
ACTIVE WORK
  │  Pending → In progress → Blocked
  ▼
COMPLETED
  │  Close or reopen
  ▼
AUDITED
     Trace every important change
```

**Diseño**

- Una línea continua conecta las cinco etapas.
- Cada etapa incluye una captura recortada o elemento real del producto.
- La línea codifica progreso; no es decoración independiente.
- Puede animarse una sola vez al entrar en viewport.
- Con `prefers-reduced-motion: reduce`, se presenta estática.

**Criterios de aceptación**

- Las etapas existen como HTML, no como texto dentro de una imagen.
- El orden es comprensible para lector de pantalla.
- La sección funciona completamente sin animación.

### LAND-SEC-004 — Producto real

**Propósito:** mostrar funcionamiento real antes de abrir la demo.

Tres vistas seleccionables:

1. `Plan work`: cliente, contexto, backlog y creación de tarea.
2. `Coordinate delivery`: responsables, filtros, prioridades y movimiento de estado.
3. `Keep accountability`: permisos, historial y recuperación ante conflicto.

Copy de cierre:

> Explore the complete workflow in the live demo.

**Medios permitidos**

- Capturas reales optimizadas.
- Vídeos silenciosos opcionales de 8–12 segundos con poster estático.
- No autoplay con sonido.
- No interacción ficticia que sugiera que el preview es la aplicación real.

**Criterios de aceptación**

- Los selectores son botones o tabs accesibles.
- Todo vídeo tiene pausa y alternativa estática.
- El primer medio no bloquea el LCP.
- Los medios secundarios usan lazy loading.

### LAND-SEC-005 — Roles y permisos

**Propósito:** convertir la autorización en evidencia visible de ingeniería.

| Capability | Administrator | Member |
|---|---:|---:|
| View team tasks | Yes | Yes |
| Create tasks and clients | Yes | Yes |
| Edit any task | Yes | No |
| Edit owned or assigned tasks | Yes | Yes |
| Manage users | Yes | No |
| Archive records | Yes | No |
| View task history | Yes | Yes |

Mensaje:

> Permissions are enforced by the API, not only hidden in the interface.

**Criterios de aceptación**

- Tabla semántica con caption disponible.
- `Yes` y `No` aparecen como texto, no solo iconos o color.
- En móvil utiliza scroll local o representación equivalente sin provocar scroll horizontal de página.

### LAND-SEC-006 — Ingeniería

**Propósito:** permitir evaluación técnica sin convertir la landing en documentación exhaustiva.

Capacidades:

- React 19 + TypeScript.
- NestJS REST API.
- PostgreSQL + Prisma.
- OpenAPI contract.
- JWT cookie authentication and CSRF protection.
- Object-level authorization.
- Transactional change history.
- Optimistic concurrency control.
- Automated and manual accessibility testing.
- Reproducible public deployment.

Diagrama:

```text
React application
       │
       │ OpenAPI contract
       ▼
NestJS API ────── PostgreSQL
       │
       ├── Authentication
       ├── Object permissions
       └── Atomic history
```

Acciones:

- `Read the architecture`.
- `Open API documentation`.
- `View the repository`.

**Criterios de aceptación**

- El diagrama tiene equivalente textual.
- Los enlaces solo se muestran cuando existe un destino real.
- No se publican secretos ni detalles operativos sensibles.

### LAND-SEC-007 — Calidad y accesibilidad

**Propósito:** demostrar evidencia, no solo enumerar tecnologías.

- WCAG 2.2 AA target.
- Keyboard-complete task movement.
- Accessible alternative to drag-and-drop.
- PostgreSQL integration tests.
- Negative authorization tests.
- Playwright end-to-end journeys.
- Daily demo reset.

**Criterios de aceptación**

- Las afirmaciones enlazan a evidencia pública cuando sea razonable.
- No se publican porcentajes de cobertura sin contexto.
- Lighthouse se presenta como señal auxiliar, nunca como certificación WCAG.

### LAND-SEC-008 — Resumen del caso de estudio

**Propósito:** explicar el trabajo y su procedencia con honestidad.

- `Context`: Inspired by a freelance marketplace brief.
- `Challenge`: Transform an ambiguous request into a credible product.
- `Role`: Product definition, UX, frontend, backend, data, testing, and deployment.
- `Constraints`: Public demo, two roles, realistic scope, and low-cost hosting.
- `Outcome`: A deployed working product with documented engineering decisions.

CTA:

> Read the full case study

**Criterios de aceptación**

- No se atribuye el proyecto a un cliente real.
- No se presentan métricas, testimonios o resultados comerciales ficticios.
- El alcance personal del trabajo se describe con precisión.

### LAND-SEC-009 — CTA final

Headline:

> See how Briefline turns client context into accountable work.

Acciones:

- `Open administrator demo`.
- `Open member demo`.
- `View source code`.

**Criterios de aceptación**

- Cada acción tiene destino distinto y nombre explícito.
- La selección de rol prepara el login; no autentica mediante GET.
- El CTA funciona antes de cargar medios secundarios.

## 11. Footer público

### Propósito

Cerrar la landing con información global, enlaces de verificación y transparencia. No debe convertirse en una segunda navegación principal.

### Estructura

```text
┌────────────────────────────────────────────────────────────────────┐
│ Briefline                Product              Project              │
│ A full-stack CRM         Live demo            GitHub repository    │
│ workflow case study      Case study           Accessibility        │
│ for small agencies.      API documentation    Technical README     │
│                          Architecture         Main portfolio       │
├────────────────────────────────────────────────────────────────────┤
│ © 2026 [Portfolio owner]  Inspired by a real freelance brief.      │
│                           Fictional company and data.               │
└────────────────────────────────────────────────────────────────────┘
```

### Copy

Descripción:

> A full-stack CRM workflow case study for small digital agencies.

Declaración inferior:

> Built as a portfolio case study. Inspired by a real freelance brief. Fictional company and data.

### Enlaces

**Product**

- Live demo.
- Case study.
- API documentation.
- Architecture.

**Project**

- GitHub repository.
- Accessibility statement.
- Technical README.
- Main portfolio.

### Requisitos

| ID | Requisito |
|---|---|
| FOOT-001 | El footer será un `<footer>` top-level y el único landmark `contentinfo` de la página |
| FOOT-002 | Todos los enlaces tendrán nombres comprensibles fuera de contexto |
| FOOT-003 | Los enlaces inexistentes se omitirán; no usar `#` como placeholder productivo |
| FOOT-004 | El año podrá calcularse, pero el contenido esencial será visible sin JavaScript |
| FOOT-005 | En móvil, identidad, Product y Project se apilarán en ese orden |
| FOOT-006 | Conservará contraste, foco visible y objetivos táctiles mínimos |
| FOOT-007 | No contendrá formularios, newsletter, pricing, testimonios o redes vacías |

La WAI recomienda utilizar un footer global como región de información del documento y evitar múltiples landmarks `contentinfo` sin necesidad: [W3C Contentinfo Landmark](https://www.w3.org/WAI/ARIA/apg/patterns/landmarks/examples/contentinfo.html).

## 12. Aplicación autenticada: sin footer tradicional

El CRM no tendrá footer al final del contenido ni barra inferior de marketing.

### Bloque `About this project`

Se ubicará al final de la navegación lateral en escritorio y dentro del menú de cuenta/ayuda en móvil.

- `About this project` → landing o caso de estudio.
- `API docs`.
- `GitHub`.
- Versión visible, por ejemplo `v1.0.0`.

### Reglas

- Es secundario respecto a Tasks, Clients y Users.
- No permanece fijo sobre el contenido móvil.
- No incluye copyright, newsletter ni explicación larga.

## 13. Dirección visual

### Concepto

Una herramienta operativa precisa presentada con sensibilidad editorial. La landing debe sentirse como la introducción al mismo sistema, no como una plantilla SaaS independiente.

### Paleta

| Token | Valor | Uso principal |
|---|---|---|
| `ink` | `#17201B` | Texto principal y superficies de alto contraste |
| `canvas` | `#F5F7F3` | Fondo general |
| `paper` | `#FFFFFF` | Capturas, paneles y superficies elevadas |
| `signal` | `#3D6B57` | CTA, foco, selección y señales positivas |
| `amber` | `#C9822D` | Prioridad, atención y detalles puntuales |
| `line` | `#D8DED9` | Divisores y estructura |

Los estados del CRM conservarán sus tokens funcionales. Ningún estado dependerá únicamente de la paleta.

### Tipografía

- Display/headings: `Archivo Variable`.
- Body/UI: `Public Sans Variable`.
- Data/technical labels: `IBM Plex Mono`.
- Las fuentes deben ser open source y autoalojadas o cargadas sin bloquear el primer render.

### Layout

- Contenedor máximo de 1200–1280 px.
- Ritmo vertical generoso, con densidad creciente cerca de las capturas.
- Divisores y labels codifican secciones reales.
- Una sola firma visual fuerte: `the brief line`.
- Sombras escasas; jerarquía mediante espacio, contraste y bordes.

### Elementos prohibidos

- Gradientes decorativos dominantes.
- Fondo negro con acento neón genérico.
- Mockups 3D flotantes.
- Carrusel automático.
- Nubes de logos ficticios.
- Contadores animados sin significado.
- Cuadrícula de características idénticas con iconos genéricos.
- Cursores personalizados o scroll hijacking.

## 14. Motion

- El hero puede revelar texto y captura mediante una secuencia breve.
- `The brief line` puede dibujarse una vez al entrar en viewport.
- Microtransiciones: aproximadamente 140–220 ms.
- No habrá animación ambiental continua.
- Reduced motion elimina desplazamientos, dibujo de línea y autoplay.
- Los cambios de previews no mueven el foco automáticamente.

## 15. Responsive

### Desktop, ≥1024 px

- Hero dividido entre copy y captura.
- Problema/solución en dos columnas.
- Flujo horizontal o diagonal controlado.
- Footer en tres columnas más franja inferior.

### Tablet, 768–1023 px

- Hero mantiene dos columnas solo si conserva legibilidad.
- Flujo convertido en eje vertical.
- Navegación principal reducida o colapsada.

### Mobile, 320–767 px

- Hero en una columna, copy antes del medio.
- CTA principal usa el ancho disponible.
- Capturas usan recorte preparado, no reducción ilegible.
- Tablas usan scroll local o representación apilada.
- Footer apilado.
- Sin scroll horizontal de página.

## 16. Accesibilidad

| ID | Requisito |
|---|---|
| LAND-ACC-001 | La landing apunta a WCAG 2.2 AA |
| LAND-ACC-002 | Incluye `header`, `nav`, un único `main` y un único footer global `contentinfo` |
| LAND-ACC-003 | Incluye skip link visible al recibir foco |
| LAND-ACC-004 | Todos los controles y enlaces son operables con teclado |
| LAND-ACC-005 | El foco es visible y no queda oculto por el header sticky |
| LAND-ACC-006 | La jerarquía de headings es lógica y cada sección tiene nombre descriptivo |
| LAND-ACC-007 | Texto normal alcanza 4.5:1; controles y texto grande, al menos 3:1 según corresponda |
| LAND-ACC-008 | Información, prioridad y permisos no dependen solo de color |
| LAND-ACC-009 | Conserva contenido y funcionalidad a 320 CSS px y 400% zoom |
| LAND-ACC-010 | Motion respeta reduced motion |
| LAND-ACC-011 | Vídeos disponen de pausa y alternativa estática; no tienen audio automático |
| LAND-ACC-012 | Capturas y diagramas tienen alternativa textual adecuada |

## 17. Rendimiento

### Presupuesto

- JavaScript propio de la landing: objetivo ≤100 KiB gzip, excluyendo la aplicación autenticada.
- CSS crítico: objetivo ≤30 KiB gzip.
- Imagen hero: objetivo ≤250 KiB en formato moderno y responsive.
- No cargar el bundle principal de `/app` al visitar `/`.
- Lazy-load de medios bajo el primer viewport.
- Fonts con subsets y `font-display: swap`.

### Objetivos

- LCP ≤2.5 s.
- CLS ≤0.1.
- INP ≤200 ms.
- Lighthouse Performance objetivo ≥90 como diagnóstico de laboratorio.

Los Core Web Vitals se verificarán durante la entrega y no se darán por garantizados por una ejecución local: [web.dev Core Web Vitals](https://web.dev/explore/learn-core-web-vitals).

## 18. SEO y metadatos

### Title

> Briefline CRM — Full-stack workflow case study

### Description

> A full-stack CRM workflow case study for small digital agencies, built with React, NestJS, PostgreSQL, Prisma, role-based permissions, and transactional change history.

### Requisitos

- Canonical hacia la URL pública definitiva.
- Open Graph title, description e imagen real del producto.
- Social card compatible aunque no exista cuenta social.
- Favicon y theme color coherentes.
- `lang="en"` en el producto.
- No indexar rutas autenticadas ni entornos preview.
- La landing no afirmará ser un producto comercial disponible para compra.

## 19. Privacidad y seguridad

- No recopilar formularios ni datos personales.
- No instalar analítica de terceros en el MVP.
- Todos los datos demo son ficticios.
- No incrustar secretos o credenciales privadas en HTML o JavaScript.
- Las credenciales demo públicas están aisladas de sistemas reales.
- Los medios no incorporan tracking innecesario.

## 20. Estados y fallos

- Si la demo no está disponible, explicar cold start o indisponibilidad y ofrecer `Retry`, GitHub y case study.
- Si un medio falla, el contenido textual sigue explicando la capacidad.
- No mostrar enlaces documentales hasta que exista destino publicable.
- Header y footer no dependen de datos de API.
- La landing debe cargar aunque el backend esté dormido temporalmente.

## 21. Métricas de evaluación

No se instalará tracking en el MVP. Se medirán mediante pruebas moderadas:

| Métrica | Objetivo |
|---|---|
| Comprensión del propósito | 4 de 5 evaluadores describen correctamente el producto en ≤30 s |
| Descubrimiento de demo | 5 de 5 encuentran el CTA principal sin ayuda |
| Descubrimiento técnico | 4 de 5 localizan repositorio o arquitectura en ≤60 s |
| Recorrido inicial | 4 de 5 llegan a login y eligen rol sin explicación |
| Accesibilidad automática | Cero violaciones serious/critical en axe |
| Calidad de entrega | Sin enlaces rotos ni placeholders en producción |

## 22. Historias de usuario

- **LAND-US-001:** Como evaluador freelance, quiero entender el problema y el flujo antes de iniciar sesión, para decidir si la solución es relevante.
- **LAND-US-002:** Como reclutador técnico, quiero ver arquitectura, seguridad y pruebas, para evaluar el trabajo más allá de la interfaz.
- **LAND-US-003:** Como visitante, quiero abrir una demo con un rol conocido y datos ficticios, para explorar sin crear cuenta.
- **LAND-US-004:** Como usuario de teclado o tecnología asistiva, quiero recorrer contenido, previews y navegación sin barreras.
- **LAND-US-005:** Como evaluador interesado, quiero pasar de la demo al código, API, arquitectura y caso de estudio.

## 23. Criterios de aceptación end-to-end

### LAND-AC-001 — Comprensión y acceso

**Given** un visitante nuevo abre `/`  
**When** revisa el primer viewport  
**Then** identifica que Briefline es un CRM/workflow de agencia y encuentra `Open live demo`.

### LAND-AC-002 — Demo por rol

**Given** selecciona `Open administrator demo`  
**When** llega a `/login?demo=admin`  
**Then** la cuenta admin queda seleccionada o rellenada sin autenticar mediante GET.

### LAND-AC-003 — Evidencia técnica

**Given** llega a Engineering  
**When** selecciona arquitectura, API o repositorio  
**Then** abre un destino real, coherente y de solo lectura cuando corresponda.

### LAND-AC-004 — Navegación accesible

**Given** usa únicamente teclado y reduced motion  
**When** recorre header, contenido, previews, CTA y footer  
**Then** todas las acciones son accesibles, el foco es visible y no se ejecutan movimientos innecesarios.

### LAND-AC-005 — Degradación segura

**Given** un medio o la API no están disponibles  
**When** la landing carga  
**Then** contenido principal, enlaces documentales y explicación siguen disponibles.

### LAND-AC-006 — Aplicación sin footer

**Given** un usuario navega por `/app/*`  
**When** consulta vistas operativas  
**Then** no aparece footer de marketing y los enlaces del proyecto permanecen secundarios.

## 24. Dependencias

- UX-001/UX-002: wireframes y tokens definitivos.
- PH-07: app shell y routing.
- PH-10: producto integrado para capturas reales.
- PH-11: evidencia de accesibilidad, seguridad y pruebas.
- PH-12: URLs públicas, Swagger y demo desplegada.
- PH-13: README, arquitectura y caso de estudio publicables.

## 25. Secuencia de implementación

### Etapa A — Estructura

- Congelar sitemap, copy, dirección visual y header/footer.
- Implementar estructura semántica.
- Implementar responsive y accesibilidad base.

### Etapa B — Producto real

- Sustituir previews por capturas reales.
- Grabar medios cortos solo si aportan más que capturas.
- Integrar rutas demo y enlaces técnicos reales.

### Etapa C — Entrega

- Pruebas de comprensión.
- Auditoría de enlaces, accesibilidad, rendimiento y SEO.
- Open Graph definitivo.
- Validar que copy, arquitectura y stack coinciden con la implementación.

## 26. Estimación

| Trabajo | Estimación |
|---|---:|
| Arquitectura de contenido y copy | 2–3 h |
| Diseño visual y responsive | 3–5 h |
| Implementación de landing y footer | 5–8 h |
| Capturas, vídeos y caso de estudio | 3–5 h |
| Accesibilidad, rendimiento y pruebas | 2–3 h |
| **Total** | **15–24 h** |

El trabajo se añade al Portfolio MVP. Los componentes, tokens y pruebas compartidos con PH-07/PH-11 no deben contabilizarse dos veces.

## 27. Definition of Done

- Landing disponible en `/` y aplicación bajo `/app`.
- Copy aprobado implementado en inglés.
- Capturas y medios proceden del producto real.
- Header, secciones, CTA y footer cumplen esta especificación.
- No existe footer tradicional dentro de la aplicación.
- No existen testimonios, clientes, métricas o afirmaciones ficticias.
- Todos los enlaces productivos tienen destino real.
- Teclado, foco, reduced motion, 320 px y 400% verificados.
- Axe no reporta violaciones serious/critical conocidas.
- Presupuesto de rendimiento y Core Web Vitals evaluados.
- Metadata y Open Graph verificados.
- Demo, GitHub, API, arquitectura, accesibilidad, README y portafolio son alcanzables cuando estén publicados.
- Documentación y plan maestro reflejan rutas y esfuerzo añadido.

## 28. Impacto en el plan maestro

La siguiente actualización del plan maestro debe:

- Reservar `/` para la landing y mover las vistas autenticadas bajo `/app`.
- Añadir una épica `LAND` entre PH-07 y PH-13.
- Añadir pruebas de landing en PH-11.
- Añadir smoke checks de `/`, enlaces, metadata y deep links en PH-12.
- Añadir prueba de comprensión y caso de estudio en PH-13.
- Sumar 15–24 horas, descontando trabajo compartido identificado.

