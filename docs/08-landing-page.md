# Landing Page — Briefline CRM

**Status:** Implemented (audit remediation complete — P0 + most of P1)
**Language:** English (product copy is English by project convention)
**Owner:** Product & Architecture
**Last updated:** 2026-08-12
**Approved spec:** `docs/05-landing-footer-spec.es.md` (v1.0, 2026-08-12)
**Audit:** `docs/06-landing-visual-functional-audit.es.md` — this document describes the landing
**after** the audit's redesign, executed as `.claude/plans/landing-audit-plan.md` (phases F0–F6).

The public landing page is the portfolio case-study entry point at `/`. It shows the real
product (screenshots captured from the running app, not mockups), explains the engineering
decisions with links to real evidence, and leads the visitor to the live demo — before any
login is requested.

---

## 1. Route & Access

| Property | Value |
|---|---|
| Route | `/` |
| Access | Public — no authentication required |
| Auth redirect | None. An authenticated visitor may keep browsing `/` (not redirected to the dashboard) |
| Anchor targets | `#problem`, `#product`, `#workflow`, `#engineering`, `#quality`, `#case-study` |
| Demo entry | `/login`, `/login?demo=admin`, `/login?demo=member` |
| Bundle | Eager (not code-split): `/`, `/login`, `/accessibility`, `/403`, `/404`. The 14 authenticated pages are `React.lazy()` — see §9 |

All copy is English. Sections are marked in code with `LAND-SEC-001` … `LAND-SEC-009`
comment markers, matching the original spec's numbering even where content changed.

## 2. Layout — `LandingLayout`

`apps/web/src/components/landing/LandingLayout.tsx` renders the public shell:

```text
.landing
├── <a class="skip-link" href="#main">Skip to main content</a>
├── PublicHeader   (transparent → sticky after ~80-120px scroll)
├── <main id="main" tabindex="-1">  ← 9 section components (apps/web/src/pages/Landing.tsx)
└── PublicFooter   (role="contentinfo")
```

`Landing.tsx` is a ~36-line composition that imports and renders the 9 section components
from `apps/web/src/components/landing/sections/`. Before the F0 refactor it was a single
246-line file with everything inline.

## 3. Public Header

`PublicHeader` (component inside `LandingLayout.tsx`):

- **Height:** 72–80px (`--landing-header-height`), up from the original 56px, to give the
  wordmark and nav real presence (audit AUD-011).
- **Sticky:** transparent/absolute over the hero; an `IntersectionObserver` on the hero
  sentinel toggles `landing-header--sticky` after ~80-120px of scroll — `position: fixed`,
  `--landing-canvas` at 92% opacity, `backdrop-filter: blur(8px)`, bottom border.
- **Brand:** wordmark ≥24px, `--landing-signal` logo mark.
- **Nav** (`<nav aria-label="Main">`): **Product** (`#product`), **Workflow** (`#workflow`),
  **Engineering** (`#engineering`), **Case study** (`#case-study`). `Quality` was replaced
  with `Case study` in primary nav per audit §6 — `#quality` still exists as a reachable
  anchor, just not linked from the header. Active-section state uses weight **and** color
  (`aria-current`), driven by an `IntersectionObserver` that watches the *content* element
  for each anchor — `#product` itself is a zero-height marker (see §4.4), so its observer
  target is `#explore-product` instead.
- **CTA:** "Open live demo" → `/login`, ≥40px tall.
- **Mobile menu:** hamburger toggle, dropdown panel, closes on Escape or on selecting a link,
  focus returns to the toggle.

## 4. Sections

### 4.1 Hero — `LAND-SEC-001` (`apps/web/src/components/landing/sections/Hero.tsx`)

- Eyebrow: *"Full-stack portfolio case study"*
- H1: *"Client work, clearly owned."* — 64–72px desktop (`--landing-text-display`, Archivo
  Variable), 42–48px mobile. This exact string is asserted by `test/router.test.tsx` and
  `test/landing.test.tsx` — do not change without updating both.
- Description, primary CTA ("Open live demo" → `/login`), secondary CTA ("View case study" →
  `#case-study`), and a note about the demo accounts.
