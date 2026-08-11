# Full Permission Matrix — Briefline CRM

**Date:** 2026-08-11
**Status:** PH-01 Draft
**References:** PRD BR-001–020, FR-AUTH/USR/CLI/TASK/DASH/HIST (02-prd.en.md §11–13); project brief §4–5; decision log DEC-006/010/021/022/023/024/029/032/034/035; development plan PH-01 (SEC-001), PH-04/05/06 gates.

## 1. Conventions

- `✅` = allowed. `❌` = denied; the trailing code is the canonical HTTP status.
- **401** unauthenticated or invalid session (expired token, inactive user with valid token). **403** authenticated but role/object permission denied, plus CSRF/Origin failures. **404** resource not found **or not visible to the caller** (BOLA-safe — never distinguishes "missing" from "hidden"). **409** state conflict (stale `expectedVersion`, last active admin, duplicate email, write to archived resource, double archive). **422** business-rule violation (BR-004/008/009/010/012, FR-CLI-006). **400** syntactic validation (lengths, formats, unknown DTO properties, pagination limits). **429** login rate limit (AUTH-004).
- Guards are **server-enforced** (NFR-SEC-002): the global auth guard validates JWT claims and requires the current user to be ACTIVE on every protected request (AUTH-002, BR-001). Object-level policies run inside the same transaction that performs the mutation (BR-018, TASK-API-008).
- "Team-wide view" means every authenticated user sees all non-archived resources of that type; object *editing* is restricted by role/relationship (BR-013/014).
- Archived resources are excluded from every active view (board, lists, search, KPIs, My Tasks, activity) and are immutable. Members cannot resolve them at all (`404`); admins can resolve but any write returns `409`.
- The task assignment field always resolves to an ACTIVE user id; payloads include assignee display data for rendering (no per-user lookup by the member UI).
- `/health` and OpenAPI docs are public and outside this matrix.

## 2. Permission Matrix

