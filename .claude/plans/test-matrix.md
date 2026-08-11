# Requirement-to-Test Matrix — Briefline CRM

**Date:** 2026-08-11
**Status:** PH-01 Draft (QA-001)
**Owner:** QA
**Sources:** `docs/02-prd.en.md` (BR-001–020, FR-*, NFR-*, FLOW-001–003), `docs/plans/04-development-plan.en.md` (PH-01 QA-001, PH-11, PH-15), `.claude/plans/qa-tooling-verification.md` (DOC-004), `docs/03-documentation-baseline.en.md`
**Tooling pinned by DOC-004:** Vitest v4 (unit/node + components/jsdom), Vitest + Supertest + Testcontainers `postgres:16-alpine` (integration), Playwright v1.61 (E2E), `@axe-core/playwright` (A11Y), GitHub Actions (CI). No SQLite/pg-mem substitute; coverage thresholds 80/80/70/80; every axe exclusion documented inline.

## Test level legend

| Level | Tool / Method | Owner |
|---|---|---|
| UNIT | Vitest (node: domain rules, mappers, validators, guards; jsdom: components by behavior) | BE / FE |
| INT | Vitest + Supertest + Testcontainers (real PostgreSQL, real migrations, HTTP contract) | BE |
| E2E | Playwright against production preview (`webServer` build+preview), controlled fixtures (never dev seed) | QA |
| A11Y | axe-core over Playwright (tags wcag2a/aa/wcag21a/aa/wcag22aa; fail only serious/critical) + manual session | QA |
| MANUAL | Checklist with recorded evidence (screenshots/video/notes) | QA / BE / FE / DEVOPS |
| PERF | autocannon/k6, query-count review, React DevTools profiling | BE / FE |
| CI | GitHub Actions gate (typecheck, lint, contract audit) | BE / FE |

---

## Business Rules Coverage

