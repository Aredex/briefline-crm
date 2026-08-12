# Decision Log

## Convenciones

- `Confirmed`: decisión aceptada.
- `Provisional`: recomendación pendiente de validación.
- `Open`: decisión todavía no tomada.

| ID | Estado | Decisión | Motivo o nota |
|---|---|---|---|
| DEC-001 | Confirmed | Caso de estudio inspirado en un brief freelance, sin atribuirlo a un cliente real | Presentación transparente del trabajo de portafolio |
| DEC-002 | Confirmed | Audiencia dual: clientes freelance y reclutadores técnicos | Maximiza la utilidad del caso de estudio |
| DEC-003 | Confirmed | Posicionamiento full-stack con fortaleza frontend | Define qué decisiones deben ser visibles en la demo |
| DEC-004 | Confirmed | Contexto de pequeña agencia o equipo comercial | Aporta coherencia empresarial sin exigir un CRM completo |
| DEC-005 | Confirmed | Se permite `CRM` en el nombre | Preferencia del propietario del portafolio |
| DEC-006 | Confirmed | Roles `ADMIN` y `MEMBER` | Alcance de autorización solicitado |
| DEC-007 | Confirmed | Backlog separado y cuatro estados activos | Modelo inicial del flujo de trabajo |
| DEC-008 | Confirmed | Prioridades Low, Medium, High y Urgent | Clasificación inicial de tareas |
| DEC-009 | Confirmed | Arrastrar y soltar con alternativa accesible | Demostración visual sin depender exclusivamente del puntero |
| DEC-010 | Confirmed | Archivado en lugar de eliminación física | Conserva trazabilidad e historial |
| DEC-011 | Confirmed | JWT simple sin registro, recuperación ni renovación en el MVP | Mantiene el foco dentro del límite temporal |
| DEC-012 | Confirmed | React + NestJS + PostgreSQL + Prisma | Equilibrio entre demostración técnica y productividad |
| DEC-013 | Confirmed | Producto y repositorio en inglés; planificación también en español | Alcance internacional sin añadir i18n al producto |
| DEC-014 | Confirmed | Despliegue público de bajo coste con datos ficticios reiniciables | Facilita la evaluación segura del portafolio |
| DEC-015 | Confirmed | Pruebas unitarias críticas, integración de API y 2–3 flujos E2E | Cobertura proporcionada al riesgo |
| DEC-016 | Confirmed | Documentar tanto el alcance 12–20 h como la estimación profesional | Hace visibles los compromisos de planificación |
| DEC-017 | Confirmed | Repositorio independiente dentro del espacio actual | Organización solicitada |
| DEC-018 | Confirmed | Objetivo WCAG 2.2 AA para flujos principales | Calidad apropiada para una aplicación pública de portafolio |
| DEC-019 | Confirmed | `Client` básico en el MVP y `Contact` separado en Portfolio Complete | Hace legítimo el contexto CRM sin desbordar el MVP |
| DEC-020 | Confirmed | Nombre de trabajo `Briefline CRM` | Vincula briefs de clientes con ejecución; comprobación web inicial sin producto CRM homónimo |
| DEC-021 | Confirmed | Un único responsable por tarea | Simplifica propiedad, permisos y filtros |
| DEC-022 | Confirmed | Backlog como estado real; responsable obligatorio al entrar al flujo activo | Expresa una regla de negocio demostrable |
| DEC-023 | Confirmed | Motivo obligatorio para tareas bloqueadas | Evita un estado bloqueado sin contexto operativo |
| DEC-024 | Confirmed | Transiciones libres y reapertura de tareas completadas | Reduce fricción y complejidad de máquina de estados en el MVP |
| DEC-025 | Confirmed | Board en escritorio y lista adaptada en móvil | Evita un kanban horizontal deficiente en pantallas pequeñas |
| DEC-026 | Confirmed | Tema claro único en el MVP | Prioriza pulido y accesibilidad sobre amplitud visual |
| DEC-027 | Confirmed | Portfolio Complete añadirá contactos, comentarios, etiquetas, checklist y vista de lista | Agrupa ampliaciones de alto valor demostrativo |
| DEC-028 | Confirmed | Notificaciones, adjuntos, tiempo real, menciones y subtareas quedan en Future Roadmap | Control de alcance |
| DEC-029 | Confirmed | No se puede degradar ni desactivar al último administrador | Protege la capacidad de administración del sistema |
| DEC-030 | Confirmed | Product & Architecture decidirá autónomamente el producto y la solución | El propietario delegó las decisiones profesionales; solo se escalarán decisiones personales, económicas o irreversibles |
| DEC-031 | Confirmed | Monorepo con `apps/web`, `apps/api` y contrato OpenAPI versionado | Permite trabajo paralelo sin duplicar modelos manuales |
| DEC-032 | Confirmed | JWT en cookie HttpOnly same-origin, sin refresh token, con CSRF | Evita Web Storage y mantiene el alcance de sesión simple |
| DEC-033 | Confirmed | Errores RFC 9457 con códigos de dominio y traceId | Contrato estándar y accionable sin filtrar internals |
| DEC-034 | Confirmed | UUID públicos y optimistic locking mediante `Task.version` | Reduce colisiones y evita sobrescrituras silenciosas |
| DEC-035 | Confirmed | No habrá orden manual de tarjetas en el MVP | DnD cambia estado; el orden determinista reduce complejidad |
| DEC-036 | Confirmed | Producción same-origin con Nest sirviendo la SPA | Simplifica cookies seguras, CORS y despliegue gratuito |
| DEC-037 | Confirmed | Render Web Service + Neon PostgreSQL como despliegue recomendado | Evita la caducidad de Render Free Postgres; acepta cold start documentado |
| DEC-038 | Confirmed | Reset diario mediante GitHub Actions y script idempotente | No expone una operación destructiva pública |
| DEC-039 | Confirmed | Estimación MVP profesional de 93–126 h y Complete de 35–52 h | El brief de 12–20 h solo permite un prototipo recortado |
| DEC-040 | Confirmed | Ocultar el enlace a GitHub en la landing (footer y CTA final) mientras el repo no esté publicado, en vez de dejarlo apuntando a `github.com/username/briefline-crm` | Cumple FUN-006 ("ocultar cualquier enlace sin destino publicado"); no se renderiza un `<a>` deshabilitado ni `href="#"`. Se mantiene el enlace al deploy en vivo y a la documentación interna. Ver `.claude/plans/landing-audit-plan.md` §2 D1 |
| DEC-041 | Confirmed | Adoptar webfonts self-hosteadas: Archivo (display) + IBM Plex Mono (eyebrow/data/labels); cuerpo en Public Sans o system stack según legibilidad | Revierte la decisión previa de `tokens.css` ("system stack, no webfonts") en favor de la identidad editorial de la landing; subset `woff2` con `font-display: swap` y `preload` del display, coste estimado 45–60 KiB dentro del presupuesto de §19 de la auditoría. Ver `.claude/plans/landing-audit-plan.md` §2 D2 |
| DEC-042 | Confirmed | Los documentos de evidencia (`permission-matrix.md`, `test-matrix.md`, `data-model.md`, `adrs.md`) se enlazan desde la landing tal cual están en `.claude/plans/`, sin duplicarlos en `docs/` | Si D1/DEC-040 se resuelve más adelante (repo publicado), los enlaces relativos siguen funcionando sin cambios. Ver `.claude/plans/landing-audit-plan.md` §2 D3 |