- **Screenshot:** real `<picture>` (AVIF/WebP, 1×/2×) of the task board, `board-overview` from
  the F2 media pipeline (see §8) — not a static PNG. `loading="eager"` + `fetchPriority="high"`
  since it's the LCP element.
- **Composition:** 78–90vh, content vertically centered (not pinned to the bottom third like
  the pre-audit hero), H1 and screenshot both enlarged versus the original.
- **Proof strip:** `Admin + Member · Daily reset · OpenAPI` beneath the actions.

### 4.2 Problem / Solution — `LAND-SEC-002` (`#problem`, alt background, `ProblemSolution.tsx`)

- Title: *"When client work lives everywhere"*, with a situational lead-in sentence (audit §8).
- Two-column compare: **"Scattered work"** (4 bullets) vs. **"One operational view"** — the
  solution column includes a real Briefline data snapshot (client, task, owner, status),
  not a generic mock.
- This section owned the `#product` anchor before F5/T5.4; it is `#problem` now — the stable
  `#product` anchor moved to the section that's actually about the product (§4.4).

### 4.3 Workflow — `LAND-SEC-003` (`#workflow`, `Workflow.tsx`)

- Title: *"From client brief to accountable delivery"*.
- Five numbered, alternating stages (`01 Client` → `05 Audited`), each with a real screenshot
  crop from `/media` and a short rule statement. `Blocked` is rendered as a **branch off Active
  Work** (dashed amber offshoot), not a sixth numbered stage — the audit's requirement that it
  read as "a temporary branch, not a destination."
- `Audited` includes a legible example history entry:
  `Status · In progress → Blocked · by Jordan Lee · 14:32`.
- **"The brief line"** (audit §5.2) runs through this section as a continuous spine with filled
  node markers per stage, and terminates in a closing dot at `Audited`. Its other two
  variations — fork and double stroke — live in the Engineering diagram (§4.6).
- **Motion:** the only scroll-triggered animation on the page (audit §22 forbids animating
  every section). An `IntersectionObserver` reveals each step as it scrolls in; the CSS
  default is fully visible, so no-JS and `prefers-reduced-motion: reduce` both fall back to
  "everything visible" with no extra branching.

### 4.4 Product Explorer — `LAND-SEC-004` (`#product`/`#explore-product`, alt background, `ProductExplorer.tsx`)

This is the section the audit flagged as the landing's single biggest weakness (AUD-003,
critical) — the pre-audit version promised "real screens" but was mostly text.