| BR | Description | Test Level | Owner | Evidence | Test File (suggested) |
|---|---|---|---|---|---|
| BR-001 | Only active users may authenticate | INT | BE | Login de usuario INACTIVE → 401 con body genérico idéntico al de credencial inválida | apps/api/test/integration/auth/login.spec.ts |
| BR-001 | Only active users may authenticate | INT | BE | Token emitido antes de desactivar → 401 en el siguiente request (guard re-checks `active` en cada request) | apps/api/test/integration/auth/guard.spec.ts |
| BR-001 | Only active users may authenticate | E2E | QA | Flujo login con credenciales de usuario inactivo → error genérico, sin acceso al dashboard | apps/web/test/e2e/auth/login.spec.ts |
| BR-002 | User email is case-insensitively unique | INT | BE | Crear user con email existente en distinto case → 409 estable (misma respuesta para duplicados); `trim().toLowerCase()` verificado en DB | apps/api/test/integration/users/create.spec.ts |
| BR-002 | User email is case-insensitively unique | INT | BE | Bypass API: INSERT directo de email duplicado → violación del constraint único normalizado (DB-007) | apps/api/test/integration/db/constraints.spec.ts |
| BR-003 | The last active administrator cannot be demoted or deactivated | INT | BE | Demote/deactivate del único admin activo → 409; fila intacta en DB | apps/api/test/integration/users/update.spec.ts |
| BR-003 | The last active administrator cannot be demoted or deactivated | INT | BE | Concurrencia: dos demotions simultáneos → transacción serializable, exactamente uno pasa, retry bounded P2034 | apps/api/test/integration/users/concurrency.spec.ts |
| BR-003 | The last active administrator cannot be demoted or deactivated | E2E | QA | UI: intento de desactivar el último admin → error visible que explica el conflicto | apps/web/test/e2e/users/manage.spec.ts |
| BR-004 | Inactive users cannot receive new assignments | INT | BE | Asignar tarea (fuera de backlog) a user INACTIVE → 400/422; ninguna asignación persiste | apps/api/test/integration/tasks/create.spec.ts |
| BR-004 | Inactive users cannot receive new assignments | UNIT | BE | Política de asignación rechaza assignee inactivo sin tocar DB | apps/api/src/tasks/task-policy.spec.ts |
| BR-005 | Authenticated users may view non-archived clients | INT | BE | GET /clients sin sesión → 401; con sesión → 200 y archivados excluidos por defecto | apps/api/test/integration/clients/list.spec.ts |
| BR-005 | Authenticated users may view non-archived clients | E2E | QA | Lista de clientes no muestra archivados por defecto | apps/web/test/e2e/clients/list.spec.ts |
| BR-006 | Members may create clients; only administrators may edit, deactivate, or archive them | INT | BE | Member POST /clients → 201; member PATCH/deactivate/archive → 403; admin → 200; no existe delete físico | apps/api/test/integration/clients/permissions.spec.ts |
| BR-006 | Members may create clients; only administrators may edit, deactivate, or archive them | E2E | QA | UI member: acciones de edición ausentes; petición directa de member → 403 | apps/web/test/e2e/clients/permissions.spec.ts |
| BR-007 | A task has at most one assignee | UNIT | BE | Modelo de dominio: segundo assignee rechazado / reemplaza al primero, nunca dos simultáneos | apps/api/src/tasks/task-policy.spec.ts |
| BR-007 | A task has at most one assignee | INT | BE | Payload con dos assigneeIds → 400 (whitelist de DTO); DB contiene un solo assigneeId | apps/api/test/integration/tasks/create.spec.ts |
| BR-008 | Backlog tasks may be unassigned | INT | BE | Crear task en BACKLOG sin assignee → 201 | apps/api/test/integration/tasks/create.spec.ts |
| BR-008 | Backlog tasks may be unassigned | UNIT | BE | Regla de dominio: BACKLOG admite assignee null | apps/api/src/tasks/task-policy.spec.ts |
| BR-009 | Tasks outside backlog require an active assignee | INT | BE | Mover a PENDING/IN_PROGRESS sin assignee → 400; con assignee INACTIVE → 400 | apps/api/test/integration/tasks/status.spec.ts |
| BR-009 | Tasks outside backlog require an active assignee | UNIT | BE | Validación estado × assignee (BACKLOG exento) | apps/api/src/tasks/task-policy.spec.ts |
| BR-010 | Blocked tasks require a non-empty blocked reason | INT | BE | Mover a BLOCKED sin reason → 400; reason vacío o solo espacios → 400 | apps/api/test/integration/tasks/status.spec.ts |
| BR-010 | Blocked tasks require a non-empty blocked reason | UNIT | BE | Validator blockedReason: trim, no vacío, límite 500 chars | apps/api/src/tasks/blocked-reason.validator.spec.ts |
| BR-011 | Outside blocked status, the reason remains in history but not as an active value | INT | BE | Salir de BLOCKED → `blockedReason` null en DB; el evento history conserva old/new con el valor anterior | apps/api/test/integration/tasks/history.spec.ts |
| BR-011 | Outside blocked status, the reason remains in history but not as an active value | UNIT | BE | Mapper de eventos genera old/new correctos al limpiar el reason | apps/api/src/tasks/task-change-mapper.spec.ts |
| BR-012 | Completed tasks may be reopened | INT | BE | COMPLETED → PENDING → 200, `version` incrementado, evento de reopen | apps/api/test/integration/tasks/status.spec.ts |
| BR-012 | Completed tasks may be reopened | E2E | QA | Reopen desde la UI vía `Move to…` (sin drag) | apps/web/test/e2e/tasks/move-to.spec.ts |
| BR-013 | Members may edit tasks they created or are assigned to | INT | BE | Member edita tarea ajena (ni creada ni asignada) → 403 (BOLA); tarea propia/asignada → 200 | apps/api/test/integration/tasks/permissions.spec.ts |
| BR-013 | Members may edit tasks they created or are assigned to | E2E | QA | UI member: tarea ajena no editable; intento directo falla sin mutar datos | apps/web/test/e2e/tasks/permissions.spec.ts |
| BR-014 | Administrators may edit any task | INT | BE | Admin edita tarea de cualquier miembro → 200, `version` incrementado | apps/api/test/integration/tasks/permissions.spec.ts |
| BR-015 | Only administrators may archive tasks | INT | BE | Member archive → 403; admin archive → 200 + evento archive + `version`++ | apps/api/test/integration/tasks/archive.spec.ts |
| BR-015 | Only administrators may archive tasks | E2E | QA | UI: control de archivar visible solo para admin | apps/web/test/e2e/tasks/archive.spec.ts |
| BR-016 | Archived tasks are read-only and excluded from active views by default | INT | BE | Mutar task archivada → 403/409; ausente de board/list por defecto; presente en /tasks/archived | apps/api/test/integration/tasks/archive.spec.ts |
| BR-016 | Archived tasks are read-only and excluded from active views by default | E2E | QA | Vista archivados solo admin; tarea archivada no se puede mutar desde UI | apps/web/test/e2e/tasks/archive.spec.ts |
| BR-017 | Creation and relevant changes produce append-only history | INT | BE | Crear + cada cambio auditable → eventos en orden estable, sin rutas update/delete de history | apps/api/test/integration/tasks/history.spec.ts |
| BR-017 | Creation and relevant changes produce append-only history | INT | BE | Actualizar con el mismo valor → sin evento nuevo (solo cambios reales auditan) | apps/api/test/integration/tasks/history.spec.ts |
| BR-018 | A task mutation and its history entry are atomic | INT | BE | Forzar fallo de history → rollback: ni task ni history cambian (TASK-API-008) | apps/api/test/integration/tasks/atomicity.spec.ts |
| BR-018 | A task mutation and its history entry are atomic | INT | BE | Auth read + mutation + history dentro de una única `$transaction`, sin network calls | apps/api/test/integration/tasks/atomicity.spec.ts |
| BR-019 | Dates are persisted in UTC and displayed in the browser time zone | INT | BE | Timestamps persistidos como `timestamptz` UTC; respuestas ISO 8601 con Z | apps/api/test/integration/tasks/dates.spec.ts |
| BR-019 | Dates are persisted in UTC and displayed in the browser time zone | UNIT | FE | Formateo de fechas en timezone del navegador (UTC → local) | apps/web/src/utils/dates.spec.ts |
| BR-019 | Dates are persisted in UTC and displayed in the browser time zone | E2E | QA | Con `timezoneId: Europe/Madrid`: fechas mostradas en hora local correcta | apps/web/test/e2e/tasks/detail.spec.ts |
| BR-020 | A date-only deadline expires at the end of that local day | UNIT | BE | Overdue: deadline 2026-08-11 vence al final del día local (23:59:59.999 Europe/Madrid), no a medianoche UTC | apps/api/src/tasks/overdue.spec.ts |
| BR-020 | A date-only deadline expires at the end of that local day | INT | BE | Dashboard overdue en la frontera de medianoche local → conteo correcto (temporal boundary, ADR-003) | apps/api/test/integration/dashboard/kpis.spec.ts |

