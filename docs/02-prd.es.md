# PRD — Briefline CRM

**Idioma:** Español  
**Estado:** Baseline v1  
**Owner:** Product & Architecture  
**Última actualización:** 2026-08-11  
**Documento equivalente en inglés:** `02-prd.en.md`

## 1. Propósito

Briefline CRM es una herramienta interna para pequeñas agencias digitales. Centraliza clientes, responsables y tareas para que el equipo pueda saber qué trabajo existe, quién lo atiende, qué está bloqueado, qué vence pronto y cómo ha cambiado cada elemento.

El producto es un caso de estudio de portafolio. Debe sentirse como una herramienta empresarial creíble, ser fácil de evaluar mediante una demo pública y mostrar decisiones profesionales de frontend, backend, datos, seguridad, accesibilidad y entrega.

## 2. Problema

Los equipos pequeños suelen distribuir el seguimiento de clientes y trabajo entre hojas de cálculo, mensajes y gestores personales. Esto produce:

- Responsabilidad poco clara.
- Trabajo atrasado u olvidado.
- Dificultad para priorizar.
- Ausencia de un historial confiable.
- Dependencia de conocimiento informal.
- Poca visibilidad para responsables de equipo.

## 3. Propuesta de valor

Briefline CRM ofrece una vista compartida y accionable del trabajo de clientes, con permisos simples, un tablero visual, filtros útiles y trazabilidad automática, sin la complejidad de un CRM empresarial completo.

## 4. Usuarios objetivo

### Agency administrator

Propietario, project lead u operations manager. Necesita visibilidad global, control de usuarios y capacidad para corregir asignaciones y prioridades.

### Agency member

Diseñador, desarrollador, marketer o account specialist. Necesita descubrir su trabajo, actualizarlo rápidamente y comprender el contexto del cliente.

### Portfolio evaluator

Cliente freelance o reclutador técnico. Necesita acceder sin registro, comprender el producto rápidamente y observar diferencias reales de permisos y calidad técnica.

## 5. Objetivos

| ID | Objetivo |
|---|---|
| OBJ-001 | Hacer visible todo el trabajo activo y su responsable |
| OBJ-002 | Reducir el esfuerzo necesario para priorizar y actualizar tareas |
| OBJ-003 | Mantener una trazabilidad fiable de cambios importantes |
| OBJ-004 | Aplicar permisos coherentes en interfaz y servidor |
| OBJ-005 | Proporcionar una demo pública segura, estable y comprensible |
| OBJ-006 | Demostrar competencia full-stack con especial atención a la experiencia frontend |

## 6. No objetivos

- Sustituir un CRM comercial con leads, deals, forecast o automatización de marketing.
- Gestionar facturación, pagos o contratos.
- Proporcionar colaboración en tiempo real.
- Ser una plataforma multiempresa o SaaS multi-tenant.
- Incluir un sistema configurable de workflows.
- Ser una aplicación móvil nativa.

## 7. Principios del producto

1. **Clarity before density:** cada pantalla debe priorizar decisiones, no cantidad de información.
2. **Server-enforced trust:** ningún permiso dependerá únicamente de la interfaz.
3. **Trace important change:** toda modificación de negocio relevante dejará evidencia.
4. **Fast demo comprehension:** un evaluador debe entender el producto en menos de dos minutos.
5. **Accessible alternatives:** ninguna acción crítica dependerá solo de color, ratón o drag-and-drop.
6. **Deliberate scope:** cada funcionalidad debe demostrar una competencia o resolver un problema central.

## 8. Alcance del Portfolio MVP

### Incluido

- Login con cuentas demo.
- Dashboard compacto.
- Clientes básicos y detalle de cliente.
- Tablero de tareas.
- Lista adaptada para móvil.
- Creación y edición de tareas.
- Asignación a un miembro.
- Backlog separado.
- Prioridades, búsqueda y filtros.
- Drag-and-drop con alternativa accesible.
- Archivado de tareas.
- Historial de cambios por tarea.
- Gestión de usuarios por administradores.
- Perfil propio básico.
- API REST versionada y documentada.
- Datos iniciales y reinicio periódico de demo.
- Pruebas críticas y despliegue público.

### Excluido

- Registro, invitaciones por correo, recuperación de contraseña y refresh tokens.
- Contactos múltiples por cliente.
- Comentarios, etiquetas y checklist.
- Adjuntos, notificaciones, menciones y tiempo real.
- Importación/exportación.
- Personalización de estados y prioridades.
- Eliminación física desde la aplicación.