| # | Resource | Operation | ADMIN | MEMBER | Anonymous | Object Relationship | Active State | Inactive/Archived | Notes |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Auth | Login | ✅ if ACTIVE | ✅ if ACTIVE | ✅ | Self | N/A | INACTIVE user → ❌ (generic 401) | BR-001; FR-AUTH-001/002/003 — same generic response for bad credentials and inactive user; 429 on rate limit (AUTH-004) |
| 2 | Auth | Logout | ✅ | ✅ | ❌ 401 | Self | N/A | N/A | Clears HttpOnly cookie; rotates CSRF token (DEC-032, AUTH-003) |
| 3 | Auth | Get CSRF token | ✅ | ✅ | ✅ | Self | N/A | N/A | Pre-auth rotation so the login POST is CSRF-protected; double-submit cookie + Origin validation (DEC-032) |
| 4 | Auth | Get current user (/auth/me) | ✅ | ✅ | ❌ 401 | Self | ✅ | Valid token + INACTIVE user → ❌ 401 | Global guard requires active status (AUTH-002, BR-001); returns role for FE navigation |
| 5 | Users | List users (search, paginate) | ✅ | ❌ 403 | ❌ 401 | None — admin-only | ACTIVE and INACTIVE both returned | INACTIVE visible to admin | FR-USR-001; offset pagination (page/limit ≤ 100); never exposes passwordHash |
| 6 | Users | Get user by ID | ✅ | ❌ 403 | ❌ 401 | None | Both statuses returned | INACTIVE returned to admin | No passwordHash; unknown id → 404 |
| 7 | Users | Create user | ✅ | ❌ 403 | ❌ 401 | None | May create ACTIVE or INACTIVE | N/A | FR-USR-002; initial password; normalized email, duplicate → 409 (BR-002); no public registration |
| 8 | Users | Update user (name, role, status) | ✅ | ❌ 403 | ❌ 401 | None | Toggle ACTIVE↔INACTIVE and role changes | Re-activation allowed (admin only) | FR-USR-003; last-active-admin guard → 409 (BR-003, USR-005, serializable); history/authoring preserved on status change |
| 9 | Users | Deactivate user | ✅ | ❌ 403 | ❌ 401 | None | ACTIVE → INACTIVE ✅ | Already INACTIVE → no-op 200 | FR-USR-003; last active admin → 409 (BR-003); self-deactivation allowed unless last admin; session invalidated afterwards (next request 401); no new assignments afterwards (BR-004) |
| 10 | Users | Get reassignment impact | ✅ | ❌ 403 | ❌ 401 | None | N/A | N/A | FR-USR-005; counts and lists active work assigned to the target before deactivation |
| 11 | Profile | Get own profile | ✅ | ✅ | ❌ 401 | Self | ✅ | ❌ 401 (session invalid) | FR-USR-006 |
| 12 | Profile | Update own name | ✅ | ✅ | ❌ 401 | Self | ✅ | ❌ 401 | PROF-001; only `name` is editable — role/status/email in DTO rejected → 400 (NFR-SEC-005, mass-assignment guard) |
| 13 | Clients | List clients (search, filter by status) | ✅ | ✅ | ❌ 401 | Team-wide view | ACTIVE/INACTIVE visible | ARCHIVED: admin via status filter; member → excluded (filter yields empty) | BR-005, FR-CLI-001; search + status filter + pagination; archived excluded by default (CLI-API-001) |
| 14 | Clients | Get client by ID (with related tasks) | ✅ | ✅ (non-archived) | ❌ 401 | Team-wide view | ACTIVE/INACTIVE ✅ | ARCHIVED: admin ✅ / member ❌ 404 | FR-CLI-005; related-task summary paginated, no N+1 (CLI-API-003) |
| 15 | Clients | Create client | ✅ | ✅ | ❌ 401 | Creator recorded | N/A | N/A | BR-006, FR-CLI-003 — any active user; lengths/email validated (400) |
| 16 | Clients | Update client (name, industry, contact, phone, notes) | ✅ | ❌ 403 | ❌ 401 | None | ACTIVE/INACTIVE ✅ | ARCHIVED → ❌ 409 | BR-006, FR-CLI-004; field-level DTO allowlist (CLI-API-004) |
| 17 | Clients | Deactivate client | ✅ | ❌ 403 | ❌ 401 | None | ACTIVE → INACTIVE ✅ | Already INACTIVE → no-op 200; ARCHIVED → ❌ 409 | BR-006; relationships retained, no physical delete (CLI-API-005) |
| 18 | Clients | Archive client | ✅ | ❌ 403 | ❌ 401 | None | ACTIVE/INACTIVE → ARCHIVED ✅ | Already ARCHIVED → ❌ 409 | BR-006; after archiving, new task associations rejected → 422 (FR-CLI-006, CLI-API-006); old links remain |
| 19 | Tasks | List tasks (board: backlog + active columns) | ✅ | ✅ | ❌ 401 | Team-wide view | All active states (BACKLOG…COMPLETED) | ARCHIVED excluded | FR-TASK-001/006/007; separate backlog + active columns; deterministic sort per DEC-035; data cap |
| 20 | Tasks | Search/filter tasks | ✅ | ✅ | ❌ 401 | Team-wide view | Active only | ARCHIVED excluded | FR-TASK-006/007; flat filters: state, priority, assignee, client, due condition, `q` (search 100 max) |
| 21 | Tasks | Get task by ID (with history) | ✅ | ✅ | ❌ 401 | Team-wide view | Active states ✅ | ARCHIVED: admin ✅ / member ❌ 404 | FR-TASK-008; includes history timeline (FR-HIST-001/002/003) |
| 22 | Tasks | Create task (backlog or active) | ✅ | ✅ | ❌ 401 | Creator = actor (stored) | BACKLOG may be unassigned ✅ (BR-008); active creation without assignee → ❌ 422 (BR-009) | Archived client association → ❌ 422 (FR-CLI-006); inactive assignee → ❌ 422 (BR-004) | BR-007 (at most one assignee); blocked at creation without reason → ❌ 422 (BR-010); atomic create + history (BR-017/018, TASK-API-002) |
| 23 | Tasks | Update task (title, description, priority, due date, client) | ✅ any task | ✅ creator/assignee only; else ❌ 403 | ❌ 401 | Creator or assignee (BR-013) | Active states ✅ | ARCHIVED → ❌ (admin 409 / member 404) | BR-014 (admin edits any); `expectedVersion` stale → 409 (DEC-034, TASK-API-005); history event only for real auditable changes (TASK-API-003) |
| 24 | Tasks | Change task status (incl. block/unblock, reopen) | ✅ any task | ✅ creator/assignee | ❌ 401 | Creator or assignee | Free transitions (DEC-024); reopen COMPLETED ✅ (BR-012) | ARCHIVED → ❌ (admin 409 / member 404) | BLOCKED without reason → ❌ 422 (BR-010); transition to active without assignee → ❌ 422 (BR-009); unblock clears the active reason but the history entry keeps it (BR-011); DnD changes status only, inter-column (DEC-035); version increments (TASK-API-004) |
| 25 | Tasks | Assign/reassign task | ✅ any task | ✅ creator/assignee | ❌ 401 | Creator or assignee | Assignee must be ACTIVE → else ❌ 422 (BR-004); active task must keep an assignee — unassign → ❌ 422 (BR-009) | ARCHIVED → ❌ | At most one assignee (BR-007); BACKLOG may be unassigned ✅ (BR-008); reassignment of creator/assignee-owned task allowed for members (BR-013) |
| 26 | Tasks | Archive task | ✅ | ❌ 403 | ❌ 401 | None | Active → ARCHIVED ✅ | Already ARCHIVED → ❌ 409 (no duplicate event) | BR-015, FR-TASK-010; records archivedBy and archive event; defined idempotency (TASK-API-006); immutable afterwards (BR-016) |
| 27 | Tasks | Get archived tasks | ✅ | ❌ 403 | ❌ 401 | None | N/A | Admin-only view of ARCHIVED | FR-TASK-011 (separate admin view); paginated |
| 28 | Tasks | Get task history | ✅ | ✅ (viewable tasks) | ❌ 401 | Tasks the user can view | Active ✅ | ARCHIVED: admin ✅ / member ❌ 404 | FR-HIST-001–004; append-only, stable order, no update/delete routes (TASK-API-007) |
| 29 | Dashboard | Get KPIs (open, overdue, blocked, recently completed) | ✅ | ✅ | ❌ 401 | Team-wide active tasks | Active only | ARCHIVED excluded | FR-DASH-001; same numbers for both roles (both see all active tasks) |
| 30 | Dashboard | Get My Tasks | ✅ | ✅ | ❌ 401 | Self = assignee | Active, prioritized | ARCHIVED excluded | FR-DASH-002; contractual sort/limit (DASH-002) |
| 31 | Dashboard | Get recent activity | ✅ (all events) | ✅ (active-task events only) | ❌ 401 | Events on visible tasks | Active events | Archived-task events: admin ✅ / member ❌ | FR-DASH-003; bounded; no hidden-resource activity leak (DASH-003 guard) |