## Functional Requirements Coverage

### Authentication (FR-AUTH)

| FR | Description | Test Level | Owner | Evidence | Test File |
|---|---|---|---|---|---|
| FR-AUTH-001 | Users can log in with email and password | INT | BE | POST /api/auth/login válido → 200 + Set-Cookie HttpOnly (Secure, SameSite=Lax) + CSRF rotado | apps/api/test/integration/auth/login.spec.ts |
| FR-AUTH-001 | Users can log in with email and password | E2E | QA | UI login con demo account → redirect a dashboard | apps/web/test/e2e/auth/login.spec.ts |
| FR-AUTH-002 | Invalid credentials are rejected without disclosing which value failed | INT | BE | Email inválido vs password inválido → mismo status 401 y mismo body genérico | apps/api/test/integration/auth/login.spec.ts |
| FR-AUTH-002 | Invalid credentials are rejected without disclosing which value failed | UNIT | BE | Servicio emite mensaje idéntico en ambos caminos (no enumerable) | apps/api/src/auth/auth.service.spec.ts |
| FR-AUTH-003 | Inactive users are denied access | INT | BE | Login de INACTIVE → 401 genérico, indistinguible de credencial inválida | apps/api/test/integration/auth/login.spec.ts |
| FR-AUTH-003 | Inactive users are denied access | E2E | QA | Usuario inactivo no alcanza el dashboard | apps/web/test/e2e/auth/login.spec.ts |
| FR-AUTH-004 | Users can log out locally | INT | BE | POST logout → cookie borrada (Max-Age 0); la sesión anterior no reutiliza | apps/api/test/integration/auth/logout.spec.ts |
| FR-AUTH-004 | Users can log out locally | E2E | QA | Logout → rutas protegidas redirigen a login | apps/web/test/e2e/auth/logout.spec.ts |
| FR-AUTH-005 | Protected routes require a valid access token | INT | BE | Sin cookie → 401; token expirado → 401; `iss`/`aud`/`alg` inválidos → 401 | apps/api/test/integration/auth/guard.spec.ts |
| FR-AUTH-005 | Protected routes require a valid access token | E2E | QA | Deep link sin sesión → redirect a login con destino preservado | apps/web/test/e2e/auth/routes.spec.ts |
| FR-AUTH-005 | Protected routes require a valid access token | UNIT | BE | JwtStrategy valida signature/iss/aud/exp con algoritmo fijo | apps/api/src/auth/jwt.strategy.spec.ts |

### Dashboard (FR-DASH)

| FR | Description | Test Level | Owner | Evidence | Test File |
|---|---|---|---|---|---|
| FR-DASH-001 | Show open, overdue, blocked, and recently completed task counts | INT | BE | KPIs contra fixtures deterministas (seed 8/12/36) | apps/api/test/integration/dashboard/kpis.spec.ts |
| FR-DASH-001 | Show open, overdue, blocked, and recently completed task counts | E2E | QA | KPI cards visibles y valores coinciden con datos controlados | apps/web/test/e2e/dashboard/dashboard.spec.ts |
| FR-DASH-001 | Show open, overdue, blocked, and recently completed task counts | UNIT | FE | Componente KPI renderiza 4 métricas con estados loading/error | apps/web/src/features/dashboard/KpiCards.spec.tsx |
| FR-DASH-002 | Show a prioritized `My tasks` list | INT | BE | Orden contractual: priority desc, due asc null last, updated desc; límite por rol | apps/api/test/integration/dashboard/my-tasks.spec.ts |
| FR-DASH-002 | Show a prioritized `My tasks` list | E2E | QA | My tasks ordena URGENT/HIGH por delante de MEDIUM/LOW | apps/web/test/e2e/dashboard/dashboard.spec.ts |
| FR-DASH-003 | Show recent activity visible to the user | INT | BE | Member no recibe actividad de tareas/users que no puede ver (sin leak de recursos ocultos) | apps/api/test/integration/dashboard/activity.spec.ts |
| FR-DASH-003 | Show recent activity visible to the user | E2E | QA | Timeline de actividad reciente acotado y consistente | apps/web/test/e2e/dashboard/dashboard.spec.ts |
| FR-DASH-004 | Relevant indicators link to filtered views | E2E | QA | Click en KPI → board con el filtro correspondiente; navegación back/refresh coherente | apps/web/test/e2e/dashboard/deep-links.spec.ts |
| FR-DASH-004 | Relevant indicators link to filtered views | UNIT | FE | Parámetros de filtro serializados/parseados en la URL | apps/web/src/features/board/filter-params.spec.ts |

