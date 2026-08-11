# UX Specification — Briefline CRM

**Date:** 2026-08-11
**Status:** PH-01 Draft (UX-001 Sitemap + Wireframes, UX-002 Tokens + Responsive/A11y Contract)
**Owner:** DESIGN/FE
**Sources:** PRD `02-prd.en.md` (§4, §8, §13–15), project brief `00-project-brief.md` (§5, §8.1), decision log `01-decision-log.md` (DEC-025, DEC-026, DEC-035), documentation baseline `03-documentation-baseline.en.md` ("Allowed technical patterns", "Derived requirements"), development plan `04-development-plan.en.md` (PH-01, PH-07, PH-08, PH-09).

> **Conventions.** UI copy is English (brief §7). Dates display in the browser time zone from UTC persistence (BR-019); a date-only deadline expires at end of that local day (BR-020). Every state/priority/badge renders text plus color, never color alone (NFR-ACC-004, baseline "Derived requirements"). No manual card ordering anywhere (DEC-035); the canonical card sort is **priority descending, due date ascending with null last, updated time descending** (locked in PH-01 §5). All loading, empty, error, forbidden, and read-only states below are part of the DoD (development plan §8). Iconography: a single 20px stroke icon set; every meaningful icon carries a text label or `aria-label`; icons are `aria-hidden` when decorative.

---

## 1. Sitemap

Full route hierarchy. `Auth` = access token valid + user still `ACTIVE` (baseline "Derived requirements": re-check active on every request). `Admin` = `ADMIN` role. Authorization is server-enforced; the UI only hides affordances (brief §4, NFR-SEC-002, PH-08 guard "UI is never the authority").

```
/                        → Redirect to /dashboard
/login                   → Public. Redirects to /dashboard if already authenticated
/dashboard               → Auth
/tasks                   → Auth (Board view, default for both roles)
/tasks/archived          → Admin only (list of archived tasks, read-only)
/tasks/:taskId           → Auth. Desktop: non-modal side panel rendered over /tasks,
                           /dashboard, or /clients/:clientId (deep link). Mobile:
                           fullscreen view with back control. Opens on top of the
                           referring route (PH-01 §5, TASK-FE-006)
/clients                 → Auth
/clients/:clientId       → Auth. Members see non-archived clients (BR-005);
                           archived client detail for a member resolves to the 404
                           view with the generic "not found or no access" copy
/users                   → Admin only. Member → /403
/profile                 → Auth
/403                     → Forbidden page (rendered inside app shell when
                           authenticated, standalone otherwise)
/404                     → Not found (unknown routes, missing resources, or
                           authorized-but-hidden resources for members)
*                        → /404
```

Routing behavior contract (AUTH-FE-002/003):

| Situation | Behavior |
|---|---|
| Unauthenticated user opens a protected route | Redirect to `/login?next=/path`; after successful login, return to the intended destination |
| Authenticated user opens `/login` | Redirect to `/dashboard` |
| Session expires / token invalid (401) | Clear session and server cache, redirect to `/login?next=…`; user is *not* logged out for 403 responses |
| Member opens `/users` or `/tasks/archived` | Render `/403`; the API independently returns 403 (never trust hiding) |
| Task/client detail returns 404 for an object the user cannot see | Render the generic not-found view (no resource enumeration) |
| Deep route refresh (`/tasks/:taskId`, `/clients/:clientId`) | SPA rehydrates on the same route; panel/detail opens from its own route state |

Navigation (app shell, see §2.10): Dashboard, Tasks, Clients, Users (admin only), Profile; Logout in the user menu. No other destinations in the MVP (brief §8.1). Breadcrumbs: not in scope; each screen has an `<h1>` and self-explanatory context.

---

## 2. Wireframes

Each screen specifies layout, hierarchy, behavior, and every non-happy state. Shared state components are defined once in §2.11 and referenced by name.

### 2.1 Login (`/login`)

**Layout.** Standalone page, no app shell. Full-viewport centered column (flex, min-height 100vh, background `--color-surface`). Top: brand lockup — 32px logo mark (rounded square, blue-600 fill, white monogram) + "Briefline" wordmark at 20px/600. Below: card (max-width 400px, width 100%, padding 24px, radius 8px, `--shadow-md`, background `--color-white`). Below card: muted caption "Demo environment — fictional data, resets daily." Bottom of viewport, optional `<footer>` with product line.

**Default state.** Form inside the card, stacked, gap 16px:

1. **Email input** — visible label "Email" (`<label for>`), `type=email`, `autocomplete=email`, `autocapitalize=none`, `spellcheck=false`, `autocorrect=off`, placeholder optional but never the label (baseline anti-pattern). Height 44px.
2. **Password input** — visible label "Password", `type=password`, `autocomplete=current-password`, 44px, with a "Show password" toggle button (text button with eye icon, `aria-pressed`), default hidden.
3. **Submit button** — full-width primary button "Sign in", height 44px. No other form-level chrome.
4. **Error region** — empty `role="alert"` region below the submit (see states).

Divider line, then **"Demo accounts"** section: heading at 14px/600, then two clickable cards side by side (stack on narrow widths):

- **Administrator** — "Full access — manage users, clients, and tasks." Shows credential chips (`admin@northstar.studio` / `••••••••` with reveal button) and a "Use this account" button.
- **Member** — "Limited access — work on your own tasks." Credentials `member@northstar.studio` / `••••••••` with reveal + "Use this account".

Card click / button click **fills the two form fields** (programmatic value set) and focuses the submit button; it does **not** auto-submit — the evaluator presses "Sign in", which matches FLOW-001/002 and keeps the demo understandable (AUTH-FE-001). Reveal toggle shows the plaintext password so evaluators can copy credentials.

**Loading state.** Submit disabled (`aria-disabled` + `disabled`), inline 16px spinner in the button, label changes to "Signing in…". Inputs remain enabled for correction. No double submit: submitting again while loading is a no-op.

**Error state — invalid credentials (401).** Replace the alert region content: generic message only, "Invalid email or password. Please try again." (FR-AUTH-002 — never discloses which value failed; single generic message for both unknown user and wrong password; inactive users get the same message per FR-AUTH-003). Alert region rendered with `role="alert"`; focus moves to the alert region for screen readers; inputs keep their values; input fields are not individually marked invalid.

**Error state — network/server (5xx, timeout).** Same region, different copy: "We can't reach the server right now. Please try again." + secondary "Retry" button. Neither path shows technical detail; the RFC 9457 `traceId` is available in the response but is shown only as a small "Reference: `traceId`" caption for support (no stack/SQL/secret leakage, PH-04 API-004).