## 3. Negative Results Summary

| Operation | 401 | 403 | 404 | 409 | 422 | 429 | 400 |
|---|---|---|---|---|---|---|---|
| Login | Invalid credentials; inactive user (generic — no enumeration, FR-AUTH-002/003) | — | — | — | — | Rate limit exceeded (AUTH-004) | Malformed payload |
| Logout | No session | — | — | — | — | — | — |
| Get CSRF token | — | — | — | — | — | — | — |
| Get current user | Expired/invalid token; user deactivated after token issue (AUTH-002) | — | — | — | — | — | — |
| Users: list / get / create / update / deactivate / impact | No auth | Non-admin actor (member) | User id not found | Duplicate normalized email (BR-002); last-active-admin demote/deactivate (BR-003, USR-005) | — | — | Invalid DTO or pagination (limit > 100) |
| Profile: get / update | No auth | — | — | — | — | — | Non-`name` fields in PATCH (mass assignment, NFR-SEC-005) |
| Clients: list / get | No auth | — | Client not found; ARCHIVED client to member (BOLA-safe) | — | — | — | Invalid filters or pagination |
| Clients: create | No auth | — | — | — | — | — | Invalid DTO (lengths/email) |
| Clients: update / deactivate / archive | No auth | Member actor (BR-006) | Client not found | Write to ARCHIVED client; double archive | — | — | Invalid DTO |
| Tasks: list / search | No auth | — | — | — | — | — | Invalid filters or pagination |
| Task: get / history | No auth | — | Task not found; ARCHIVED task to member | — | — | — | — |
| Task: create | No auth | — | Client/assignee id not found | — | Active without assignee (BR-009); inactive assignee (BR-004); blocked without reason (BR-010); archived client association (FR-CLI-006) | — | Invalid DTO |
| Task: update / status / assign | No auth | Member not creator/assignee (BR-013, FLOW-003) | ARCHIVED task to member (resolve-time) | Stale `expectedVersion` (DEC-034); write to ARCHIVED task (admin); double archive | Blocked without reason; active without assignee; unassign from active task; inactive assignee; archived client | — | Invalid DTO |
| Task: archive | No auth | Member actor (BR-015) | Task not found | Already ARCHIVED (idempotency, no duplicate event) | — | — | — |
| Archived tasks view | No auth | Member actor | — | — | — | — | Invalid pagination |
| Dashboard: KPIs / My Tasks / activity | No auth | — | — | — | — | — | — |

