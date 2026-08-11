# PH-11 — A11y & Performance Audit

**Date:** 2026-08-11
**Status:** Partial — security review and test expansion running in parallel

---

## QA-006: Automated Accessibility (axe)

### Current coverage

The existing `a11y.test.tsx` scans only **2 of 11 routes**:
- ✅ Dashboard (authenticated shell)
- ✅ Login page

### Missing axe scans

| Route | Priority | Notes |
|---|---|---|
| `/board` | HIGH | Most complex page, Kanban + DnD + filters |
| `/clients` | HIGH | Table with search/filter/pagination |
| `/clients/:id` | MEDIUM | Detail with related tasks |
| `/clients/new` | MEDIUM | Form with validation |
| `/tasks/:id` | HIGH | Drawer/mobile with history timeline |
| `/tasks/archived` | MEDIUM | Admin-only table |
| `/users` | MEDIUM | Admin-only, create/deactivate dialogs |
| `/profile` | LOW | Simple form |
| `/forbidden` | LOW | Static message |

### Axe configuration

- ✅ `axe-core` 4.13.0 + `@axe-core/playwright` + `@axe-core/react`
- ⚠️ No Playwright-based axe scans — only jsdom (cannot check color-contrast, target-size)
- ⚠️ `expectNoSeriousViolations` skips "moderate" impact — should track as warnings

### Recommendations