**Rate-limited state (429, NFR-SEC-004).** Alert region: "Too many attempts. Please wait **58s** before trying again." Submit disabled; a live countdown in the alert (`role="status"`, polite) ticks down from the server `Retry-After` value; when it reaches 0 the submit re-enables and the alert clears. If the countdown is unknown, render "Please try again later." and keep the button disabled for a fixed 60s. No toast-only notification (PH-08 guard).

**Forbidden / read-only.** Not applicable.

### 2.2 Dashboard (`/dashboard`)

**Layout.** App shell (§2.10) + `<main>`. Page header: `<h1>` "Dashboard" + subtitle "What's happening across the studio." Content stack, gap 24px, max-width 1280px, gutter 16px mobile / 24px desktop:

1. **KPI row** — 4 cards, `grid-template-columns: repeat(auto-fit, minmax(180px, 1fr))` (4-up ≥1024px, 2-up 768–1023px, 2-up at 320px). Each card: 20px icon in a colored soft-squircle, label at 14px (`--text-secondary`), value at 30px/600, a status line at 14px. **Whole card is a link** to the filtered board view (FR-DASH-004, DASH-004):

   | Card | Value (server-computed) | Link target |
   |---|---|---|
   | Open | Active tasks not completed and not archived | `/tasks` (active columns) |
   | Overdue | Active tasks with due date before end of today, not completed | `/tasks?due=overdue` |
   | Blocked | Active tasks with status BLOCKED | `/tasks?state=BLOCKED` |
   | Recently completed | Tasks completed within the last 7 days | `/tasks?state=COMPLETED` |

   Color + icon + label, and the value is text — no state conveyed by color alone (NFR-ACC-004). Values that are zero render "0" (a valid, complete state — see Empty below).

2. **My Tasks** — section header: "My Tasks" (18px/600) + "View all" text link → `/tasks`. Body: list of up to **8** rows (DASH-002, bound by role: members see only tasks they can act on; admins see all). Each row: priority badge (§2.11), task title (link, 16px/500, opens the detail panel via `/tasks/:id`), status badge, due date ("Due today" emphasized; overdue in red with icon **and** the word "Overdue"), client name. Row height ≥44px, hover background `--color-gray-50`. Sorted by the contractual sort (priority desc, due asc null last, updated desc — DEC-035).

3. **Recent Activity** — section header "Recent Activity". Feed of TaskChange events the user may see (FR-HIST, FR-DASH-003, DASH-003 — never leak hidden-resource events): each row = actor avatar-initials + "**Name** changed **Task title** from _Pending_ to _In progress_" + relative time ("2h ago"), with title tooltip/absolute time on hover/focus. Bounded to 10 entries. Reverse chronological. No actions on rows (history is immutable, FR-HIST-004); the task title links to the detail panel.

**Loading state.** Skeletons, not spinners: 4 KPI blocks (label-line + 30px number block), then 3–5 list rows (title line + meta line) in each section. The three sections fetch independently; each renders its own skeleton while pending.

**Empty state.** KPIs show real "0" values (no empty state for the row itself — a zero is information). My Tasks empty → contextual panel: 40px icon, "No tasks assigned to you." + primary button "Create task" (opens the same creation dialog as the board) + secondary link "View all tasks". Recent Activity empty → "No recent activity yet." with no CTA. No full-page empty state unless all three are empty and there are no clients.

**Error state.** Full-section failure → inline error panel (§2.11) with "Retry" per section. Total failure (all three) renders the shared error panel in place of the content stack.

**Partial error state.** Each section (KPI / My Tasks / Activity) is an independent query (DASH-003, PH-10). A failed section renders its inline error + retry **while the other sections render normally**; a retry only refetches the failed section. No global failure banner for partial failures.

**Forbidden / read-only.** Not applicable (all authenticated users see the full dashboard).

### 2.3 Board (`/tasks`)

The board is the primary Tasks view for both roles (brief §8.1). Two responsive layouts, no horizontal page scroll on any viewport (DEC-025, NFR-RESP-001).

**Desktop layout (≥1024px).** App shell + `<main>`:

- **Toolbar row** (sticky under the header, background `--color-white`, border-bottom): left — search input (icon, width ~320px); right — "Filters" button (toggle, `aria-expanded`) and "New task" primary button.
- **Filters panel** (collapsible disclosure below toolbar, or inline chips row — one or the other, not both): chips for **Status** (multi: any of the 5), **Priority** (multi), **Assignee** (single: "Anyone" + users), **Client** (single: "Any client" + clients), **Due** (single: Any / Overdue / Today / This week / No due date), plus "Clear all" text button. Active filter count on the "Filters" toggle ("Filters · 2"). Filters are flat query params (FR-TASK-006, TASK-API-009); search searches title **and** description (FR-TASK-007).
- **Backlog section** — above the active columns, full width, collapsible (`aria-expanded` button: "Backlog" + count badge + chevron). Open state: task cards in a list, max-height ~40vh with internal scroll (overflow-y: auto in its own container — never page scroll). Collapsed: only the header row. Backlog cards follow the same card anatomy below; a backlog card may have **no assignee and no due date** (BR-008).
- **Active columns row** — 4 equal-width columns: `grid-template-columns: repeat(4, minmax(0, 1fr))`, gap 16px, each column a `min-height: 60vh` drop target (only inter-column drops are meaningful; same-column drop is a no-op, DEC-035 / PH-09 guard).
  - **Column header:** status color dot + status name ("Pending", "In progress", "Blocked", "Completed") at 14px/600 + count badge (12px, `--color-gray-50` background). Order fixed: Pending → In progress → Blocked → Completed.
  - **Column body:** vertical stack of task cards, gap 12px, min-width 0.

**Mobile layout (320–767px).** App shell with hamburger nav (§2.10). Toolbar: search input full-width + "Filters" toggle + "New task". Filters panel: a disclosure stacking full-width selects/chips (no multi-row chip bar). **No horizontal kanban**: one list, grouped by status in fixed order Pending → In progress → Blocked → Completed, each group with a sticky group header (status dot + name + count) and its cards beneath. Backlog group is its own collapsible group at the top. Task cards are full-width rows.