## 9. Alcance de Portfolio Complete

- Contactos como entidad independiente y múltiples contactos por cliente.
- Vista de lista de escritorio con ordenación y paginación completa.
- Comentarios append-only en tareas.
- Etiquetas administrables.
- Checklist simple por tarea.
- Historial de cliente.
- Filtros persistidos en URL.
- Mejoras de accesibilidad y navegación avanzada por teclado.
- Mayor cobertura automatizada y documentación operativa.

## 10. Future Roadmap

- Notificaciones in-app y por correo.
- Archivos adjuntos.
- Menciones.
- Actualizaciones en tiempo real.
- Subtareas jerárquicas.
- Recuperación de contraseña y sesiones renovables.
- Invitaciones.
- Exportación CSV.
- Workspaces múltiples.
- Integraciones externas.
- Estados y campos configurables.

## 11. Modelo funcional

### User

- Full name.
- Email único, normalizado sin distinguir mayúsculas.
- Role: `ADMIN` o `MEMBER`.
- Status: `ACTIVE` o `INACTIVE`.
- Password hash.
- Last login at.
- Created at y updated at.

### Client

- Company name.
- Industry.
- Primary contact name.
- Primary contact email.
- Phone opcional.
- Status: `ACTIVE`, `INACTIVE` o `ARCHIVED`.
- Notes opcionales.
- Created by.
- Created at y updated at.

### Task

- Title.
- Description.
- Status: `BACKLOG`, `PENDING`, `IN_PROGRESS`, `BLOCKED`, `COMPLETED`.
- Priority: `LOW`, `MEDIUM`, `HIGH`, `URGENT`.
- Assignee opcional en backlog y obligatorio fuera de backlog.
- Client opcional.
- Due date opcional.
- Blocked reason, obligatorio solo en estado blocked.
- Creator.
- Archived at y archived by, opcionales.
- Created at y updated at.

### Task change

- Task.
- Actor.
- Event type.
- Field opcional.
- Old value opcional.
- New value opcional.
- Created at.

## 12. Reglas de negocio

| ID | Regla |
|---|---|
| BR-001 | Solo usuarios activos pueden autenticarse |
| BR-002 | El email de usuario debe ser único sin distinguir mayúsculas |
| BR-003 | No se puede desactivar ni degradar al último administrador activo |
| BR-004 | Un usuario inactivo no puede recibir nuevas asignaciones |
| BR-005 | Todo usuario autenticado puede consultar clientes no archivados |
| BR-006 | Los miembros pueden crear clientes; solo administradores pueden editar, desactivar o archivar clientes |
| BR-007 | Una tarea tiene como máximo un responsable |
| BR-008 | Las tareas en backlog pueden no tener responsable |
| BR-009 | Toda tarea fuera del backlog debe tener un responsable activo |
| BR-010 | Una tarea bloqueada debe tener un motivo de bloqueo no vacío |
| BR-011 | Fuera del estado blocked, el motivo se conserva en historial pero no como valor activo |
| BR-012 | Una tarea completada puede reabrirse |
| BR-013 | Los miembros pueden editar tareas creadas por ellos o asignadas a ellos |
| BR-014 | Los administradores pueden editar cualquier tarea |
| BR-015 | Solo administradores pueden archivar tareas |
| BR-016 | Una tarea archivada es de solo lectura y queda excluida de vistas activas por defecto |
| BR-017 | Toda creación y cambio relevante se registra como historial append-only |
| BR-018 | La modificación de una tarea y su entrada de historial son atómicas |
| BR-019 | Las fechas se persisten en UTC y se muestran en la zona del navegador |
| BR-020 | La fecha límite seleccionada como fecha vence al final de ese día local |

## 13. Requisitos funcionales resumidos

### Authentication

| ID | Requisito |
|---|---|
| FR-AUTH-001 | El usuario puede iniciar sesión con email y contraseña |
| FR-AUTH-002 | El sistema rechaza credenciales inválidas sin revelar qué campo falló |
| FR-AUTH-003 | El sistema impide el acceso de usuarios inactivos |
| FR-AUTH-004 | El usuario puede cerrar sesión localmente |
| FR-AUTH-005 | Las rutas protegidas requieren un access token válido |

### Dashboard