- Title: *"Explore the product"*.
- Three tabs — **Plan work**, **Coordinate delivery**, **Keep accountability** — each with a
  large real screenshot (`<picture>`, AVIF/WebP), 3 proof points, and a deep CTA that links
  through `/login?next=<path>` to the actual authenticated view (e.g. the backlog, a specific
  task's history) using `router.tsx`'s existing `requireAuth` redirect pattern.
- **ARIA:** full WAI-ARIA tabs pattern — roving `tabIndex`, `aria-controls`/`id` linking each
  tab to its panel, Arrow/Home/End keyboard navigation.
- **Deep-shareable state:** the active tab lives in the URL as `#explore-product?tab=<key>`,
  separate from the `#product` anchor (a zero-height marker placed just before this section,
  so `href="#product"` in the header nav lands here without colliding with the tab-hash
  mechanism). The first panel renders without JS.
- **Lightbox:** clicking a screenshot opens `LandingLightbox.tsx` (built on
  `@radix-ui/react-dialog`, not the app's `Drawer` — Drawer is deliberately non-modal, the
  wrong contract for an enlarged screenshot view) — focus trap, Escape, focus return, caption.

### 4.5 Permissions — `LAND-SEC-005` (`Permissions.tsx`)

- Title: *"Permissions that mean something"*.
- Capability matrix, body text at 15–16px, using **Allowed / Owned only / Not allowed**
  instead of Yes/No, including the differentiating row *"Edit a task created by another
  member"*.
- A negative-path evidence block sits beside the table:
  ```
  PATCH /api/v1/tasks/:id
  Member without ownership
  → 404 Resource not found
  → No task or history record changed
  ```
- Retains: *"Permissions are enforced by the API, not only hidden in the interface."*

### 4.6 Engineering — `LAND-SEC-006` (`#engineering`, alt background, `Engineering.tsx`)

Replaces the original flat `<ul>` of ~10 technologies (AUD-006) with a small architecture
diagram and four decisions, each backed by a real file in the repo.

- Diagram: `React application` — (OpenAPI contract, drawn as a **double stroke**, "the brief
  line" variation for a contract binding both sides) — `NestJS API`, both branching (SVG
  **fork**, another brief-line variation) down into `PostgreSQL`.
- Four decisions, each with a title, 1–2 sentence explanation, an optional 4–7 line code
  snippet, and an evidence reference:
  1. Contract-first integration → `packages/api-contract/openapi.yaml`
  2. Server-enforced permissions → `.claude/plans/permission-matrix.md`
  3. Atomic change history → `.claude/plans/data-model.md`
  4. Conflict-safe interactions → `.claude/plans/adrs.md#adr-004-concurrency`
- **Evidence references are not `<a href>` links.** The deployed SPA has no route that serves
  raw `.md`/`.yaml` files, so a live anchor to a repo-relative path would 404 or silently
  reload the landing. They render as `label + <code>path</code>` text instead — real proof the
  decision exists on disk, without a broken clickable link (audit §22, FUN-006). They become
  real links once the GitHub repo is published (decision D1 below).
- Stack (React 19 · TypeScript · NestJS · PostgreSQL · Prisma · …) is a secondary mono label
  under the decisions, not the section's main content.

### 4.7 Quality — `LAND-SEC-007` (`#quality`, `Quality.tsx`)

Replaces a two-column bullet list with a proof matrix and a numeric evidence panel.

- Matrix (4 rows): evidence → what it demonstrates → destination (keyboard-complete task move,
  PostgreSQL integration tests, negative authorization tests, daily deterministic reset).
- Evidence panel numbers are **read from `apps/web/src/data/quality-evidence.json`**, generated
  by `scripts/collect-test-counts.mjs` — never hand-typed in the component (plan decision A6).
  Re-run the script before any release so the panel can't drift from the real suite:
  ```bash
  node scripts/collect-test-counts.mjs
  ```
- Same evidence-reference pattern as Engineering for the strategy/runbook mentions
  (`.claude/plans/test-matrix.md`, `.claude/plans/ph12-operations-runbook.md`).

### 4.8 Case Study — `LAND-SEC-008` (`#case-study`, alt background, `CaseStudy.tsx`)

Replaces the metadata `<dl>` with a three-moment teaser (audit §14):

1. **Ambiguous brief** — a freelance listing asked for a CRM-style task manager.
2. **Product decisions** — scope, roles, permissions, data model, API contract, accessible board.
3. **Working outcome** — public demo, documented architecture, reproducible tests, deployment.

Plus an explicit scope line ("I owned product definition, UX direction, frontend, backend,
data, testing, and deployment.") and an honesty line (independent portfolio project, not
commissioned client work). "Read the full case study" and "View the development plan" point at
`docs/02-prd.en.md` and `docs/plans/04-development-plan.en.md` respectively — no standalone
`/case-study` route exists yet (decision recorded in the component's header comment).

### 4.9 Final CTA — `LAND-SEC-009` (`FinalCta.tsx`)

- H2: *"See how Briefline turns client context into accountable work."*
- **"Open administrator demo"** → `/login?demo=admin`, **"Open member demo"** →
  `/login?demo=member` — both pre-fill the login form (without auto-submitting) rather than
  requiring the visitor to type credentials.
- Notices: daily reset, and that the first load may take up to 60 seconds on the free hosting
  tier. The cold-start "waking up" status itself is **not** shown here — see §7 below for why.
- The audit's "Prefer the code? View the repository" link is **intentionally omitted**: the
  repo isn't published on GitHub yet (decision D1). No node is rendered for it — not a
  disabled link, not a `#` placeholder.

## 5. Public Footer

`PublicFooter` (`role="contentinfo"`):

- Identity, Product, and Project columns; padding 64–80px, wordmark 22–24px.
- Status line: `v1.0.0 · Live demo`, with **both** a dot and text (never color-only).
- Accessibility link → `/accessibility` (a real route now — see §6).
- The GitHub repository link is **omitted** (decision D1, repo not published yet) rather than
  pointing at a placeholder URL.

## 6. `/accessibility` page

`apps/web/src/pages/Accessibility.tsx`, registered as a public route in `router.tsx`. Explains
the WCAG 2.2 AA target, what's been verified manually, known limitations, and how to report an
issue. Closes a dead footer link (H7) that previously fell through to `NotFound`.

## 7. Cold start (FUN-003)

`apps/web/src/hooks/useDemoWarmup.ts` pings the public `GET /api/v1/health` endpoint (no auth,
no DB touch) with limited retries (~32s active window, inside Render's ~60s cold-start range).

**It lives on `Login.tsx`, not on the landing's CTA buttons.** The first implementation
attached it to the CTA's `onClick`, but the click navigates to `/login` in the same tick,
unmounting the landing component before the first ping could ever resolve — the "waking up"
notice was dead code (caught by the mandatory F5 QA pass, see
`.claude/plans/landing-audit-plan.md`). `Login.tsx` stays mounted through the whole check
window and is where the visitor is actually waiting, so the check runs there instead, for
every arrival at `/login` (not just `?demo=` ones, since an organic visit hits the same
possibly-sleeping API).

The link/button always navigates or submits immediately — the hook only adds an honest status
message alongside it, never blocks the click.

## 8. Media pipeline

`apps/web/scripts/capture-landing-media.ts` (Playwright + `sharp`) logs in as the seeded admin
and captures real product screenshots — the task board, a task's change history, a client
record, the backlog, a visible keyboard-focus state, and the accessible "Move to…" menu — then
encodes each to AVIF/WebP at 1×/2× into `apps/web/public/media/`, within the audit's per-file
budget (hero ≤250 KiB, secondary ≤180 KiB). Re-run with:

```bash
pnpm --filter @briefline/web capture:landing
```

Re-run this whenever the authenticated app's visual design changes enough that the captured
screens no longer match — the landing's screenshots should never silently drift from the real
product.

## 9. Performance: code splitting

`router.tsx`'s 14 authenticated pages (Dashboard, Board, TaskList, TaskDetail, Clients*,
Contacts*, Users, Profile, ArchivedTasks) are `React.lazy()`; `AppShell` wraps the protected
route's `<Outlet>` in a single `<Suspense>`. `/`, `/login`, `/accessibility`, `/403`, `/404`
stay eager since they're public and gate nothing.

| | Before (T0.5 baseline) | After (T5.3) |
|---|---:|---:|
| Entry chunk | 648.51 KB / 188.26 KB gzip (single chunk, everything) | 528.86 KB / 164.97 KB gzip |
| Chunks | 1 | 1 entry + 34 separate authenticated-page chunks |

`/` no longer loads the authenticated app's bundle — the hard §25 criterion is met. The
landing-specific `≤100 KiB JS` target from §19 is **not** met: the entry still carries shared
runtime (React Router, TanStack Query, Radix, providers) and `Login.tsx` is still eager
(pulling in `zod` + `react-hook-form`), which a QA pass flagged as a further optimization
opportunity, not a regression this plan introduced.

A stale chunk after a new deploy (a tab left open across a release, requesting a JS chunk hash
that no longer exists) is handled by `RouteError` in `router.tsx`: it recognizes the dynamic
`import()` failure shape and reloads once automatically (guarded in `sessionStorage` against a
reload loop if the chunk is genuinely broken, not just stale), showing honest interim copy
instead of the raw browser error message.

## 10. Accessibility

- Skip link, semantic landmarks, single `h1` → `h2` per section → `h3` within.
- Full WAI-ARIA tabs pattern on the product explorer (§4.4).
- Table `caption` + `scope="col"` on both the Permissions and Quality tables, with a horizontal
  scroll wrapper on narrow viewports instead of page-wide overflow.
- `:focus-visible` inside `.landing` uses `--landing-signal`, not the app's blue ring — the
  audit reserves signal for CTAs, nodes, and focus; blue is for technical links and the inside
  of product screenshots only.
- `prefers-reduced-motion: reduce` removes the workflow reveal animation and the lightbox's
  open/close animation, and forces `scroll-behavior: auto`.
- Verified at 320px viewport (no horizontal scroll) and with `@axe-core/playwright` (zero
  serious/critical violations) in `apps/web/test/e2e/landing.spec.ts`.
- Two real contrast bugs were caught and fixed during the F5 e2e work: an amber token used as
  table-cell text at 3.1:1 (now a dedicated `--landing-amber-text` at 4.85:1), and the Quality
  evidence panel's date line using the wrong muted-text variant for a dark background.

## 11. Open Graph / social metadata (FUN-008)

`apps/web/index.html` carries `<title>`, `<meta name="description">`, full Open Graph, and
Twitter Card tags. `og:image` reuses the media pipeline's `board-overview@2x.webp` (real
product content, not a screenshot of the whole page) — documented as 2292×1630 rather than the
ideal 1200×630 OG crop, since generating a dedicated crop was out of scope for this pass.

## 12. Source Files

| File | Role |
|---|---|
| `apps/web/src/pages/Landing.tsx` | Page composition — imports and renders the 9 sections |
| `apps/web/src/components/landing/sections/*.tsx` | One component per section (Hero, ProblemSolution, Workflow, ProductExplorer, Permissions, Engineering, Quality, CaseStudy, FinalCta) |
| `apps/web/src/components/landing/LandingLayout.tsx` | Public header + footer + `main` shell, sticky header, active-section tracking, mobile menu |
| `apps/web/src/components/landing/LandingLightbox.tsx` | Accessible enlarged screenshot view (Radix Dialog) |
| `apps/web/src/components/landing/Landing.css` | All landing styles, `--landing-*` tokens (`tokens.css`) |
| `apps/web/src/hooks/useDemoWarmup.ts` | Cold-start health check, used by `Login.tsx` |
| `apps/web/src/pages/Accessibility.tsx` | `/accessibility` page |
| `apps/web/src/data/quality-evidence.json` | Generated test-count evidence (never hand-edited) |
| `apps/web/scripts/capture-landing-media.ts` | Playwright + sharp media capture pipeline |
| `scripts/collect-test-counts.mjs` | Generates `quality-evidence.json` from the real test suite |
| `apps/web/test/landing.test.tsx` | Component-level baseline/regression tests |
| `apps/web/test/e2e/landing.spec.ts` | Playwright + axe end-to-end suite for `/` |
| `apps/web/public/media/*` | Real product screenshots (AVIF/WebP, 1×/2×) |
| `apps/web/public/fonts/*` | Self-hosted Archivo Variable + IBM Plex Mono |

## 13. Relationship to the Approved Spec and Audit

Implemented against `docs/05-landing-footer-spec.es.md` (v1.0) and then substantially reworked
per `docs/06-landing-visual-functional-audit.es.md`. The audit's P0 priorities are complete;
most of P1 is complete (the brief line, palette, expandable previews + deep links, permissions
negative-path evidence, sticky header/footer, Open Graph). Deliberately out of scope for this
pass, with reasons recorded in `.claude/plans/landing-audit-plan.md`:

- **P2.1 — short muted videos.** Not produced; the media pipeline (§8) generates static
  screenshots only.
- **The GitHub repository link** (mentioned throughout the original spec/audit as a CTA) is
  omitted everywhere on the landing, not linked as a placeholder — the repo isn't published on
  GitHub yet. This is decision D1 in the plan; every reference becomes a real link once that
  changes.
- **A standalone `/case-study` page** — the audit's case-study teaser links to existing docs
  (`docs/02-prd.en.md`) instead.
- **FUN-010 (automated link checking in CI)** was not implemented in this pass.