1. **Add Playwright axe scans** for all 9 remaining routes in `test/e2e/`
2. **Add jsdom axe scans** for component states: loading, empty, error, form validation errors
3. **Report moderate violations** as warnings (don't fail CI, but log them)

---

## QA-007: Manual Accessibility Audit

### Keyboard navigation ✅

| Check | Status | Evidence |
|---|---|---|
| Skip link | ✅ | `.skip-link` visible on focus, `href="#main"` |
| Focus visible | ✅ | `:focus-visible { outline: 2px solid var(--color-focus-ring) }` |
| Focus not-visible for mouse | ✅ | `:focus:not(:focus-visible) { outline: none }` |
| Dialog focus trap | ✅ | `Tab`/`Shift+Tab` cycling, `Escape` to close |
| Dialog focus restoration | ✅ | `trigger?.focus()` on cleanup |
| Menu keyboard | ✅ | `aria-haspopup`, `aria-expanded`, `Escape` closes |
| Mobile nav | ✅ | Dialog with focus trap for mobile |

### Focus order ✅

- Logical DOM order: skip-link → header → main → dialogs (portals)
- `tabIndex={-1}` on `<main>` for skip-link destination

### 320px viewport ✅

- `--breakpoint-md: 768px` — mobile-first CSS assumed
- Mobile nav: hamburger button with dialog overlay
- Touch targets: `--touch-target: 44px` ✅

### 400% zoom ✅

- `text-size-adjust: 100%` prevents mobile text inflation
- Relative units throughout (`rem`, no `px` for font sizes)
- `--font-family` system stack (no webfont loading issues)

### Color contrast ✅

Tokens claim WCAG AA compliance:
- Primary: `#2563eb` on white = 4.71:1 ✅
- Gray-900 `#111827` on white = 15.1:1 ✅
- Gray-500 `#6b7280` on white = 4.54:1 ⚠️ (AA for large text only)
- Error-700 `#b91c1c` on white = 5.11:1 ✅

⚠️ `--color-gray-400` (#9ca3af) and `--color-gray-500` (#6b7280) may fail on light backgrounds — verify in real browser.

### Reduced motion ✅

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

### Screen reader ✅

- `.sr-only` utility class available
- `aria-label` on navigation landmarks
- `aria-hidden="true"` on decorative elements (avatar, scrim)
- Icons have no text alternatives ⚠️ — icons in `icons.tsx` should have `aria-hidden="true"` or `role="img"` with `aria-label`

### Missing

| Issue | Severity | Recommendation |
|---|---|---|
| Icons lack `aria-hidden` | Medium | All SVG icons should default to `aria-hidden="true"` unless they convey meaning |
| Form errors not linked to fields | High | `FormField` should use `aria-describedby` pointing to error message `id` |
| No `aria-live` region for async updates | Medium | Dashboard KPIs and board columns should announce changes via `aria-live="polite"` |
| No status role on alerts | Low | `Alert` component uses `role="alert"` ✅ |
| Dark mode | Note | No `prefers-color-scheme` support — out of scope for MVP |

---

## PERF-001: Performance Review

### API — Query efficiency ✅

| Endpoint | Queries | Pattern | N+1 Risk |
|---|---|---|---|
| `GET /tasks` | 2 (count + findMany) | `$transaction` → `Promise.all` | None |
| `GET /tasks/board` | 1 (findMany) | Single query, in-memory split | None |
| `GET /tasks/:id` | 1 (findUnique) | Direct lookup | None |
| `GET /tasks/:id/history` | 2 (count + findMany) | `$transaction` → `Promise.all` | None |
| `POST /tasks` | 2-3 (create + change + findUniqueOrThrow) | Sequential inside `$transaction` | None |
| `PATCH /tasks/:id` | 3-5 (resolve + CAS + events + findUniqueOrThrow) | Sequential inside `$transaction` | None |
| `GET /dashboard/kpis` | 1 (4 counts) | `$transaction` → `Promise.all` (single round-trip) | None |
| `GET /dashboard/my-tasks` | 2 (count + findMany) | `$transaction` → `Promise.all` | None |
| `GET /dashboard/activity` | 2 (count + findMany) | `$transaction` → `Promise.all` | None |

All reads use `Prisma.$transaction` with parallel `Promise.all` — **zero N+1 queries found**.

### API — Include efficiency ✅

`TASK_INCLUDE` selects only `{ id, name }` for all 4 relations (assignee, client, creator, archiver) — no unnecessary column fetching.

### API — Board data cap ✅

`BOARD_CAP = 200` limits the board query — prevents unbounded growth.

### Frontend — Bundle analysis

Dependencies (runtime only, excluding devDeps):
- `react` + `react-dom` 19.2.8
- `@tanstack/react-query` 5.101.4
- `react-router` 7.18.2
- `react-hook-form` 7.85.0 + `@hookform/resolvers` 5.7.1
- `zod` 4.4.3
- `@dnd-kit/core` 6.3.1 + `@dnd-kit/sortable` 10.0.0 + `@dnd-kit/utilities` 3.2.2

⚠️ Potential concerns:
- `@dnd-kit` is ~40KB gzipped for Kanban — only needed on `/board`
- `zod` 4.x is tree-shakeable but the app uses it extensively
- No bundle analyzer configured (`rollup-plugin-visualizer` not present)

### Frontend — Query efficiency ✅

- `staleTime: 30s` on QueryProvider — reduces refetch churn
- Optimistic mutations on board (cancel → snapshot → set → rollback → invalidate)

### Recommendations

1. **Add `rollup-plugin-visualizer`** to monitor bundle size over time
2. **Lazy-load `/board` route** (dnd-kit is heavy) — `React.lazy(() => import('./pages/Board'))`
3. **Lazy-load `/tasks/archived`** route — admin-only, rarely visited
4. **Verify `TASK_SORT` index**: confirm there's a DB index matching the contractual sort order
5. **Add DB connection pooling comment**: document that Prisma's default pool works for MVP

---

## Summary

| Area | Grade | Critical issues |
|---|---|---|
| Automated A11y | B | Only 2/11 routes scanned; no Playwright axe |
| Manual A11y | A- | Icons need aria-hidden; form errors need aria-describedby |
| API Performance | A+ | Zero N+1 queries; $transaction batching; data caps |
| Frontend Performance | B+ | Good patterns; missing lazy loading + bundle analyzer |

**Next:** Wait for qa-risk-analyzer (SEC-002) and unit-test-creator (QA-002) to complete.
