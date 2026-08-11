# PH-11 QA-002 — Expansión de tests unitarios (Briefline CRM)

Fecha: 2026-08-11
Estado: completado — `pnpm typecheck` y `pnpm test` en verde (web 131 tests / 15 archivos, api 47 tests / 6 archivos). `pnpm test:e2e` no ejecutado (no se tocó integración ni e2e; requiere Docker/Playwright).

## Archivos creados

### Backend (`apps/api/test/unit/` — directorio nuevo)
| Archivo | Tests | Cubre |
|---|---|---|
| `tasks.policy.spec.ts` | 14 | `canViewTask`, `canEditTask`, `canArchiveTask` — matriz completa: archived/admin/member, creator/assignee/third-party, doble archive |
| `tasks.mapper.spec.ts` | 12 | `toDateOnly` (ADR-003), `toTaskSummary`, `toTaskResponse`, `toTaskChange` (versión D-5, refs resueltas, nulos) |
| `clients.mapper.spec.ts` | 6 | `toClientResponse` (resolución de `createdBy`, no fuga de `createdById`), `toTaskSummary` FR-CLI-005 |
| `argon2.util.spec.ts` | 8 | Hash contra el binario nativo real con parámetros de producción: PHC `$argon2id$`, sal aleatoria, verify true/false/vacío, hash malformado → rejects |
| `normalize-email.spec.ts` | 7 | trim+lowercase combinados, inputs no-string → `''` (nunca crash), blank |

### Frontend (`apps/web/test/`)
| Archivo | Tests | Cubre |
|---|---|---|
| `format.test.ts` | 21 | `formatRelativeDate` (todos los buckets + inválido/futuro), `formatAbsoluteDate`, `madridToday` (incl. cruces de medianoche CEST/CET), `dueLabel`, `formatDueDate` — todo con fake timers fijados a 2026-08-11T12:00Z |
| `api-errors.test.tsx` | 12 | `applyFieldErrors` con useForm real (mapeo, campos desconocidos ignorados, no-ApiError), `serverErrorTitle`/`serverErrorDetail` con fallbacks |
| `use-task-mutations.test.tsx` | 7 | Optimistic move + orden contractual (prioridad desc, due asc, nulls last), rollback de board+detail, guard de request-id con respuestas fuera de orden (TASK-FE-013), patch de campos/refs con `optimisticRefs` |

El placeholder `apps/api/test/placeholder.spec.ts` se mantiene (no roto; el comentario del archivo ya lo declaraba reemplazable, pero no había motivo para borrarlo).

## Validación

1. `pnpm typecheck` (raíz) — verde en ambas apps.
2. `pnpm test` — api 47/47, web 131/131 (131 = 91 previos + 40 nuevos).
3. **Mutación dirigida** (backup en /tmp/briefline-mut, restaurado por copia): invertir el guard `requestId` en `useTaskMutations` → fallan los 3 tests de rollback/out-of-order; `canEditTask` con `&&` en vez de `||` → fallan los 2 tests de creator/assignee; `dueLabel` con `<=` → falla "Due today". Los tests discriminan la lógica real.

## Notas de riesgo / hallazgos

- **El pedido mencionaba `canAccess`/`canMutate`/`canChangeStatus`; la API real es `canViewTask`/`canEditTask`/`canArchiveTask`** (tasks.policy.ts, PH-06). Los tests cubren la superficie real; se documenta en el header del spec.
- **`clients.mapper.toTaskSummary` pasa `dueDate` como `Date`**, mientras `tasks.mapper.toTaskSummary` lo serializa a `'YYYY-MM-DD'` (ADR-003). Inconsistencia de contrato entre mappers; hoy no rompe nada (el JSON serializa Date a ISO de todos modos), pero si algún cliente del DTO espera date-only, será una bomba de relojería. Recomendado unificar.
- **`useTaskMutations` — versión optimista**: `version = (detailSnapshot?.version ?? 0) + 1`. Sin la cache de detail (p. ej. navegación directa a la vista sin TaskDetail montado), el bump optimista puede no incrementar. No es un bug con el flujo real (TaskDetail está montado), pero es un edge del contrato del hook.
- **`onMutate` es async** (`await cancelQueries`): el estado optimista del cache se aplica en un flush posterior al `mutate()` — los tests deben usar `waitFor`, no asserts síncronos.
- **RHF `formState.errors`**: la instancia capturada antes de `act()` no materializa los errores; la vía robusta es `getFieldState(field).error` (lee el store). Probado empíricamente (4 variantes).
- **`argon2.verify` con hash malformado lanza** (TypeError), no devuelve `false` — verificado contra el binario. Los callers que tratan `verifyPassword` como booleano puro pueden recibir una excepción si el hash almacenado está corrupto.
- **`format.ts`**: `formatAbsoluteDate`/`dueLabel` leen el día civil del huso del host. Los tests fijan instantes a 12:00Z, estables en la práctica salvo husos extremos (UTC+12/+13/+14). `madridToday` usa `Europe/Madrid` explícito y sus tests cubren los cruces de medianoche.
- `dueLabel` con un `due` malformado (p. ej. `'2026-13-40'`) produce un label degradado (`undefined 40`); fuera del contrato YYYY-MM-DD, no testeado ni corregido.

## Coverage estimado

- `tasks.policy.ts`: ~100% de ramas (todas las combinaciones archivado × rol × titularidad).
- Mappers (tasks/clients): ~100% de las funciones y ramas nulas/no-nulas.
- `argon2.util.ts` / `normalize-email.ts`: ~100%.
- `format.ts`: ~95% (queda `MONTHS` edge malformado y paths idénticos de `formatAbsoluteDate`).
- `api-errors.ts`: ~100% (fallbacks y ramas de mapeo).
- `useTaskMutations.ts`: ~90% (optimistic paths, rollback, guard, sorting; no se cubren `useCreateTask`/`useArchiveTask`/`useReconcileTask`, triviales y ya ejercitados por la suite MSW existente).

## Archivos de tests
- `/Users/ac/develop_projects/portfolio/briefline-crm/apps/api/test/unit/tasks.policy.spec.ts`
- `/Users/ac/develop_projects/portfolio/briefline-crm/apps/api/test/unit/tasks.mapper.spec.ts`
- `/Users/ac/develop_projects/portfolio/briefline-crm/apps/api/test/unit/clients.mapper.spec.ts`
- `/Users/ac/develop_projects/portfolio/briefline-crm/apps/api/test/unit/argon2.util.spec.ts`
- `/Users/ac/develop_projects/portfolio/briefline-crm/apps/api/test/unit/normalize-email.spec.ts`
- `/Users/ac/develop_projects/portfolio/briefline-crm/apps/web/test/format.test.ts`
- `/Users/ac/develop_projects/portfolio/briefline-crm/apps/web/test/api-errors.test.tsx`
- `/Users/ac/develop_projects/portfolio/briefline-crm/apps/web/test/use-task-mutations.test.tsx`
