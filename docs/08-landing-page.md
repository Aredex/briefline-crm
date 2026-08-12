# Landing Page — Briefline CRM

**Status:** Implemented  
**Language:** English (product copy is English by project convention)  
**Owner:** Product & Architecture  
**Last updated:** 2026-08-12  
**Approved spec:** `docs/05-landing-footer-spec.es.md` (v1.0, 2026-08-12)

The public landing page is the portfolio case-study entry point at `/`. It explains the
problem, demonstrates the real product, shows the engineering and quality evidence, and
leads the visitor to the live demo — before any login is requested.

---

## 1. Route & Access

| Property | Value |
|---|---|
| Route | `/` |
| Access | Public — no authentication required |
| Auth redirect | None. An authenticated visitor may keep browsing `/` (not redirected to the dashboard) |
| Case-study anchor targets | `#product`, `#workflow`, `#engineering`, `#quality`, `#case-study` (T5.4: `#product` now targets the real product explorer, not Problem/Solution — see §4.2/§4.4 below; `#quality` stays reachable but isn't linked from primary nav) |
| Demo entry | `/login` (primary CTA) |

All copy is English. Sections are marked in code with `LAND-SEC-001` … `LAND-SEC-009`
comment markers.

## 2. Layout — `LandingLayout`

`apps/web/src/components/landing/LandingLayout.tsx` renders the public shell:

```text
.landing
├── <a class="skip-link" href="#main">Skip to main content</a>
├── PublicHeader   (transparent → sticky after hero)
├── <main id="main" tabindex="-1">  ← Landing sections
└── PublicFooter   (role="contentinfo")
```

Slim layout: no auth guards, no sidebar, no in-app chrome. `main` carries `tabIndex={-1}`
so the skip link can move focus into it. The footer is exclusive to the public page — the
authenticated app has no traditional footer.

## 3. Public Header

`PublicHeader` (component inside `LandingLayout.tsx`):

- **Behavior:** absolutely positioned over the hero (`position: absolute`, `z-index: 50`),
  transparent background. A `#hero-sentinel` div sits at the top of `main`; an
  `IntersectionObserver` toggles `landing-header--sticky` once the hero scrolls past the
  viewport: the header becomes `position: fixed` with `rgba(255,255,255,0.92)` background,
  `backdrop-filter: blur(8px)` and `--shadow-sm`.
- **Height:** 56px. Global CSS compensates anchored sections with `scroll-padding-top: 5rem`
  so sticky-header offset never hides section titles.
- **Brand:** `IconShield` logo in a 28px `--color-primary-600` rounded square (white icon,
  `aria-hidden`), wordmark "Briefline", link to `/` with `aria-label="Briefline home"`.
- **Nav** (`<nav aria-label="Main">`): four anchor links — Product (`#product`),
  Workflow (`#workflow`), Engineering (`#engineering`), Case study (`#case-study`) (T5.4:
  `Quality` was replaced with `Case study` in primary nav per audit §6; `#quality` still
  exists as a reachable anchor). Hidden on mobile (`display: none`), shown as a row at
  ≥ 768px. Hover: gray-900 text on gray-100.
- **CTA:** "Open live demo" → `/login`, primary-600 pill, 36px tall.
- **Mobile hamburger:** `#menu-toggle` button (40×40, `IconMenu`/`IconX`), dynamic
  `aria-label` ("Open/Close navigation menu") and `aria-expanded`. When open, the nav
  renders as a dropdown panel under the header (top: 56px, white, `--shadow-md`,
  border-bottom gray-200). Clicking a link closes the menu. **Escape** closes the menu
  and returns focus to `#menu-toggle`.

## 4. Sections

### 4.1 Hero — `LAND-SEC-001`

- Eyebrow (primary-600, uppercase, letter-spacing 0.08em): *"Full-stack portfolio case study"*
- H1: *"Client work, clearly owned."* (weight 800, `--text-4xl` mobile / 3.5rem desktop)
- Description: *"Briefline connects client context, priorities, ownership, and change
  history in one focused workspace for small digital agencies."*
- CTAs: primary "Open live demo" → `/login`; secondary "View case study" → `#case-study`
  (outline; T5.4 fixed this to match its own label — it previously pointed at `#engineering`).
- Note (xs, gray-400): *"Try the administrator and member accounts. All data is fictional
  and resets daily."*
- Screenshot: `hero-board.png` (see [§8 Screenshot](#8-screenshot)).
- Layout: single column on mobile; two-column grid (content | image) at ≥ 768px with
  `min-height: 80vh` and `padding-top: 140px` (120px on mobile). Image card: `--radius-lg`,
  `--shadow-lg`, 1px gray-200 border.

### 4.2 Problem / Solution — `LAND-SEC-002` (`#problem`, alt background)

_(T5.4: this section moved from `#product` to `#problem` — the stable `#product` anchor
now targets §4.4 Explore the product, the real product explorer.)_

- Title: *"When client work lives everywhere"* — subtitle: *"Briefline replaces scattered
  spreadsheets and chat threads with one operational view."*
- Two-column compare grid (`--color-surface` section background):

| Without a shared system (error-50) | With Briefline (success-50) |
|---|---|
| Ownership becomes unclear | Every task has context |
| Priorities drift | Every active task has an owner |
| Blocked work loses context | Every important change is recorded |
| Important changes disappear into chat history | Every role receives appropriate permissions |

- Problem column: `--color-error-50` background, `--color-error-border`, error-700 heading;
  solution column: `--color-success-50` / `--color-success-border` / success-700 heading.
  Bullets get a 16px circular marker (`li::before`) in error-100/success-100 with a 2px
  border in the 700 shade. 1 column on mobile, 2 at ≥ 768px.

### 4.3 Workflow Timeline — `LAND-SEC-003` (`#workflow`)

- Title: *"From client brief to accountable delivery"* — subtitle: *"The brief line connects
  every stage."*
- Five steps, each a white card (`--radius-lg`, gray-200 border) with `<h3>` + `<p>`:

| Step | Description |
|---|---|
| **Client** | Brief and context — every task links to a client so you know who you are working for. |
| **Backlog** | Prioritize and assign — collect incoming work, set priorities, and assign ownership before it enters the active workflow. |
| **Active work** | Pending → In progress → Blocked — move tasks through states with drag-and-drop or keyboard controls. |
| **Completed** | Close or reopen — completed work can be reopened if requirements change. |
| **Audited** | Trace every important change — who changed what, when, and from which value to which value. |

- Connector: `.landing-workflow::before` draws a 2px `--color-primary-600` vertical line at
  `left: 19px`; each step has a 14px white dot with a 3px primary-600 border
  (`::before`, positioned off the left padding).

### 4.4 Product Previews — `LAND-SEC-004` (`#product`, alt background)

_(T5.4: `#product` is a zero-height anchor rendered as this section's first child — the
section itself already owns `#explore-product`, used separately for tab-state deep links.)_

- Title: *"Explore the product"* — subtitle: *"Real screens from the working application —
  not mockups."*
- Tabbed interface driven by `useState` in `Landing.tsx`:

| Tab | Panel title | Panel description |
|---|---|---|
| **Plan work** | Client context and backlog | Every task starts with a client and a brief. Prioritize in the backlog, assign ownership, and set due dates before work begins. |
| **Coordinate delivery** | Track and move work | Filter by status, priority, or assignee. Drag cards between columns or use the keyboard menu. Every status change is recorded. |
| **Keep accountability** | Permissions and history | Members see their work. Admins manage users and archives. Every change is traceable with old and new values in the task timeline. |

- ARIA: `role="tablist"` (`aria-label="Product previews"`) → `role="tab"` buttons with
  `aria-selected`, and a `role="tabpanel"`. Active tab is a filled primary-600 pill;
  inactive tabs are white with gray-200 outline (pill radius). Tabs are native `<button>`s,
  so they are reachable in document order via Tab (no arrow-key roving implemented).
- Closing note: *"Explore the complete workflow in the live demo."*

### 4.5 Roles Table — `LAND-SEC-005`

- Title: *"Permissions that mean something"* — no subtitle.
- Capability matrix (7 rows × 2 roles), wrapped in `.landing-roles-scroll`
  (`overflow-x: auto`) so the wide table scrolls on narrow viewports:

| Capability | Administrator | Member |
|---|---|---|
| View team tasks | Yes | Yes |
| Create tasks and clients | Yes | Yes |
| Edit any task | Yes | No |
| Edit owned or assigned tasks | Yes | Yes |
| Manage users | Yes | No |
| Archive records | Yes | No |
| View task history | Yes | Yes |

- Semantics: `<caption>` ("Capability matrix for Administrator and Member roles"),
  `scope="col"` headers, uppercase xs headers, role columns center-aligned. "Yes" is
  success-700 (weight 600); "No" is gray-300 — color is a reinforcement, never the only
  signal (text is always present).
- Note (`--tight`): *"Permissions are enforced by the API, not only hidden in the interface."*

### 4.6 Engineering — `LAND-SEC-006` (`#engineering`, alt background)

- Title: *"Engineering"* — subtitle: *"Built with modern tools and documented decisions."*
- Two-column stack grid (10 items; collapses to one column on mobile):
  React 19 + TypeScript · NestJS REST API · PostgreSQL + Prisma · OpenAPI contract ·
  JWT cookie authentication and CSRF protection · Object-level authorization ·
  Transactional change history · Optimistic concurrency control · Automated and manual
  accessibility testing · Reproducible public deployment.
- CTA: "View the repository" (outline `landing-link--outline`) →
  `https://github.com/username/briefline-crm` (username placeholder to be replaced with the
  real owner).

### 4.7 Quality — `LAND-SEC-007` (`#quality`)

- Title: *"Quality and accessibility"* — subtitle: *"Evidence, not claims."*
- Two-column grid, 7 items: WCAG 2.2 AA target · Keyboard-complete task movement ·
  Accessible alternative to drag-and-drop · PostgreSQL integration tests ·
  Negative authorization tests · Playwright end-to-end journeys · Daily demo reset.

### 4.8 Case Study — `LAND-SEC-008` (`#case-study`, alt background)

- Title: *"About this case study"* — presented as a `<dl>` grid (2 columns; dt uppercase xs
  gray-400, dd sm gray-700):

| Term | Definition |
|---|---|
| Context | Inspired by a freelance marketplace brief. |
| Challenge | Transform an ambiguous request into a credible product. |
| Role | Product definition, UX, frontend, backend, data, testing, and deployment. |
| Constraints | Public demo, two roles, realistic scope, and low-cost hosting. |
| Outcome | A deployed working product with documented engineering decisions. |

### 4.9 Final CTA — `LAND-SEC-009`

- Centered block. H2: *"See how Briefline turns client context into accountable work."*
- Two demo buttons, both → `/login`: **"Open administrator demo"** (solid) and
  **"Open member demo"** (outline). Role selection happens on the login screen.

## 5. Public Footer

`PublicFooter` (`role="contentinfo"`), dark `--color-gray-900` background, gray-300 text:

- **Identity column:** "Briefline" brand + *"A full-stack CRM workflow case study for small
  digital agencies."* (max-width 320px).
- **Product column:** Live demo → `/login`; API documentation → `/api/docs`.
- **Project column:** GitHub repository → `https://github.com/username/briefline-crm`;
  Accessibility → `/accessibility`.
- **Bottom bar:** border-top gray-700, *"© {year} Built as a portfolio case study. Inspired
  by a real freelance brief. Fictional company and data."* — year rendered dynamically via
  `new Date().getFullYear()`.
- Layout: 1 column on mobile; `1fr 360px` (identity | links) at ≥ 768px.

## 6. Visual Design

The landing adapts to the existing CRM design tokens instead of inventing a new palette:

- **Color:** `--color-primary-600/700` (blue) for brands, CTAs and the workflow line;
  full gray scale (50–900); `--color-surface` for alternating section backgrounds;
  `--color-white` for cards; error/success scales (`-50`, `-100`, `-700`, `-border`) for
  the problem/solution grid and the roles table.
- **Typography:** system font stack via `--font-family`; sizes from `--text-xs` to
  `--text-4xl`; `--leading-relaxed` for hero copy; headline letter-spacing tweaks
  (`-0.02em` eyebrow uppercase at `0.08em`).
- **Shape & depth:** `--radius-sm/md/lg/full`, `--shadow-sm/md/lg`.
- **Spacing & motion:** `--space-*` scale, `--content-max-width` container,
  `--duration-fast` + `--ease-standard` transitions.
- **Responsive breakpoints:** `min-width: 768px` (header nav visible, hero two-column,
  compare grid two-column, footer two-column) and `max-width: 767px` (hamburger menu,
  grids collapse to one column, roles table scrolls horizontally).

## 7. Accessibility

- **Skip link:** first element of `.landing` ("Skip to main content" → `#main`, styled in
  `global.css`, visible on `:focus-visible`).
- **Semantic landmarks:** `header`, `nav` (with `aria-label="Main"`), `main`, `footer`
  (`role="contentinfo"`); every section is `aria-labelledby` its `<h2 id>`.
- **Heading hierarchy:** single `h1` (hero) → `h2` per section → `h3` within.
- **Tabs:** `tablist` / `tab` / `tabpanel` roles with `aria-selected`; native buttons.
- **Table:** `caption` + `scope="col"`; horizontal scroll wrapper instead of page overflow.
- **Keyboard:** mobile menu closable with Escape (focus returned to the toggle); all nav
  items and CTAs are native anchors/buttons.
- **Smooth scrolling:** `scroll-behavior: smooth` with `scroll-padding-top: 5rem` for the
  56px sticky header; a global `@media (prefers-reduced-motion: reduce)` block caps
  animation/transition durations at 0.01ms and forces `scroll-behavior: auto`.
- **Images:** hero screenshot has descriptive alt text naming the board columns and content.

## 8. Screenshot — `hero-board.png`

| Property | Value |
|---|---|
| Path | `apps/web/public/hero-board.png` (served at `/hero-board.png`) |
| Resolution | 2560 × 1680 PNG (8-bit RGB, non-interlaced) |
| Size | ~374 KB |
| Display | rendered at 640 × 420 CSS pixels (`width`/`height` attributes), full-width responsive — sharp on high-DPI (retina) displays |
| Alt | "Briefline task board showing backlog, pending, in progress, blocked, and completed columns with tasks, priorities, and assignees visible" |

## 9. Source Files

| File | Role |
|---|---|
| `apps/web/src/pages/Landing.tsx` | Page component: hero, all 9 sections, tabs state |
| `apps/web/src/components/landing/LandingLayout.tsx` | Public header + footer + `main` shell, skip link, sticky header, mobile menu |
| `apps/web/src/components/landing/Landing.css` | All landing styles (tokens-based, plain CSS) |
| `apps/web/src/styles/global.css` | Skip link, smooth scroll, scroll-padding, reduced-motion guard |
| `apps/web/public/hero-board.png` | Hero screenshot asset |

## 10. Relationship to the Approved Spec

Implemented against `docs/05-landing-footer-spec.es.md` (v1.0). The spec's route plan
(`/`, `/login`, `/case-study`, `/accessibility`, `/app/*`) is followed, with these current
implementation notes:

- The in-page secondary CTA "View case study" anchors to the `#engineering` section; the
  separate `/case-study` page is not yet implemented.
- The final-CTA role buttons link to plain `/login`; the spec's optional
  `/login?demo=admin|member` query for account pre-selection is not used yet.
- Spec non-goals are respected: no pricing, no lead capture, no fake testimonials, no
  analytics, no footer inside the authenticated app.