Guarantees: every 400/403/404/409/422 failure on a task mutation changes **neither** Task **nor** TaskChange (BR-018, TASK-API-013). 403 on a member mutation leaves the resource untouched (FLOW-003 exit criterion).

## 4. Authorization Rules (pseudocode)

```typescript
// ---------- Session (global guard, every protected request; AUTH-002) ----------
function currentUser(req): User | null {
  const claims = verifyJwt(req.cookies.accessToken)      // sig, alg, iss, aud, exp
  if (!claims) return null                                // -> 401
  const user = db.user.findUnique({ id: claims.sub })
  if (!user || user.status !== 'ACTIVE') return null      // BR-001 -> 401 (session invalidated)
  return user
}

// ---------- Users (admin-only module) ----------
function canManageUsers(actor: User): boolean {
  return actor.role === 'ADMIN'                           // FR-USR-001..005 -> else 403
}

function canDeactivateUser(actor: User, target: User): boolean {
  if (!canManageUsers(actor)) return false
  if (target.role === 'ADMIN' && target.status === 'ACTIVE') {
    // serializable read + P2034 bounded retry (USR-005, ADR-004)
    return countActiveAdmins() > 1                        // else -> 409 LAST_ADMIN (BR-003)
  }
  return true                                             // self-deactivation OK unless last admin
}

// ---------- Profile (self only) ----------
function canUpdateProfile(actor: User, target: User): boolean {
  return actor.id === target.id                           // only `name` allowed (PROF-001)
}

// ---------- Clients ----------
function canViewClient(actor: User, client: Client): boolean {
  if (client.status === 'ARCHIVED') return actor.role === 'ADMIN'   // member -> 404 (BR-005)
  return true
}

function canCreateClient(actor: User): boolean {
  return true                                             // BR-006 / FR-CLI-003 (any active user)
}

function canEditClient(actor: User, client: Client): boolean {
  if (client.status === 'ARCHIVED') return false          // -> 409 CLIENT_ARCHIVED
  return actor.role === 'ADMIN'                           // BR-006 / FR-CLI-004 -> else 403
}

// ---------- Tasks ----------
function canViewTask(actor: User, task: Task): boolean {
  if (task.archivedAt) return actor.role === 'ADMIN'      // member -> 404 (BR-016)
  return true                                             // team-wide view
}

function canEditTask(actor: User, task: Task): boolean {
  if (task.archivedAt) return false                       // admin -> 409 TASK_ARCHIVED (BR-016)
  if (actor.role === 'ADMIN') return true                 // BR-014
  return task.creatorId === actor.id || task.assigneeId === actor.id  // BR-013 -> else 403
}

function canArchiveTask(actor: User, task: Task): boolean {
  if (actor.role !== 'ADMIN') return false                // BR-015 -> 403
  if (task.archivedAt) return false                       // -> 409 TASK_ALREADY_ARCHIVED
  return true
}

// ---------- Task state invariants (BR-004, 007..012, FR-CLI-006) ----------
function validateTaskWrite(task: Task, assignee: User | null, client: Client | null): string[] {
  const errors: string[] = []
  if (task.status !== 'BACKLOG' && !assignee)                       errors.push('ACTIVE_TASK_REQUIRES_ASSIGNEE') // BR-009
  if (assignee && assignee.status !== 'ACTIVE')                     errors.push('ASSIGNEE_INACTIVE')            // BR-004
  if (task.status === 'BLOCKED' && !task.blockedReason?.trim())     errors.push('BLOCKED_REASON_REQUIRED')      // BR-010
  if (client && client.status === 'ARCHIVED')                       errors.push('CLIENT_ARCHIVED')              // FR-CLI-006
  return errors                                                     // any error -> 422, nothing persisted
}

// On unblock: persist old reason in TaskChange, null the active field (BR-011).
// Completed -> reopened: allowed; emits status event (BR-012, DEC-024).

// ---------- Task mutation skeleton (atomic, BR-018) ----------
function mutateTask(actor: User, taskId: string, changes, expectedVersion: number): Task {
  return db.$transaction(async (tx) => {
    const task = tx.task.findUnique({ id: taskId })                 // not found -> 404
    if (!canEditTask(actor, task)) throw forbidden()                // 403 (member) / 404 (archived) / 409
    if (task.version !== expectedVersion) throw conflict()          // 409 VERSION_CONFLICT (DEC-034)
    const errors = validateTaskWrite(task, resolveAssignee(changes.assigneeId), resolveClient(changes.clientId))
    if (errors.length) throw unprocessable(errors)                  // 422
    const updated = tx.task.update({ ...changes, version: task.version + 1 })
    if (differs(task, updated)) tx.taskChange.create({ actor, event, field, old, new })  // BR-017
    return updated
  })                                                                // history failure rolls back the mutation (TASK-API-008)
}
```