### Clients (FR-CLI)

| FR | Description | Test Level | Owner | Evidence | Test File |
|---|---|---|---|---|---|
| FR-CLI-001 | List clients with search and status filter | INT | BE | Search + status filter + paginación (default 25, max 100); archivados excluidos | apps/api/test/integration/clients/list.spec.ts |
| FR-CLI-001 | List clients with search and status filter | E2E | QA | UI: búsqueda, filtro de estado y paginación | apps/web/test/e2e/clients/list.spec.ts |
| FR-CLI-001 | List clients with search and status filter | UNIT | FE | Estado de filtros reflejado en query params y viceversa | apps/web/src/features/clients/client-list.spec.tsx |
| FR-CLI-002 | Provide empty, loading, and error states | UNIT | FE | Estados empty/loading/error/retry con mocks del contract | apps/web/src/features/clients/client-list.spec.tsx |
| FR-CLI-002 | Provide empty, loading, and error states | E2E | QA | Estado vacío y estado de error con retry funcional | apps/web/test/e2e/clients/states.spec.ts |
| FR-CLI-003 | Any active user may create a client | INT | BE | Member y admin → 201; creator registrado; longitudes/email validados | apps/api/test/integration/clients/create.spec.ts |
| FR-CLI-003 | Any active user may create a client | E2E | QA | UI: member crea cliente; éxito anunciado (status region) | apps/web/test/e2e/clients/create.spec.ts |
| FR-CLI-004 | Only administrators may edit, deactivate, or archive a client | INT | BE | Member PATCH/deactivate/archive → 403; admin → 200; sin delete físico | apps/api/test/integration/clients/permissions.spec.ts |
| FR-CLI-004 | Only administrators may edit, deactivate, or archive a client | E2E | QA | UI member sin acciones de edición; request directo de member → 403 | apps/web/test/e2e/clients/permissions.spec.ts |
| FR-CLI-005 | Show client details and related tasks | INT | BE | GET /clients/:id con tareas relacionadas paginadas; query count sin N+1 | apps/api/test/integration/clients/detail.spec.ts |
| FR-CLI-005 | Show client details and related tasks | E2E | QA | Detail: datos del cliente + tareas relacionadas + estado archivado claro | apps/web/test/e2e/clients/detail.spec.ts |
| FR-CLI-006 | Archived clients cannot receive new task associations | INT | BE | Crear task con client archivado → 400/422; vínculos existentes permanecen | apps/api/test/integration/clients/archive.spec.ts |

### Tasks (FR-TASK)