| ID | Requisito |
|---|---|
| FR-DASH-001 | Mostrar tareas abiertas, vencidas, bloqueadas y completadas recientemente |
| FR-DASH-002 | Mostrar una lista priorizada de `My tasks` |
| FR-DASH-003 | Mostrar actividad reciente permitida al usuario |
| FR-DASH-004 | Cada indicador enlaza a una vista filtrada cuando corresponda |

### Clients

| ID | Requisito |
|---|---|
| FR-CLI-001 | Listar clientes con búsqueda y filtro por estado |
| FR-CLI-002 | Mostrar estados vacío, carga y error |
| FR-CLI-003 | Cualquier usuario activo puede crear un cliente |
| FR-CLI-004 | Solo un administrador puede editar, desactivar o archivar un cliente |
| FR-CLI-005 | Mostrar detalle del cliente y sus tareas relacionadas |
| FR-CLI-006 | Impedir asignar nuevas tareas a clientes archivados |

### Tasks

| ID | Requisito |
|---|---|
| FR-TASK-001 | Mostrar backlog separado y columnas de estados activos |
| FR-TASK-002 | Crear una tarea aplicando reglas condicionales de responsable y bloqueo |
| FR-TASK-003 | Editar una tarea según rol, autoría o asignación |
| FR-TASK-004 | Cambiar el estado mediante drag-and-drop |
| FR-TASK-005 | Ofrecer una alternativa accesible al drag-and-drop |
| FR-TASK-006 | Filtrar por estado, prioridad, responsable, cliente y vencimiento |
| FR-TASK-007 | Buscar por título y descripción |
| FR-TASK-008 | Mostrar detalle, edición e historial en panel lateral |
| FR-TASK-009 | Reabrir tareas completadas |
| FR-TASK-010 | Archivar tareas solo como administrador |
| FR-TASK-011 | Mostrar tareas archivadas en una vista separada para administradores |
| FR-TASK-012 | Mantener el orden visual tras un movimiento válido o revertirlo con feedback si falla |

### Users

| ID | Requisito |
|---|---|
| FR-USR-001 | El administrador puede listar y buscar usuarios |
| FR-USR-002 | El administrador puede crear un usuario con contraseña inicial |
| FR-USR-003 | El administrador puede editar nombre, rol y estado |
| FR-USR-004 | El sistema protege al último administrador activo |
| FR-USR-005 | El sistema identifica tareas pendientes de reasignación al desactivar un usuario |
| FR-USR-006 | Un usuario puede consultar y actualizar su nombre en su perfil |

### History

| ID | Requisito |
|---|---|
| FR-HIST-001 | Registrar creación, título, estado, prioridad, responsable, fecha límite y archivado |
| FR-HIST-002 | Mostrar actor y fecha de cada evento |
| FR-HIST-003 | Mostrar valores anterior y nuevo de manera comprensible |
| FR-HIST-004 | No permitir editar ni eliminar eventos desde la aplicación |

## 14. Requisitos no funcionales resumidos

| ID | Categoría | Requisito |
|---|---|---|
| NFR-SEC-001 | Seguridad | Contraseñas almacenadas exclusivamente mediante hash resistente |
| NFR-SEC-002 | Seguridad | Autorización aplicada en cada operación del servidor |
| NFR-SEC-003 | Seguridad | Secretos y credenciales fuera del repositorio |
| NFR-SEC-004 | Seguridad | Login protegido con rate limiting |
| NFR-SEC-005 | Seguridad | DTOs rechazan propiedades inesperadas |
| NFR-ACC-001 | Accesibilidad | Flujos principales orientados a WCAG 2.2 AA |
| NFR-ACC-002 | Accesibilidad | Todas las acciones son utilizables con teclado |
| NFR-ACC-003 | Accesibilidad | Foco visible y orden de foco lógico |
| NFR-ACC-004 | Accesibilidad | El color no es el único medio para comunicar estado |
| NFR-PERF-001 | Rendimiento | Interacciones locales muestran feedback perceptible en menos de 100 ms |
| NFR-PERF-002 | Rendimiento | Respuestas API habituales objetivo p95 menor de 500 ms bajo carga demo |
| NFR-PERF-003 | Rendimiento | Listados usan paginación server-side donde puedan crecer |
| NFR-REL-001 | Fiabilidad | Cambios de tarea e historial se confirman en una transacción |
| NFR-REL-002 | Fiabilidad | Errores no dejan la interfaz en un estado optimista falso |
| NFR-OBS-001 | Observabilidad | API produce logs estructurados sin secretos ni contraseñas |
| NFR-COMP-001 | Compatibilidad | Últimas dos versiones estables de Chrome, Firefox, Safari y Edge |
| NFR-RESP-001 | Responsive | Escritorio completo, tablet funcional y móvil mediante listas adaptadas |
| NFR-MAIN-001 | Mantenibilidad | TypeScript estricto y módulos separados por dominio |
| NFR-DOC-001 | Documentación | OpenAPI refleja las rutas públicas de la API |