## 5. Edge Cases

1. **User deactivates themselves** — allowed unless they are the last active admin; the session is invalidated and the next protected request returns 401 (AUTH-002). FE clears session/cache on 401, never on 403 (AUTH-FE-002).
2. **Last active admin tries to self-demote or self-deactivate** — 409 `LAST_ADMIN`; the check runs in a serializable transaction with bounded P2034 retry so two concurrent demotions cannot remove both admins (BR-003, USR-005, ADR-004).
3. **Member tries to edit an archived task** — 404 at resolve time: members cannot even see archived tasks (BR-016); the write changes nothing.
4. **Member tries to archive a task** — 403 (BR-015). Member UI hides the archive control; API still enforces.
5. **Inactive user tries to log in** — generic 401 identical to wrong-password (BR-001, FR-AUTH-002): no account-status enumeration. Rate limit applies per IP regardless.
6. **Valid token but user deactivated mid-session** — 401 from the global guard (AUTH-002), not 403: the session is invalid, and 401 (not 403) makes the FE log out cleanly (AUTH-FE-002).
7. **Token expired during an operation** — 401 with the same generic problem response; the FE clears the session and preserves the intended destination for post-login redirect (AUTH-FE-003).
8. **CSRF token missing/invalid** — 403 `CSRF_FAILED` on unsafe methods; mismatched `Origin` also 403 (DEC-032). Login is protected by the pre-auth CSRF rotation (matrix row 3).
9. **Assign task to an inactive user** — 422 `ASSIGNEE_INACTIVE` (BR-004). Deactivation pre-check: reassignment impact (row 10) shows the affected active work before the admin confirms.
10. **Create an active task without assignee** — 422 `ACTIVE_TASK_REQUIRES_ASSIGNEE` (BR-009); backlog tasks may be created unassigned (BR-008).
11. **Block a task without a reason** — 422 `BLOCKED_REASON_REQUIRED` (BR-010); reason is trimmed and max 500 chars (400).
12. **Unblocking a task** — the active reason is cleared but the old value remains in the append-only history (BR-011). Same for editing away from BLOCKED.
13. **Reopen a completed task** — allowed (BR-012, DEC-024); emits a status history event; the task becomes editable again under the standard rules.
14. **Member reassigns a task they own** — allowed (BR-013), but the new assignee must be ACTIVE (BR-004) and, for non-backlog tasks, the task keeps exactly one assignee — unassigning an active task returns 422 (BR-009).
15. **Double archive (task or client)** — 409 with a defined idempotency: no second history event, no state change (TASK-API-006).
16. **Admin writes to an archived task** — 409 `TASK_ARCHIVED`: archive is a permanent state with no un-archive route (BR-016, TASK-FE-009).
17. **Associate a task with an archived client** — 422 `CLIENT_ARCHIVED` on create and update (FR-CLI-006); existing links remain intact.
18. **Stale `expectedVersion` on any task mutation** — 409 `VERSION_CONFLICT` with the current safe representation; neither Task nor TaskChange is written; FE restores and explains the current state (TASK-API-005/013, FE-012).
19. **Member edits an unrelated (not created/assigned) active task** — 403 (BR-013, FLOW-003); rollback tests prove no partial write of task or history (TASK-API-013).
20. **Archived tasks in aggregate views** — excluded from board, list, search, KPIs, My Tasks, and member activity feed (BR-016, FR-TASK-011, DASH-003 guard).
21. **Recent activity leak** — member activity feed never includes events on archived tasks even if the member was the actor; admin feed may include them (PH-10 guard: no hidden-resource activity leak).
22. **Member requests an archived client by id** — 404, same as unknown id (BOLA-safe, consistent with BR-005/006 admin-only archive management).
23. **Mass assignment on profile** — PATCH with `role`, `status`, or `email` → 400 (DTO allowlist, NFR-SEC-005, PROF-001).
24. **Duplicate email on user create/update** — 409 `EMAIL_CONFLICT`; email normalized `trim().toLowerCase()` before the unique check (BR-002, ADR-002).
25. **Same-column drag-and-drop drop** — no-op; no API call, no state change (DEC-035).
26. **Member navigates to /users** — route is admin-only in the shell; a direct API call returns 403; 403 never triggers logout (AUTH-FE-003 guard).
27. **Pagination/search limits** — `limit > 100` or `search > 100` chars → 400 (plan §5); page defaults 1/25.
28. **Concurrent admin deactivations** — two admins deactivating the same last admin: exactly one succeeds, the other gets 409 `LAST_ADMIN` after the bounded P2034 retry (USR-005, ADR-004).
29. **Login rate limit** — after the login-specific limit, 429 with the contractual problem body; FE shows rate-limit feedback and does not retry blindly (AUTH-004, AUTH-FE-001).
30. **NFR-SEC-005 across the API** — every DTO rejects unknown properties with 400, so authorization can never be bypassed by extra fields (also covered in SEC-002 review).