**Task card anatomy** (both layouts). Card: background `--color-white`, radius 4px, `--shadow-sm`, padding 12px 12px 8px, gap 8px. Left edge: 3px priority color bar (shape + color; the badge also carries text — NFR-ACC-004). Content:
- Title: 16px/500, 2-line clamp, links to `/tasks/:id` (opens panel).
- Badges row: priority badge ("Low"/"Medium"/"High"/"Urgent") and, only when needed for context, status badge (board cards omit the status badge since the column conveys it; mobile list cards **include** the status badge because the group header may be off-screen).
- Meta row: client name (secondary), assignee avatar-initials (24px, with visible name when space allows; otherwise `aria-label`), due date with calendar icon ("May 4" / "Due today" / red "Overdue" with the word Overdue).
- If BLOCKED: a third line "Blocked · _reason preview_" (reason truncated to one line) — never renders the reason alone without the word "Blocked" (text + color).
- **"Move to…" button** — permanent, on every card, for both roles (this is the contractual accessible alternative to drag-and-drop, FR-TASK-005, baseline "Allowed technical patterns"). Opens a menu listing the 4 other statuses (current status shown disabled/labeled "Current: Pending"); the destination rows carry their status name + dot. Keyboard: `Enter`/`Space` opens, arrows navigate, `Esc` closes, focus returns to the button. On mobile the menu may render as a bottom sheet or inline menu. Moving out of Backlog requires an assignee (BR-009): if the card has none, the menu's active-status options are disabled with the hint "Assign someone first", and selecting one opens the edit panel focused on Assignee.

**DnD (progressive enhancement over the Move button, PH-09).** Only after the non-drag flow exists (PH-09 order). Each card has a visible **drag handle** (grip icon, focusable). Behavior contract:
- Pointer/touch drag from handle: card lifts (`--shadow-lg`), column highlights on valid hover, drop outside columns cancels.
- Keyboard drag via handle: `Space` pick up, arrows move between columns, `Space` drop, `Esc` cancel. A `role="status"` region announces "Task moved to In progress" on drop and "Move cancelled" on cancel.
- Only status changes between columns; same-column drop = no-op; no reordering within a column (DEC-035).
- Failed mutation → card snaps back, error announced via `role="alert"`, no false optimistic state (NFR-REL-002).
- Deprecated `aria-grabbed`/`aria-dropeffect` never used; no `role="grid"` (baseline anti-patterns).

**Create flow ("New task").** Modal dialog (`role="dialog"`, `aria-modal="true"` — this is a true modal) with: Title (required), Description, Status select, Priority select, Assignee select (Backlog allowed empty; active statuses list only `ACTIVE` users — BR-004/BR-009), Client select, Due date (date input, optional), Blocked reason (visible + required only when Status = Blocked, BR-010). Save/Cancel; errors per field via `aria-describedby`; focus to first invalid field. On mobile: fullscreen dialog. Success announced via `role="status"` ("Task created"). (TASK-FE-002/003/005.)

**Loading state.** Skeleton: toolbar placeholder + 5 column outlines (header line + 3 card blocks each); the backlog skeleton above them.

**Empty state (no tasks at all).** All columns and backlog empty → centered panel in place of the board: icon, "No tasks yet." + primary "Create your first task". Filters empty → see filtered-empty. (TASK-FE-003 announces result count.)

**Filtered-empty state.** "No tasks match your filters." + "Clear filters" button (clears all active filters, restores the board). Result count announced on every filter/search change via `role="status"` ("12 tasks match" / "No tasks match"). (TASK-FE-003.)

**Error state.** Full-board failure → shared error panel with Retry. **Optimistic move failure** (TASK-FE-012/013): revert the card to its origin column, announce `role="alert"` "Couldn't move the task."; on **409** (stale `expectedVersion`, ADR-004) additionally show an inline banner above the board: "This task was updated by someone else." + "Show latest" button that refetches and re-renders the card from the server's current version. One pending mutation per task; out-of-order responses never overwrite newer state (TASK-FE-013).

**Forbidden state.** Members see no "Archived tasks" entry and no archive controls on cards (BR-015); server rejects anyway. Member attempts an edit on a task they don't own/aren't assigned → fields render read-only (no edit affordances) and any forced API call is answered with 403 mapped to the generic error panel (FLOW-003).

**Read-only state.** Archived tasks are excluded from this view by default (BR-016); they live only under `/tasks/archived` (admin).

### 2.4 Task Detail Panel (`/tasks/:taskId`)

**Desktop (≥1024px).** A **non-modal side panel** anchored right, `width: min(50vw, 560px)` (40–50% of viewport), full height, background `--color-white`, `--shadow-lg` with left border, slide-in 200ms. The rest of the viewport gets a semi-transparent scrim (`rgba(17,24,39,.4)`) — **clicking the scrim closes the panel**. Explicitly **not** `aria-modal="true"` (baseline anti-pattern: a non-modal drawer must not claim modal semantics). Focus moves into the panel on open; `Esc` closes and returns focus to the trigger; the panel is a routed view (`/tasks/:taskId`) so refresh and deep links work, and browser back closes it (TASK-FE-006).

**Mobile (320–767px).** Fullscreen view (not a floating sheet): own page with a "← Back to tasks" button at top (also closes via browser back), no scrim, no `aria-modal`. Same content, single column.

**Panel anatomy** (top to bottom, gap 16px, padding 20px):

1. **Header row** — left: status badge + priority badge + (if archived) "Archived" badge; right: close button (X on desktop, back arrow on mobile). Below: task title at 20px/600 — inline editable on click (edit mode) or via "Edit" affordance.
2. **Controls block** — a 2-column field grid (1 column on mobile), each with a visible label: **Status** select, **Priority** select, **Assignee** select (active users; empty allowed only in Backlog), **Client** select, **Due date** date input (date-only, BR-019/020). Blocked reason textarea (visible and required only while BLOCKED, BR-010; when not blocked the field is hidden — the reason survives only in history, BR-011).
3. **Description block** — label "Description", multiline text, editable in edit mode; empty shows "No description."
4. **History timeline** — label "History". Reverse-chronological, append-only, immutable (FR-HIST-001/004). Each entry: event icon, "**Actor name** changed **field** from _old_ to _new_", absolute timestamp + relative ("Aug 11, 14:32 · 2h ago"). Creation entry: "**Name** created this task". Value pairs rendered as styled text (monospace only for values, 12px, secondary) — old value struck-through is **not** used (color+decoration alone); both values are text. No edit/delete affordances (FR-HIST-004). (TASK-FE-007.)
5. **Footer actions** — sticky bottom: "Move to…" menu (same contract as the card, §2.3), "Reopen" (only when COMPLETED, any editor, BR-012), "Archive task" (admin only, BR-015, opens confirm dialog: "Archive 'title'? This task becomes read-only." — Cancel / Archive). No delete anywhere (DEC-010).