| FR | Description | Test Level | Owner | Evidence | Test File |
|---|---|---|---|---|---|
| FR-TASK-001 | Show a separate backlog and active-state columns | INT | BE | Board query: BACKLOG separado; columnas activas PENDING/IN_PROGRESS/BLOCKED/COMPLETED; orden contractual; data cap | apps/api/test/integration/tasks/board.spec.ts |
| FR-TASK-001 | Show a separate backlog and active-state columns | E2E | QA | Board renderiza backlog + columnas activas | apps/web/test/e2e/tasks/board.spec.ts |
| FR-TASK-002 | Create tasks while enforcing assignee and blocked-reason rules | INT | BE | BACKLOG sin assignee → 201; PENDING sin assignee → 400; BLOCKED sin reason → 400 | apps/api/test/integration/tasks/create.spec.ts |
| FR-TASK-002 | Create tasks while enforcing assignee and blocked-reason rules | E2E | QA | UI create: reglas condicionales y errores de servidor visibles | apps/web/test/e2e/tasks/create.spec.ts |
| FR-TASK-003 | Edit tasks according to role, authorship, or assignment | INT | BE | Matriz role×ownership: miembro dueño/asignado 200; miembro ajeno 403; admin 200 | apps/api/test/integration/tasks/permissions.spec.ts |
| FR-TASK-003 | Edit tasks according to role, authorship, or assignment | E2E | QA | UI member: edición habilitada solo en tareas propias/asignadas | apps/web/test/e2e/tasks/permissions.spec.ts |
| FR-TASK-004 | Change task status through drag-and-drop | E2E | QA | DnD pointer inter-columnas → status cambia; same-column drop → no-op | apps/web/test/e2e/tasks/dnd.spec.ts |
| FR-TASK-004 | Change task status through drag-and-drop | MANUAL | QA | Experiencia táctil/pointer real y anuncios de estado (grabación) | docs/qa/manual-accessibility-record.md |
| FR-TASK-005 | Provide an accessible alternative to drag-and-drop | E2E | QA | `Move to…` por teclado: todas las transiciones + reopen, sin drag (paridad no-DnD) | apps/web/test/e2e/tasks/move-to.spec.ts |
| FR-TASK-005 | Provide an accessible alternative to drag-and-drop | A11Y | QA | axe en board tras interacción; focus manejable en el flujo alternativo | apps/web/test/e2e/a11y/board.spec.ts |
| FR-TASK-006 | Filter by state, priority, assignee, client, and due condition | INT | BE | Combinaciones de filtros flat + sort contractual; sin nested query objects | apps/api/test/integration/tasks/board.spec.ts |
| FR-TASK-006 | Filter by state, priority, assignee, client, and due condition | E2E | QA | UI filtros; resultado count anunciado (aria-live) | apps/web/test/e2e/tasks/filters.spec.ts |
| FR-TASK-006 | Filter by state, priority, assignee, client, and due condition | UNIT | FE | Estado de filtros en URL, limpieza y parseo validado | apps/web/src/features/board/filter-params.spec.ts |
| FR-TASK-007 | Search title and description | INT | BE | `q` busca en title y description; límite 100; sin errores con texto largo | apps/api/test/integration/tasks/search.spec.ts |
| FR-TASK-007 | Search title and description | E2E | QA | Search box filtra la board | apps/web/test/e2e/tasks/filters.spec.ts |
| FR-TASK-008 | Show details, editing, and history in a side panel | E2E | QA | /tasks/:id: desktop non-modal, mobile modal/fullscreen; deep link; focus return al cerrar | apps/web/test/e2e/tasks/detail.spec.ts |
| FR-TASK-008 | Show details, editing, and history in a side panel | A11Y | QA | axe sobre panel/dialog abierto; dialog no usa `role="grid"` incompleto | apps/web/test/e2e/a11y/task-detail.spec.ts |
| FR-TASK-008 | Show details, editing, and history in a side panel | UNIT | FE | Panel renderiza detail + edit + history con estados completos | apps/web/src/features/tasks/TaskDetailPanel.spec.tsx |
| FR-TASK-009 | Reopen completed tasks | INT | BE | COMPLETED → PENDING → 200, `version`++, evento de reopen | apps/api/test/integration/tasks/status.spec.ts |
| FR-TASK-009 | Reopen completed tasks | E2E | QA | Reopen vía `Move to…` | apps/web/test/e2e/tasks/move-to.spec.ts |
| FR-TASK-010 | Allow administrators to archive tasks | INT | BE | Admin archive → 200 + evento archive; idempotencia definida | apps/api/test/integration/tasks/archive.spec.ts |
| FR-TASK-010 | Allow administrators to archive tasks | E2E | QA | UI admin archiva tarea | apps/web/test/e2e/tasks/archive.spec.ts |
| FR-TASK-011 | Provide administrators with a separate archived-task view | INT | BE | GET /tasks/archived → solo admin (member 403), paginado, solo lectura | apps/api/test/integration/tasks/archive.spec.ts |
| FR-TASK-011 | Provide administrators with a separate archived-task view | E2E | QA | Vista archivados accesible solo para admin | apps/web/test/e2e/tasks/archive.spec.ts |
| FR-TASK-012 | Keep a valid optimistic move or revert it with feedback on failure | UNIT | FE | Helpers optimistas: cancel/snapshot/set/rollback/invalidate; 409 restaura y explica | apps/web/src/features/tasks/mutations.spec.ts |
| FR-TASK-012 | Keep a valid optimistic move or revert it with feedback on failure | E2E | QA | Force 409 (stale version) → UI restaura estado y muestra mensaje; 500 → rollback | apps/web/test/e2e/tasks/optimistic.spec.ts |
| FR-TASK-012 | Keep a valid optimistic move or revert it with feedback on failure | INT | BE | Stale write → 409 con versión actual y representación segura | apps/api/test/integration/tasks/concurrency.spec.ts |
| FR-TASK-012 | Keep a valid optimistic move or revert it with feedback on failure | UNIT | FE | Concurrency guard: un pending move por task; respuestas out-of-order no corrompen UI | apps/web/src/features/tasks/mutations.spec.ts |

### Users (FR-USR)

| FR | Description | Test Level | Owner | Evidence | Test File |
|---|---|---|---|---|---|
| FR-USR-001 | Administrators can list and search users | INT | BE | Admin → 200 paginado, nunca `passwordHash` en respuesta; member → 403 | apps/api/test/integration/users/list.spec.ts |
| FR-USR-001 | Administrators can list and search users | E2E | QA | UI users solo admin; member ve 403 sin logout | apps/web/test/e2e/users/manage.spec.ts |
| FR-USR-002 | Administrators can create users with an initial password | INT | BE | Create → password hasheado argon2id en DB, nunca en respuesta; conflicto de email estable | apps/api/test/integration/users/create.spec.ts |
| FR-USR-002 | Administrators can create users with an initial password | E2E | QA | UI create con input seguro (type=password, autocomplete off); password no redisplayed | apps/web/test/e2e/users/manage.spec.ts |
| FR-USR-003 | Administrators can edit name, role, and status | INT | BE | Admin PATCH name/role/status → 200; member → 403; historia relacional preservada | apps/api/test/integration/users/update.spec.ts |
| FR-USR-003 | Administrators can edit name, role, and status | E2E | QA | UI edición de usuario con estados de error/conflicto | apps/web/test/e2e/users/manage.spec.ts |
| FR-USR-004 | The system protects the last active administrator | INT | BE | Último admin: demote/deactivate → 409; serializable + retry bounded en concurrencia | apps/api/test/integration/users/concurrency.spec.ts |
| FR-USR-004 | The system protects the last active administrator | E2E | QA | UI representa el conflicto del último admin con precisión | apps/web/test/e2e/users/manage.spec.ts |
| FR-USR-005 | The system identifies work requiring reassignment when a user is deactivated | INT | BE | Deactivation → endpoint de impacto: conteo/lista de trabajo activo del usuario | apps/api/test/integration/users/reassignment.spec.ts |
| FR-USR-005 | The system identifies work requiring reassignment when a user is deactivated | E2E | QA | UI muestra impacto antes de confirmar desactivación | apps/web/test/e2e/users/manage.spec.ts |
| FR-USR-006 | Users can view and update their own name | INT | BE | GET/PATCH /profile → solo campos propios (name); member → 200; no permite tocar campos ajenos | apps/api/test/integration/profile/profile.spec.ts |
| FR-USR-006 | Users can view and update their own name | E2E | QA | UI profile: leer y actualizar nombre con estados completos | apps/web/test/e2e/profile/profile.spec.ts |
| FR-USR-006 | Users can view and update their own name | UNIT | FE | Formulario profile con validación y estados | apps/web/src/features/profile/ProfileForm.spec.tsx |