## 15. Flujos principales

### FLOW-001 — Evaluar la demo como administrador

1. Abrir login.
2. Elegir credenciales de administrador.
3. Consultar dashboard.
4. Crear un cliente.
5. Crear una tarea en backlog vinculada al cliente.
6. Asignarla y moverla a Pending.
7. Moverla a In progress y después a Blocked.
8. Proporcionar motivo de bloqueo.
9. Consultar historial.
10. Abrir Users y observar capacidades administrativas.

### FLOW-002 — Trabajar como miembro

1. Iniciar sesión como miembro.
2. Consultar My tasks.
3. Filtrar por prioridad y vencimiento.
4. Abrir una tarea asignada.
5. Actualizarla y completarla.
6. Consultar el historial.
7. Confirmar que Users no está disponible y que una tarea ajena no es editable.

### FLOW-003 — Proteger una operación no autorizada

1. Un miembro intenta modificar una tarea ajena mediante la API.
2. El servidor responde con forbidden.
3. La tarea y su historial permanecen sin cambios.

## 16. Métricas y señales de éxito

Como caso de estudio sin usuarios reales, las métricas son criterios de evaluación:

- El flujo principal puede completarse sin documentación externa.
- Un evaluador identifica el propósito y roles en menos de dos minutos.
- Cero operaciones protegidas dependen solo de ocultar controles en React.
- Cero cambios de tarea confirmados sin su evento de historial.
- Todos los criterios críticos automatizables tienen prueba.
- La demo se recupera automáticamente de modificaciones públicas.
- Lighthouse Accessibility objetivo de 95 o superior en las rutas principales, sin sustituir pruebas manuales.

## 17. Datos de demostración

- Empresa ficticia: `Northstar Digital Studio`.
- 8 usuarios: 2 administradores y 6 miembros.
- 12 clientes distribuidos por industria y estado.
- 36 tareas distribuidas por estado, prioridad, responsable y vencimiento.
- Actividad histórica suficiente para hacer útil el timeline.
- Dos cuentas demo destacadas: admin y member.
- Reinicio diario y mecanismo manual protegido para recuperación.

## 18. Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| El alcance completo excede 20 horas | Alto | Separar MVP, Complete y Roadmap; estimar por tarea |
| Drag-and-drop inaccesible | Alto | Alternativa de teclado/formulario y pruebas manuales |
| Permisos inconsistentes | Alto | Matriz central, guards/policies y pruebas negativas |
| Demo pública degradada por visitantes | Alto | Datos ficticios, reinicio diario y recuperación manual |
| Historial inconsistente | Alto | Escritura transaccional y pruebas de rollback |
| Nombre confundido con una marca | Medio | Tratar `Briefline CRM` como nombre de trabajo y validar antes de uso comercial |
| Coste o suspensión del hosting gratuito | Medio | Documentar límites y mantener despliegue reproducible |

## 19. Criterios de salida del MVP

El MVP estará listo cuando:

- Todos los requisitos MVP `Must` estén aceptados.
- Los flujos FLOW-001 a FLOW-003 pasen en el entorno público.
- No existan defectos conocidos críticos o altos.
- Los permisos hayan sido probados desde UI y API.
- El tablero sea operable sin drag-and-drop.
- La API y el modelo de datos estén documentados.
- La demo tenga datos seguros y reinicio verificado.
- README y caso de estudio expliquen alcance, decisiones y compromisos.

## 20. Decisiones posteriores al PRD

Los siguientes documentos desarrollarán esta baseline sin reabrir el producto:

- Matriz completa de permisos.
- Modelo de datos y reglas de integridad.
- Contrato REST y catálogo de errores.
- Arquitectura y ADR.
- Especificación UX y accesibilidad.
- Estrategia de pruebas.
- Plan de despliegue y demo.
- Roadmap, épicas, historias, tareas y trazabilidad.