**States.**

- **Loading:** skeleton panel — header bar + 2 field-line blocks + timeline lines.
- **Not found (404):** panel content replaced by "Task not found, or you don't have access to it." + link "Back to tasks". (Same copy for hidden-by-permission, no enumeration.)
- **Error:** panel-level shared error panel + "Retry".
- **Edit mode:** triggered by "Edit" (or clicking the title); editable fields switch to inputs with per-field inline errors (`aria-describedby`), bottom bar Save (primary, disabled while invalid or saving, spinner while saving) / Cancel (restores previous values). Server validation errors (RFC 9457) map to fields; a non-field error (e.g., 403, 409) renders as an alert banner inside the panel. On **409**: banner "This task was changed by someone else." + "Show latest" (refetch and re-render with the server's current `version`); the edit is not silently overwritten (ADR-004).
- **Read-only (archived, BR-016):** "Archived" badge + info banner "This task is archived and read-only." All fields render as plain text (no selects/inputs), no Move/Reopen/Archive/Edit controls, history fully visible.
- **Forbidden (member, unrelated task, BR-013):** fields render as read-only text with no edit affordances; the panel shows no error — only the server answer would be 403, mapped to a generic error if it ever surfaces.
- **Out of scope:** comments, attachments, labels (PRD §8 excluded).

### 2.5 Clients (`/clients`)

**Layout.** App shell + `<main>`. Header row: `<h1>` "Clients" + "New client" primary button (**any active user**, FR-CLI-003). Toolbar: search input (matches company/contact name, debounced) + status filter select (All / Active / Inactive — **Archived is excluded from this list** by default, FR-CLI-005/BR-005) + result count (`role="status"`). Content: responsive table.

**Table (≥768px).** Columns: Client (company name, 16px/500, link to detail; secondary line = industry), Primary contact (name + email), Status badge (Active / Inactive), Updated (relative date), Actions (right-aligned: "Edit" and "Archive"/"Deactivate" — **admin only**, FR-CLI-004; members see no actions). Row min-height 48px. Caption `<caption class="sr-only">` listing purpose; `<th scope="col">` for headers.

**Mobile (<768px).** Table converts to stacked rows: line 1 = company name + status badge; line 2 = contact; line 3 = updated + (admin) edit/archive icon buttons with text labels. No horizontal page scroll.

**Pagination (FR-CLI-001, NFR-PERF-003).** Footer: "1–25 of 64" + Prev/Next buttons (disabled at bounds) + optional page numbers. Offset pagination, default limit 25, max 100 (PH-01 §5). Filtering/search reset to page 1.

**Create dialog ("New client").** Modal with visible labels: Company name (required, ≤160), Industry (≤80), Contact name (≤100), Contact email (required, valid, ≤254), Phone (optional, ≤32), Notes (optional, ≤2000, textarea). Save/Cancel, per-field errors, focus to first invalid field, success via `role="status"` ("Client created"). (CLI-FE-002.)

**Deactivate / Archive (admin).** "Deactivate" → confirm dialog ("Deactivate _Acme_? Existing tasks stay linked; it won't accept new activity." — relationships retained, PH-05 CLI-API-005). "Archive" → confirm dialog, stronger wording: "Archive _Acme_? No new tasks can be linked to an archived client." (FR-CLI-006). Both are soft operations; no physical delete (brief §8).

**States.**

- **Loading:** skeleton table (header line + 6 row blocks).
- **Empty (no clients exist):** centered panel "No clients yet." + primary "Create your first client".
- **Filtered-empty:** "No clients match your search." + "Clear search" / "Clear filters" buttons.
- **Error:** shared error panel + Retry; search/pagination state preserved across retry.
- **Forbidden:** member sees no Edit/Archive/Deactivate buttons (UI) — server still enforces (BR-006). Route is not admin-only, so no `/403` here.
- **Read-only:** archived clients are not listed; their details render read-only with the archive banner (§2.6).

### 2.6 Client Detail (`/clients/:clientId`)

**Layout.** App shell + `<main>`. Header card (padding 24px, `--shadow-sm`): left — `<h1>` company name (20px/600) + industry as secondary line + status badge; right — (admin) "Edit", "Deactivate"/"Archive" buttons. Content grid: left column (span 1) = **Contact & details card**: Primary contact (name, email link `mailto:`, phone), Notes block (pre-wrap, secondary). Right column (span 2) = **Related tasks card**: header "Tasks" + count; paginated task list (title link → `/tasks/:id` panel, priority badge, status badge, assignee, due date); footer pagination (Prev/Next, same contract as §2.5). Archived client → "New task" is not offered (FR-CLI-006).

**States.**

- **Loading:** skeleton header card + skeleton task rows.
- **Not found (404):** shared not-found panel "Client not found, or you don't have access to it." + "Back to clients". Member requesting an archived client resolves here too (BR-005, no enumeration).
- **Error:** shared error panel + Retry.
- **Archived (read-only):** "Archived" badge + banner "This client is archived and read-only. It can't be linked to new tasks." (FR-CLI-006). Admin: no Edit/Deactivate/Archive controls; tasks remain listed. Non-archived: admin Edit opens the update dialog (field-level allowlist, PH-05 CLI-API-004); Deactivate/Archive keep the confirm contracts of §2.5.
- **Forbidden:** as in §2.5 (member: no admin actions rendered).
- **Empty (related tasks):** "No tasks for this client." + (non-archived) primary button "Create task" pre-filling the client.

### 2.7 Users (`/users`) — Admin only

**Route.** Non-admin → `/403` at the router level (AUTH-FE-003), and the API independently answers 403 (USR-001). **Layout.** App shell + `<main>`. Header: `<h1>` "Users" + "New user" primary button (USR-002). Toolbar: search (name or email, debounced) + result count. Table columns: User (avatar-initials + name, 16px/500), Email, Role badge (Admin / Member), Status badge (Active / Inactive), Last login (relative date or "Never"), Actions ("Edit", admin-scoped by definition). Same table responsive rules as §2.5 (stacked rows on mobile; no horizontal page scroll).

**Create user dialog (USR-FE-001).** Modal fields, all visible-labeled: Name (≤100), Email (normalized `trim().toLowerCase()`, unique — conflict returns a stable "already in use" message), Role (Admin / Member), Initial password (with "Show" toggle + strength hint ≥12 chars; autocomplete="new-password"). Save → success view **inside the dialog**: "User created." + one-time display of the temporary password with a Copy button + "I've saved the password" acknowledge button. The password is **never shown again** anywhere (PH-08 guard "initial password is not redisplayed"); no password value appears in any response after creation (USR-001).

**Edit user dialog (USR-003).** Name (editable), Role select, Status (Active / Inactive radio-style buttons). Save/Cancel.

**Deactivation impact modal (FR-USR-005, USR-FE-002).** Triggered when an admin sets Status → Inactive (and only then). Content, in order:
1. Heading: "Deactivate {name}?"
2. Impact summary: "This user has **N active task(s)**." + list of those open tasks (title, status, due) — the system identifies the work requiring reassignment (bounded list with count).
3. Reassignment control: "Reassign their active tasks to" + assignee select (active users, default = current admin). Confirmation copy: "Inactive users can't log in or receive new work." (BR-001, BR-004).
4. Actions: Cancel / "Deactivate & reassign" (danger button). No active work → the modal still appears with "No active tasks will be affected." and a plain "Deactivate" confirm (or the impact section collapses to that note).

**Last-admin conflict (BR-003, USR-005).** If deactivating or demoting would leave zero active administrators, the dialog cannot confirm: inline error banner inside the modal "You can't deactivate the last active administrator." + the Save/Deactivate button disabled. The server enforces the same in a serializable transaction (PH-04 USR-005); a server-side race surfaces as a generic error banner with Retry.

**States.**

- **Loading:** skeleton table.
- **Empty:** "No users yet." (only reachable pre-seed in a real deploy).
- **Filtered-empty:** "No users match your search." + clear.
- **Error:** shared error panel + Retry.
- **Forbidden:** `/403` page; member never reaches this route (PH-08: "direct member /users handling").
- **Read-only:** an **Inactive** user's row is normal (badge Inactive, gray-tinted avatar); deactivated users keep authorship and history (brief §5) — no deletion ever (DEC-010).

### 2.8 Profile (`/profile`)

**Layout.** App shell + `<main>`. Centered card, max-width 560px, padding 24px. Header: avatar-initials (40px) + `<h1>` "Profile". Body, two-column grid on ≥768px, single column below:
- **Name** — editable input, visible label, with Save / Cancel; saving disables the button + spinner ("Saving…"); success announced `role="status"` ("Name updated"). (PROF-FE-001, FR-USR-006.)
- **Email** — read-only field (label + value, no input) — identity is immutable.
- **Role** — read-only badge (Admin / Member).
- **Member since** — read-only date.
- **Status** — read-only (Active/Inactive); an inactive user cannot be on this page (BR-001) but the field stays honest.

**States.** Loading: skeleton card. Error: shared error panel + Retry. Saving error: inline banner in the card (e.g., 409/500) with Retry; form values preserved. Validation error: inline under Name + focus to the field. Forbidden / read-only: not applicable beyond the read-only fields above (name is the only writable field; PH-04 PROF-001 allows only own-field changes).

### 2.9 Error Pages

Both render **inside the app shell when authenticated** (nav remains usable; 403 must not log the user out, AUTH-FE-002) and **standalone when unauthenticated**.

- **`/403` — Forbidden:** centered column: 64px icon (shield/lock), `<h1>` "Access denied", message "You don't have permission to view this page." + primary link "Back to dashboard" + secondary "Sign out" (only when authenticated). No session termination on render.
- **`/404` — Not found:** centered column: 64px icon, `<h1>` "Page not found", message "The page you're looking for doesn't exist or was moved." + "Back to dashboard" (or "Go to login" when unauthenticated). Covers unknown routes and hidden-by-permission resources (no enumeration).

Both pages: same visual language as empty states (§2.11), status text is a real `<h1>`, no color-only signal.

### 2.10 App Shell (shared, FE-005)

Applied to `/dashboard`, `/tasks`, `/tasks/archived`, `/clients`, `/clients/:clientId`, `/users`, `/profile`. Structure:

- **Skip link** — first focusable element: "Skip to main content", `href="#main"`, visually hidden until `:focus-visible` (absolute, top 8px, left 8px, `--shadow-md`). No `aria-hidden`.
- **`<header>` (banner)** — sticky, height 56px, background `--color-white`, bottom border. Left: brand lockup (32px mark + "Briefline", link → `/dashboard`). Center/left: `<nav aria-label="Main">` with links Dashboard, Tasks, Clients, **Users** (admin only), Profile; active link `aria-current="page"`. Right: user menu — avatar-initials + name button (44px target, `aria-haspopup="menu"`, `aria-expanded`); menu items: "Profile", "Sign out". Sign out: local logout (FR-AUTH-004) — clears cookie + cache, redirects `/login`; no confirmation needed.
- **Mobile (<768px):** hamburger button (44px, `aria-expanded`) opens a navigation drawer (true modal dialog with focus trap + `Esc` close) containing the same nav items + user menu; the brand link stays visible in the header.
- **`<main id="main">`** — exactly one per page, `tabindex="-1"` for skip-link focus, page `<h1>` inside each page's first section (headings hierarchy: one h1 per route, no skipped levels).
- **Live region** — one mounted `role="status"` (polite) region and one `role="alert"` region, app-wide, for status messages and errors (FE-003); never per-component scattered regions.
- **Footer** — minimal, inside shell only where useful (demo disclaimer on login only).

### 2.11 Shared state patterns (referenced above)

- **Skeleton** — neutral gray blocks with a soft pulse (only where motion is decorative; see §5 reduced-motion); never used as a loading *indicator* for mutations (buttons use inline spinners; NFR-PERF-001: perceptible feedback ≤100 ms).
- **Empty state** — centered panel: 40px icon, title (16px/600), message (secondary), optional CTA button(s). Used by Dashboard, Board, Clients, Client tasks, Users.
- **Error state** — inline panel: error icon + "Something went wrong." + secondary explanation + primary "Retry" button; optional "Reference: `traceId`" caption (RFC 9457). Never toast-only (PH-08 guard); never exposes stack/SQL/secrets (API-004).
- **Alert / banner** — `role="alert"` inline banner for blocking feedback (invalid login, 409, last-admin conflict, archive conflicts).
- **Status message** — `role="status"` (polite) for async completions: "Task created", "Moved to In progress", "Name updated", "Client created", result counts.
- **Badges** — pill (radius 9999px), padding 4px 8px, 12px/600; pair of tinted background + dark 700-shade text with the label always present. Priority and status badge tokens in §3.2.
- **Buttons** — primary (blue-600 fill, white text), secondary (white fill, gray-700 text, border), ghost (text only), danger (red-600 fill or red text variant); min-height 44px; radius 6px; disabled = gray-100 fill + gray-400 text, with the state never conveyed by color alone when meaningful.
- **Drawer vs Dialog** — drawer (task panel) is non-modal, no `aria-modal`, background stays in the accessibility tree; dialog (create/edit/confirm) is `aria-modal="true"`, focus trap, initial focus on first control, focus restored on close.
- **Move menu** — popover menu, `role="menu"` or disclosure-listbox pattern with `aria-expanded`, `Esc` closes, focus returns to trigger, current status shown disabled.

---

## 3. Design Tokens

Light theme only (DEC-026). Tokens are expressed as CSS custom properties so they translate 1:1 to the design system (FE-006). Names follow `--<group>-<variant>-<step>`.

### 3.1 Typography

```css
--font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
  "Helvetica Neue", Arial, sans-serif;          /* system stack, no webfonts (demo perf, NFR-PERF-002) */
```

**Scale** (fluid only at the two page-title steps; body steps fixed):

| Token | Size | Weight | Line-height | Usage |
|---|---|---|---|---|
| `--text-xs` | 12px | 400 / 600 | 1.4 | Badges, captions, timestamps, table meta |
| `--text-sm` | 14px | 400 / 500 | 1.4 | Secondary text, labels, table cells, menu items |
| `--text-base` | 16px | 400 / 500 | 1.5 | **Base body**, inputs, task titles, list rows |
| `--text-lg` | 18px | 600 | 1.4 | Section titles (My Tasks, Recent Activity), card titles |
| `--text-xl` | 20px | 600 | 1.3 | Panel titles, client h1, KPI labels context |
| `--text-2xl` | 24px | 600 | 1.2 | Page titles (`<h1>` Dashboard, Clients, Users, Tasks) |
| `--text-3xl` | 30px | 600 | 1.2 | KPI numbers, error-page h1 |
| `--text-4xl` | 36px | 700 | 1.2 | Reserved (login hero / 403–404 display if needed) |

Weights: 400 regular, 500 medium, 600 semibold, 700 bold. Line heights: 1.2 headings, 1.4 compact, 1.5 body. `--text-secondary` for secondary copy; `letter-spacing: normal` everywhere (uppercase-only labels are avoided; if a 12px uppercase label is used it must be `--text-secondary` or darker — contrast rule below).

### 3.2 Colors

Base palette (Tailwind-style grays and brand blues):

```css
--color-white:        #FFFFFF;
--color-surface:      #F9FAFB;   /* page background, gray-50 */
--color-gray-100:     #F3F4F6;   /* hover fills, disabled fills */
--color-gray-200:     #E5E7EB;   /* borders, dividers, column skeletons */
--color-gray-300:     #D1D5DB;   /* disabled borders */
--color-gray-400:     #9CA3AF;   /* disabled text  (--text-disabled) */
--color-gray-500:     #6B7280;   /* secondary text (--text-secondary) */
--color-gray-600:     #4B5563;
--color-gray-700:     #374151;
--color-gray-800:     #1F2937;
--color-gray-900:     #111827;   /* primary text   (--text-primary) */
```

Brand and focus:

```css
--color-primary-50:   #EFF6FF;   /* selected/hover fills */
--color-primary-100:  #DBEAFE;
--color-primary-600:  #2563EB;   /* button fills — white on #2563EB = 4.54:1, passes AA */
--color-primary-700:  #1D4ED8;   /* text links — on white = 7.0:1 */
--color-focus-ring:   #2563EB;   /* 2px outline, 2px offset */
```

> **Note (a11y-driven choice).** Plain `#3B82F6` (blue-500) fails AA for white button text (≈3.7:1) and normal text on white (≈3.7:1). It is therefore **not** used for fills or text; it appears only as decorative icon tinting on `--color-primary-50` backgrounds where it carries no information. Buttons use blue-600, text uses blue-700.

Semantic (badge/alert pairs — dark 700 text on tinted 50 background, all ≥4.5:1 on white):

```css
/* Success (green)   */ --success-50:#F0FDF4; --success-700:#15803D; --success-border:#BBF7D0;
/* Warning (amber)   */ --warning-50:#FFFBEB; --warning-700:#B45309; --warning-border:#FDE68A;
/* Error (red)       */ --error-50:#FEF2F2;   --error-700:#B91C1C;   --error-border:#FECACA;
/* Info (blue)       */ --info-50:#EFF6FF;    --info-700:#1D4ED8;    --info-border:#BFDBFE;
/* Danger fill       */ --danger-600:#DC2626; /* white text on #DC2626 ≈ 4.5:1 */
```

Priority badges — text on tinted background, label always present (NFR-ACC-004):

| Priority | Text | Background | Border |
|---|---|---|---|
| LOW (gray) | `--gray-600` #4B5563 | `--gray-100` #F3F4F6 | `--gray-200` #E5E7EB |
| MEDIUM (blue) | `--primary-700` #1D4ED8 | `--primary-50` #EFF6FF | `--primary-100` #DBEAFE |
| HIGH (orange) | #C2410C (orange-700, 4.5:1) | #FFF7ED | #FED7AA |
| URGENT (red) | `--error-700` #B91C1C | `--error-50` #FEF2F2 | `--error-border` #FECACA |

Status badges — same pairing, plus the column dot (dot is always accompanied by the status name text):

| Status | Text | Background | Border | Dot |
|---|---|---|---|---|
| BACKLOG (gray) | `--gray-600` | `--gray-100` | `--gray-200` | `--gray-500` |
| PENDING (blue) | `--primary-700` | `--primary-50` | `--primary-100` | `--primary-600` |
| IN_PROGRESS (amber) | `--warning-700` #B45309 | `--warning-50` #FFFBEB | `--warning-border` | #D97706 |
| BLOCKED (red) | `--error-700` | `--error-50` | `--error-border` | `--error-700` |
| COMPLETED (green) | `--success-700` #15803D | `--success-50` #F0FDF4 | `--success-border` | #16A34A |

Text roles: `--text-primary: #111827`, `--text-secondary: #6B7280` (4.83:1 on white — passes for 12px+), `--text-disabled: #9CA3AF`, `--text-inverse: #FFFFFF`. Backgrounds: `--color-white` (cards, panels, inputs), `--color-surface` (page), borders `--color-gray-200` (default) / `--color-gray-300` (emphasis). Overdue dates: `--error-700` text + calendar icon **+ the word "Overdue"** (text + color + shape).

### 3.3 Spacing

4px base unit:

```css
--space-1: 4px;   /* micro gaps, badge padding */
--space-2: 8px;   /* tight gaps, icon-to-label */
--space-3: 12px;  /* card internal, chip gaps */
--space-4: 16px;  /* card padding, list gaps (default) */
--space-5: 20px;  /* section inner padding */
--space-6: 24px;  /* page gutter (desktop), card padding large */
--space-8: 32px;  /* section spacing, modal padding */
--space-10: 40px; /* panel padding, large section gaps */
--space-12: 48px; /* page stack gaps */
--space-16: 64px; /* empty-state vertical rhythm */
```

Defaults: page gutter 16px mobile / 24px desktop; content max-width 1280px; card padding 16–20px; column gap on board 16px.

### 3.4 Border Radius

```css
--radius-sm: 4px;     /* inputs, cards, table rows, buttons-sm */
--radius-md: 6px;     /* buttons */
--radius-lg: 8px;     /* modals, dialogs, drawers/panels, cards at large density */
--radius-full: 9999px; /* badges, pills, avatars, toggle dots */
```

### 3.5 Shadows

```css
--shadow-none: none;
--shadow-sm: 0 1px 2px rgba(16, 24, 40, 0.05);              /* cards, table rows */
--shadow-md: 0 4px 6px -1px rgba(16, 24, 40, 0.08), 0 2px 4px -2px rgba(16, 24, 40, 0.05);  /* dropdowns, menus, popovers */
--shadow-lg: 0 10px 15px -3px rgba(16, 24, 40, 0.10), 0 4px 6px -4px rgba(16, 24, 40, 0.05); /* modals, panels, lifted drag cards */
```

### 3.6 Motion

```css
--duration-fast: 150ms;  /* micro-interactions: hover, focus, button press */
--duration-base: 200ms;  /* transitions: color, borders, drawer slide-in */
--duration-slow: 300ms;  /* entrance/exit: dialog fade+scale, panel slide */
--ease-standard: cubic-bezier(0.2, 0, 0, 1);
```

Rules: motion is decorative only, never required to understand or operate the UI. All interactive state changes (hover, focus, pressed) run ≤150ms. Drawer/dialog entrance 200–300ms. **`@media (prefers-reduced-motion: reduce)`: all durations → 0ms, no transforms or slides; skeletons stop pulsing; content appears instantly** (WCAG 2.3.3). Mutation feedback must be perceptible within 100 ms (NFR-PERF-001): optimistic UI + immediate focus/status-message, not an animation wait.

---

## 4. Responsive Contract

Mobile-first, `min-width` breakpoints (baseline: preserve information at 320 CSS px and 400% zoom):

```css
/* base: mobile 320–767px */
@media (min-width: 768px)  { /* tablet 768–1023px */ }
@media (min-width: 1024px) { /* desktop ≥1024px */ }
```

| Aspect | Desktop ≥1024px | Tablet 768–1023px | Mobile 320–767px |
|---|---|---|---|
| Layout | Full multi-column; board = 4 active columns + collapsible backlog | Board functional: 4 columns **or** 2×2 column grid (whichever reads at the actual width); panels → fullscreen | Single column everywhere; **no horizontal kanban** (DEC-025): board renders the grouped-by-status list; every panel/filter/dialog fullscreen or stacked |
| Task detail (`/tasks/:id`) | Non-modal side panel, `min(50vw, 560px)` + scrim | Fullscreen view (no floating panel) | Fullscreen view with "← Back" |
| KPI row | 4 across | 2×2 | 2×2 (min 180px each) |
| Navigation | Horizontal nav in header | Horizontal nav in header (or hamburger if items overflow) | Hamburger drawer (modal, focus trap, Esc) |
| Tables (clients/users) | Full table + pagination footer | Full table | Stacked rows; **no horizontal page scroll** (internal scroll only inside its own container, never the page) |
| Board filters | Chips row / disclosure inline | Disclosure panel | Stacked full-width controls in a disclosure |
| Search + "New task" | Inline toolbar | Inline toolbar | Full-width stacked toolbar |
| Page gutter | 24px | 24px | 16px |
| Touch targets | 44×44 min | 44×44 min | 44×44 min (finger-first) |

Hard rules:

1. **320px minimum:** the page never scrolls horizontally at 320px viewport width; wide content (tables) scrolls inside its own bounded container with `overflow-x: auto` (WCAG 1.4.10 reflow-compatible pattern).
2. **400% zoom:** layout reflows (fluid widths, `minmax(0, 1fr)` grids, `min-width: 0` on grid children) so at 400% zoom (≈320px effective viewport) content is usable with no horizontal page scroll and no lost content; nothing is clipped by fixed pixel widths beyond the token scale.
3. Text resizes to 200% without clipping or overlapping (line heights 1.4–1.5 absorb reflow).
4. Panels: width is `min(50vw, 560px)` (clamped), never fixed `vw` that breaks at 1024px.
5. Filter/status state is never lost on resize (single source of truth in route/query state where specified).

---

## 5. Accessibility Contract

Target: WCAG 2.2 Level AA for main flows (NFR-ACC-001, DEC-018). Each item maps to implementation + QA evidence (QA-006/QA-007, PH-11).

| # | Contract item | Requirement (WCAG 2.2) | Implementation note |
|---|---|---|---|
| AC-01 | **Skip link** | 2.4.1 Bypass Blocks | First focusable element, "Skip to main content", `href="#main"`, visually hidden until `:focus-visible`, visible-on-focus styling with `--shadow-md`; `#main` is `tabindex="-1"` |
| AC-02 | **Landmarks** | 1.3.1 Info & Relationships | `<header>` (banner), `<nav aria-label="Main">` (and labeled user menu if separate), `<main>` (exactly one), `<footer>`; multiple navs get distinct labels; heading hierarchy: exactly one `<h1>` per route, no skipped levels |
| AC-03 | **Visible focus** | 2.4.7, 2.4.11 | 2px outline `--color-focus-ring` with 2px offset on all focusable elements, including cards, table rows (if interactive), menu items; no focus removal; focus order follows DOM order; active nav item `aria-current="page"` |
| AC-04 | **Contrast** | 1.4.3, 1.4.11 | Normal text ≥4.5:1 (12px badge text uses 700-shade colors on tinted backgrounds; secondary `#6B7280` on white = 4.83:1 passes); large text (≥18px bold or ≥24px) ≥3:1; UI components and meaningful icons/controls ≥3:1 (button borders, focus rings, input borders vs adjacent background) |
| AC-05 | **Touch targets** | 2.5.8 (min 24×24), internal rule 44×44 | All primary and secondary actions ≥44×44 CSS px (baseline "Derived requirements"); icon buttons get a 44px hit area around a 20–24px glyph; adjacent targets ≥4px apart |
| AC-06 | **Zoom / reflow** | 1.4.4, 1.4.10 | Functional at 320px and 400% zoom, no horizontal page scroll, no content loss (Responsive Contract §4) |
| AC-07 | **Reduced motion** | 2.3.3 | `prefers-reduced-motion: reduce` → 0ms durations, no slides/transforms, no skeleton pulse; motion is never required to operate (Motion §3.6) |
| AC-08 | **Color independence** | 1.4.1 | No state communicated by color alone: badges always include text labels; priority/status columns include the status name; overdue includes the word "Overdue"; errors include message text + icon; focus rings are shape-based |
| AC-09 | **Forms** | 3.3.1, 3.3.2, 3.3.3, 3.3.4 | Visible `<label>`s (never placeholder-only, baseline anti-pattern); `autocomplete` attributes on email/password/name; paste and password managers allowed (baseline); per-field errors with `aria-describedby`; submit blocked with inline summary when invalid; focus moves to first invalid field; successful submit announced (`role="status"`) |
| AC-10 | **Drag-and-drop alternative** | 2.5.7 Dragging Movements (parity), 2.5.8 | Permanent "Move to…" control on every card, fully keyboard operable — the *only* required path; DnD is enhancement; focusable handle with `Space`/arrows/`Esc` keyboard protocol; dropped state announced via `role="status"`; cancelled/error via `role="alert"`; no `aria-grabbed`/`aria-dropeffect`; no `role="grid"` without its complete keyboard model; same-column drop is a no-op (baseline anti-patterns) |
| AC-11 | **Status messages** | 4.1.3 | One mounted `role="status"` (polite) region and one `role="alert"` region, app-wide (FE-003); used for async completions, errors, result counts ("12 tasks match"), optimistic-move results; never duplicate live regions per component |
| AC-12 | **Dialogs & drawer** | 4.1.2, APG dialog pattern | True modals (create/edit/confirm): `aria-modal="true"`, focus trap, initial focus on first control, `Esc` closes, focus restored to trigger. Task detail panel: **non-modal drawer, never `aria-modal="true"`** (baseline anti-pattern), focus moved in on open and returned on close, `Esc` closes, scrim click closes (desktop) |
| AC-13 | **Keyboard operability** | 2.1.1, 2.1.2 | Every action reachable by keyboard: search with focusable clear button, filter chips, pagination, "Move to…" menus, status/priority/assignee/due selects, create dialogs, archive confirms; no hover-only actions, no clickable `div`s (baseline anti-patterns); no keyboard traps outside true modals |
| AC-14 | **Semantic HTML** | 1.3.1, 4.1.2 | Native controls first (`<button>`, `<input>`, `<select>`, `<textarea>`, `<table>` with caption + `th scope`); icons `aria-hidden="true"` when decorative with text labels elsewhere; `lang="en"` on `<html>`; visible label text on every control |
| AC-15 | **Error recovery** | 3.3.4 | Input values preserved across failed submissions; optimistic mutations always roll back with an alert (NFR-REL-002); 409 offers "Show latest" instead of silently overwriting (ADR-004); 403 never triggers logout (AUTH-FE-002); generic 401 keeps the "next" destination |
| AC-16 | **Screen-reader evidence** | — | QA-007: keyboard-only pass of FLOW-001/002, axe on primary routes/states (no serious/critical), and a manual screen-reader session (board, panel, dialogs, move menu) — automation is never the only proof (PRD §16) |

Per-route focus contract for panel navigation: open panel → focus to panel title; close → return to the card's "Move to…" button (or the trigger element); browser back closes the panel with the same focus return (TASK-FE-006). History timeline exposes old/new values as text (FR-HIST-003) — never color or strikethrough alone.

---

## Traceability summary

| Deliverable | Covers | Mapped to |
|---|---|---|
| Sitemap (§1) | FR-AUTH-005, FR-USR-003 route gating, AUTH-FE-002/003, PH-01 minimum routes | PRD §13; plan PH-08 |
| Login (§2.1) | FR-AUTH-001/002/003, NFR-SEC-004, AUTH-FE-001 | PRD §13/14; plan PH-08 |
| Dashboard (§2.2) | FR-DASH-001–004, DASH-001/002/003/004 | PRD §13; plan PH-10 |
| Board (§2.3) | FR-TASK-001/002/004/005/006/007/012, DEC-025/035, TASK-FE-002/003/004/008/010/011/012/013 | PRD §13; plan PH-09 |
| Task detail (§2.4) | FR-TASK-008/009/010, FR-HIST-001/002/003/004, BR-007/009/010/011/013/014/015/016, TASK-FE-005/006/007/009 | PRD §11–13; plan PH-09 |
| Clients (§2.5/2.6) | FR-CLI-001–006, BR-005/006, CLI-FE-001–004 | PRD §13; plan PH-08 |
| Users (§2.7) | FR-USR-001/002/003/004/005, BR-003/004, USR-FE-001/002 | PRD §13; plan PH-08 |
| Profile (§2.8) | FR-USR-006, PROF-FE-001, PROF-001 | PRD §13; plan PH-04/08 |
| Error pages (§2.9) | AUTH-FE-002/003, FE-010 | plan PH-07/08 |
| App shell + patterns (§2.10/2.11) | FE-005/007/008, baseline "Allowed technical patterns" + anti-patterns | plan PH-07 |
| Tokens (§3) | DEC-026, FE-006, UX-002 acceptance | plan PH-07 |
| Responsive (§4) | DEC-025, NFR-RESP-001, NFR-COMP-001, 320px/400% baseline | PRD §14; plan PH-07/11 |
| Accessibility (§5) | NFR-ACC-001–004, WCAG 2.2 AA, QA-006/007 | PRD §14/16; plan PH-11 |

**Open points for PH-01 review:** (1) deactivation reassignment is modeled as "choose one new assignee for all active tasks" in §2.7 — confirm the API surface (USR-004) returns the task list and accepts bulk reassignment; (2) archived-client editability is specified as read-only for admins (§2.6) — ARCH to confirm against CLI-API-004; (3) `recently completed` window is 7 days (§2.2) — confirm with the dashboard contract (TASK-API-011).