### History (FR-HIST)

| FR | Description | Test Level | Owner | Evidence | Test File |
|---|---|---|---|---|---|
| FR-HIST-001 | Record creation and changes to title, status, priority, assignee, due date, and archive state | INT | BE | Cada campo auditable genera evento con field/old/new; orden estable por createdAt | apps/api/test/integration/tasks/history.spec.ts |
| FR-HIST-001 | Record creation and changes to title, status, priority, assignee, due date, and archive state | UNIT | BE | Mapper diff: solo campos realmente cambiados generan eventos | apps/api/src/tasks/task-change-mapper.spec.ts |
| FR-HIST-002 | Show actor and date for every event | INT | BE | TaskChange tiene actorId + createdAt ISO UTC; actor resuelto en la respuesta | apps/api/test/integration/tasks/history.spec.ts |
| FR-HIST-002 | Show actor and date for every event | E2E | QA | Timeline muestra actor y fecha legibles | apps/web/test/e2e/tasks/detail.spec.ts |
| FR-HIST-003 | Present previous and new values clearly | UNIT | FE | Render de evento old → new con formato claro | apps/web/src/features/tasks/HistoryTimeline.spec.tsx |
| FR-HIST-003 | Present previous and new values clearly | E2E | QA | Timeline visible en panel de detalle con valores previos/nuevos | apps/web/test/e2e/tasks/detail.spec.ts |
| FR-HIST-004 | History cannot be edited or deleted through the application | INT | BE | No existen rutas update/delete de TaskChange (404); API solo lectura | apps/api/test/integration/tasks/history.spec.ts |
| FR-HIST-004 | History cannot be edited or deleted through the application | INT | BE | Bypass API: FK sin CASCADE destructivo — borrar task no elimina historial | apps/api/test/integration/db/constraints.spec.ts |

## Non-Functional Requirements Coverage

| NFR | Description | Test Level | Owner | Evidence |
|---|---|---|---|---|
| NFR-SEC-001 | Passwords are stored only as resistant hashes | UNIT | BE | Argon2id con OWASP mínimos (19 MiB, 2 iteraciones, p=1); hash con salt verificado en DB; nunca valor plano |
| NFR-SEC-001 | Passwords are stored only as resistant hashes | MANUAL | QA | Scan de seeds/artefactos/DB dump: sin passwords ni hashes en texto claro (PH-11 guard) |
| NFR-SEC-002 | Server authorization is enforced for every operation | INT | BE | Negative tests para cada endpoint de la matriz de permisos (role × object × active × archive); member/inactive → 403/401 |
| NFR-SEC-002 | Server authorization is enforced for every operation | E2E | QA | FLOW-003: mutación no autorizada vía API directa → 403, sin cambios en task ni history |
| NFR-SEC-003 | Secrets and credentials remain outside the repository | MANUAL | QA/DEVOPS | Secret scan en CI (gitleaks/trivy) con `fail-on-secret`; `.env` fuera del repo; secrets solo en hosting/GitHub |
| NFR-SEC-004 | Login is rate limited | INT | BE | 5 intentos rápidos → 429 contractual; tracking por proxy correcto; mensaje no revela detalle |
| NFR-SEC-005 | DTOs reject unexpected properties | UNIT | BE | ValidationPipe con `whitelist` + `forbidNonWhitelisted`: campo extra → 400 |
| NFR-SEC-005 | DTOs reject unexpected properties | INT | BE | POST con propiedad extra → 400 + Problem Details con `errors` (RFC 9457) |
| NFR-ACC-001 | Main flows target WCAG 2.2 AA | A11Y | QA | axe (tags wcag22aa) en rutas/estados primarios (login, dashboard, board, task detail, clients, users, 403/404, empty/error/loading) + tras interacción; sin serious/critical; exclusions documentadas inline |
| NFR-ACC-001 | Main flows target WCAG 2.2 AA | MANUAL | QA | Sesión manual de screen reader (VoiceOver/NVDA): login, board, task detail, historial; grabación como evidencia |
| NFR-ACC-002 | Every action is keyboard operable | MANUAL | QA | Flujo keyboard-only completo (Tab/Shift+Tab/Enter/Escape/espacio) en toda la app; grabación y checklist |
| NFR-ACC-002 | Every action is keyboard operable | E2E | QA | `Move to…`, modales, filtros y navegación operables solo por teclado |
| NFR-ACC-003 | Focus is visible and follows a logical order | A11Y | QA | axe focus checks + `toMatchAriaSnapshot` en rutas clave; sin `aria-grabbed`/`aria-dropeffect` deprecated |
| NFR-ACC-003 | Focus is visible and follows a logical order | MANUAL | QA | Tab-through visual; focus return al cerrar modales; sin focus traps; skip link funcional |
| NFR-ACC-004 | Color is not the only state indicator | MANUAL | QA | Revisión en escala de grises: prioridad/estado distinguibles por texto/icono, no solo color |
| NFR-ACC-004 | Color is not the only state indicator | UNIT | FE | Badge de prioridad/estado incluye texto (assert semántico: no depende solo de clase de color) |
| NFR-PERF-001 | Local interactions provide perceptible feedback within 100 ms | PERF | FE | Perfilado de interacciones (React DevTools/tracing); optimistic update medido <100 ms |
| NFR-PERF-001 | Local interactions provide perceptible feedback within 100 ms | UNIT | FE | Mutaciones optimistas aplican estado local inmediato sin esperar red |
| NFR-PERF-002 | Common API responses target p95 below 500 ms under demo load | PERF | BE | autocannon/k6 contra API real con volumen demo (36 tasks): p95 <500 ms; reporte como artefacto |
| NFR-PERF-002 | Common API responses target p95 below 500 ms under demo load | PERF | BE | Query count review: sin N+1 en board/detail/dashboard; cada índice cita su query |
| NFR-PERF-003 | Potentially growing lists use server-side pagination | INT | BE | Limit/offset en SQL: default 25, max 100; meta de paginación en respuesta |
| NFR-PERF-003 | Potentially growing lists use server-side pagination | PERF | BE | Board a 36/100 tasks: plan de query estable (EXPLAIN) con índices efectivos |
| NFR-REL-001 | Task changes and history commit in one transaction | INT | BE | Force rollback → ni task ni history cambian; transacción única verificada (BR-018) |
| NFR-REL-001 | Task changes and history commit in one transaction | INT | BE | Sin network calls dentro de la transacción (guard del plan) |
| NFR-REL-002 | Errors never leave the UI in a falsely optimistic state | E2E | QA | Force 409/500 → UI restaura estado anterior + feedback visible |
| NFR-REL-002 | Errors never leave the UI in a falsely optimistic state | UNIT | FE | Rollback paths cubiertos por cada mutación optimista |
| NFR-OBS-001 | The API emits structured logs without secrets or passwords | UNIT | BE | Formato de log estructurado; redacción de password/JWT/cookie en eventos de auth |
| NFR-OBS-001 | The API emits structured logs without secrets or passwords | MANUAL | QA | Scan de logs reales: sin passwords/tokens/cookies/hashes (PH-15 checklist) |
| NFR-COMP-001 | Support the latest two stable Chrome, Firefox, Safari, and Edge releases | E2E | QA | Playwright matrix chromium/firefox/webkit en CI (Edge = Chromium engine; Safari ≈ WebKit) o limitación documentada |
| NFR-RESP-001 | Full desktop, functional tablet, and list-adapted mobile experience | E2E | QA | Viewport matrix: desktop 1280, tablet 768, mobile 320×568; sin scroll horizontal a 320 px |
| NFR-RESP-001 | Full desktop, functional tablet, and list-adapted mobile experience | MANUAL | QA | 400% zoom + reflow real; contenido legible y funcional |
| NFR-MAIN-001 | Strict TypeScript and domain-separated modules | CI | BE/FE | typecheck estricto en CI (noImplicitAny, noUnusedLocals); falla el build si viola |
| NFR-MAIN-001 | Strict TypeScript and domain-separated modules | MANUAL | QA | Anti-pattern audit (PH-15): sin acoplamiento de dominios, sin imports cruzados indebidos |
| NFR-DOC-001 | OpenAPI represents the public API routes | CI | BE | Contract audit: OpenAPI generado == comprometido (sin diff); rutas públicas documentadas |
| NFR-DOC-001 | OpenAPI represents the public API routes | INT | BE | Smoke de contrato: rutas reales responden con los códigos de estado del OpenAPI |

## Primary Flows Coverage

| Flow | Test Level | Owner | Evidence |
|---|---|---|---|
| FLOW-001 (Evaluate as administrator) | E2E | QA | Script completo: login admin → dashboard → crear client → crear task en backlog → asignar y activar → mover por estados activos → blocked reason → inspeccionar history → revisar user management |
| FLOW-002 (Work as member) | E2E | QA | Login member → My tasks → filtrar → actualizar y completar tarea asignada → inspeccionar history → user management NO disponible → edición de tarea ajena NO disponible |
| FLOW-003 (Reject unauthorized mutation) | INT | BE | Member muta task ajena vía API directa → 403; ni task ni history cambian |
| FLOW-003 (Reject unauthorized mutation) | E2E | QA | Intento vía UI + API directa → 403 y datos intactos |

## Coverage Summary

| Category | Total | Unit | Integration | E2E | A11Y | Manual | Perf | CI |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Business Rules (BR) | 20 | 8 | 25 | 9 | 0 | 0 | 0 | 0 |
| Functional (FR) | 37 | 13 | 32 | 33 | 2 | 1 | 0 | 0 |
| Non-Functional (NFR) | 19 | 6 | 7 | 5 | 2 | 9 | 4 | 2 |
| Flows | 3 | 0 | 1 | 3 | 0 | 0 | 0 | 0 |
| **Total rows** | **79** | **27** | **65** | **50** | **4** | **10** | **4** | **2** |

> "Total" = distinct requirements (20 BR + 37 FR + 19 NFR + 3 FLOW = 79); row counts are requirements × test levels (162 matrix rows), verified programmatically. Every BR (20/20), FR (37/37), NFR (19/19), and FLOW (3/3) appears in at least one row; multi-level rows are intentional (rule at API level + UX at browser level).

## Mapping to PH-11 execution tasks

| PH-11 task | Fed by this matrix |
|---|---|
| QA-002 Unit suite | BR-007/008/010/011/019/020, FR-AUTH-002, FR-DASH-001/004, FR-CLI-001/002, FR-TASK-006/012, FR-USR-006, FR-HIST-001/003, NFR-SEC-001/005, NFR-ACC-004, NFR-PERF-001, NFR-REL-002 |
| QA-003 PostgreSQL integration | BR-002/018, FR-HIST-004, NFR-REL-001 (constraints, transactions, rollback, locking, migrations) |
| QA-004 API integration/E2E | All INT rows across BR/FR/NFR + FLOW-003 (API leg) |
| QA-005 Browser E2E | All E2E rows + FLOW-001/002/003 (browser leg) |
| QA-006 Automated accessibility | NFR-ACC-001/003, FR-TASK-005/008 (axe rows) |
| QA-007 Manual accessibility | NFR-ACC-001/002/003/004, FR-TASK-004 (manual rows) |
| QA-008 Browser matrix | NFR-COMP-001 |
| PERF-001 Performance review | NFR-PERF-001/002/003, FR-CLI-005, FR-TASK-012 (perf rows) |
| QA-009 Defect triage | Exit criteria: zero critical/high defects over this matrix |

## Gaps & Risks

### What CANNOT be automated (manual evidence required)
- **Real screen reader experience** (VoiceOver/NVDA): semantic meaning in context, reader tabbing, announcements of async changes and drag state. axe covers ~30–40% of WCAG criteria at best; an "automation-only" accessibility claim is explicitly prohibited.
- **Real zoom/reflow at 320 px and 400%**, and **`prefers-reduced-motion`** actual behavior — Playwright viewport emulation is a proxy, not a rendering proof.
- **Focus order and focus traps in complex SPAs** — axe checks presence, not the tab experience.
- **Visual/design review** (grayscale state check, contrast over gradients/images, visual harmony) — requires human judgment.
- **Fresh-evaluator test** (purpose and roles understood in <2 min, journey completed unaided) and **demo-reset verification** in the public environment.
- **Copy and error-message quality** — semantic correctness of Problem Details messages for real users.
- **Login rate-limit behavior under real proxy/network conditions** (trust proxy exactness) — CI covers the happy path only.

### What requires manual judgment
- Grayscale review for NFR-ACC-004 (is the state still legible?).
- Whether history timeline "presents previous and new values clearly" (FR-HIST-003) is readable, not merely rendered.
- Whether keyboard-only flow *feels* efficient (NFR-ACC-002), not just operable.
- Triage of axe `incomplete`/`minor` results and justification of every documented exclusion.
- Severity decisions feeding QA-009 (zero critical/high; accepted medium defects documented).

### What is too expensive to test at scale
- **Full browser matrix in every PR** — Playwright in 3 engines × full suite is slow and cache-fragile. Mitigation: chromium full suite on PR; firefox/webkit on main and release schedule (QA-008).
- **Full viewport matrix × engine matrix** — combinatorial explosion. Mitigation: viewport matrix on chromium only; visual/UX checks at 320 px manual.
- **Concurrency tests at scale** (last-admin serializable, optimistic locking) — running hundreds of parallel transactions is slow and flaky; keep bounded, deterministic cases (2–3 interleavings).
- **Performance benchmarks in CI** — noisy and environment-dependent. Mitigation: run on demand/against staging with pinned thresholds and report artifacts; query-count review as the deterministic CI proxy.
- **Full E2E coverage of every error state per domain** — budget via unit tests (jsdom) for state permutations; E2E covers one representative path per error class (400/403/409/429/500).

### Known test-design risks
- **Shared CI PostgreSQL service container** — parallel workers must use schema-per-worker (`VITEST_POOL_ID`) or `--shard`; integration suite default is container-per-file (`fileParallelism: false`).
- **axe exclusions must be justified inline** (`// a11y-exclusion <id>: <reason>`) or the guarantee is void.
- **No SQLite/pg-mem substitute** for integration — unit mocks do not validate SQL or constraints.
- **409 optimistic-lock tests depend on controlled fixtures** — E2E must create/delete its own data via API, never the dev seed.
- **Coverage thresholds 80/80/70/80** are CI gates; infrastructure files (main.ts, configs, types) are excluded from the calculation.
