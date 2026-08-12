# 06 — Components & Design Tokens

Documentation for the Briefline CRM web UI kit: every component in
`apps/web/src/components/ui/`, its props, usage, variants, accessibility
contract, and the design-token system that backs it.

Source of truth for the tokens: `.claude/plans/ux-wireframes-tokens.md` §3
(tokens) and §5 (a11y contract). The runtime files are:

| File | Role |
|---|---|
| `apps/web/src/styles/tokens.css` | Design tokens as CSS custom properties (`:root`) |
| `apps/web/src/styles/tailwind.css` | Tailwind CSS v4 `@theme` mapping tokens → utility classes |
| `apps/web/src/styles/global.css` | Global styles, `prefers-reduced-motion` handling |
| `apps/web/src/components/ui/ui.css` | Legacy BEM styles for not-yet-migrated components |

Import convention: components are imported with the `@/*` path alias
(`@/components/ui/Button`), which maps to `./src/*` in `apps/web/tsconfig.json`.

---

## 1. Migration status at a glance

| Component | Styling | Status |
|---|---|---|
| `Button` | Tailwind + CVA | **Migrated** (legacy `.btn__icon`/`.btn__label` span classes remain for layout) |
| `Input` | Tailwind | **Migrated** |
| `Select` | Tailwind | **Migrated** |
| `Badge` / `PriorityBadge` / `StatusBadge` | Tailwind + CVA | **Migrated** |
| `Skeleton` | Tailwind | **Migrated** |
| `Dialog` | BEM (`dialog__*`) | **Still BEM** (`ui.css`) |
| `Drawer` | BEM (`drawer__*`) | **Still BEM** (`ui.css`) |
| `Alert` | BEM (`alert--*`) | **Still BEM** (`ui.css`) |
| `EmptyState` | BEM (`empty-state__*`) | **Still BEM** (`ui.css`) |
| `ErrorState` | BEM (`error-state__*`) | **Still BEM** (`ui.css`, uses legacy `.btn` classes) |
| `Card` | BEM (`card__*`) | **Still BEM** (`ui.css`) |
| `ConfirmDialog` | Hybrid | Migrated `Button` + still-BEM `Dialog` |

---

## 2. Design tokens

Declared as CSS custom properties in `apps/web/src/styles/tokens.css`, mirrored
into Tailwind utilities via `@theme` in `apps/web/src/styles/tailwind.css`.

### 2.1 Color palette

All colors meet WCAG AA contrast on their intended surfaces.

#### Brand

| Token | Value | Usage |
|---|---|---|
| `--color-white` | `#ffffff` | Surfaces |
| `--color-surface` | `#f9fafb` | App background, secondary hover |
| `--color-primary-50` | `#eff6ff` | Info fills |
| `--color-primary-100` | `#dbeafe` | Tints |
| `--color-primary-600` | `#2563eb` | Primary button fills, input focus |
| `--color-primary-700` | `#1d4ed8` | Text on light backgrounds |
| `--color-focus-ring` | `#2563eb` | Focus-visible outlines |

#### Neutrals (gray scale)

| Token | Value |
|---|---|
| `--color-gray-100` | `#f3f4f6` |
| `--color-gray-200` | `#e5e7eb` (borders, skeleton fill) |
| `--color-gray-300` | `#d1d5db` |
| `--color-gray-400` | `#9ca3af` (placeholders, help text) |
| `--color-gray-500` | `#6b7280` |
| `--color-gray-600` | `#4b5563` (secondary text) |
| `--color-gray-700` | `#374151` (labels, body text) |
| `--color-gray-800` | `#1f2937` |
| `--color-gray-900` | `#111827` (headings, primary text) |

#### Semantic

Each semantic group has a `-50` tint (background), `-700` (text/icon), and
`-border`:

| Group | 50 (fill) | 700 (text) | border |
|---|---|---|---|
| Success | `--color-success-50` `#f0fdf4` | `--color-success-700` `#15803d` | `--color-success-border` `#bbf7d0` |
| Warning | `--color-warning-50` `#fffbeb` | `--color-warning-700` `#b45309` | `--color-warning-border` `#fde68a` |
| Error | `--color-error-50` `#fef2f2` | `--color-error-700` `#b91c1c` | `--color-error-border` `#fecaca` |
| Info | `--color-info-50` `#eff6ff` | `--color-info-700` `#1d4ed8` | `--color-info-border` `#bfdbfe` |
| High (danger-adjacent) | `--color-high-50` `#fff7ed` | `--color-high-700` `#c2410c` | `--color-high-border` `#fed7aa` |

Also `--color-danger-600` `#dc2626` (danger button hover), and the input error
state uses `--color-error-border` on the border plus
`--color-error-700` on the focus ring.

### 2.2 Spacing scale (4px grid)

| Token | Value | px |
|---|---|---|
| `--space-1` | `0.25rem` | 4 |
| `--space-2` | `0.5rem` | 8 |
| `--space-3` | `0.75rem` | 12 |
| `--space-4` | `1rem` | 16 |
| `--space-5` | `1.25rem` | 20 |
| `--space-6` | `1.5rem` | 24 |
| `--space-7` | `2rem` | 32 |
| `--space-8` | `2.5rem` | 40 |
| `--space-9` | `3rem` | 48 |
| `--space-10` | `4rem` | 64 |

### 2.3 Typography

System font stack — no webfonts (fast load, no FOUT):

```css
--font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
  'Helvetica Neue', Arial, sans-serif;
```

Type scale (`--text-*`):

| Token | Size |
|---|---|
| `--text-xs` | `0.75rem` (12px) |
| `--text-sm` | `0.875rem` (14px) |
| `--text-base` | `1rem` (16px) |
| `--text-lg` | `1.125rem` (18px) |
| `--text-xl` | `1.25rem` (20px) |
| `--text-2xl` | `1.5rem` (24px) |
| `--text-3xl` | `1.875rem` (30px) |
| `--text-4xl` | `2.25rem` (36px) |

Line heights: `--leading-tight: 1.25`, `--leading-normal: 1.5`,
`--leading-relaxed: 1.625`.

### 2.4 Motion tokens

Durations:

| Token | Value | Usage |
|---|---|---|
| `--duration-instant` | `80ms` | Micro feedback |
| `--duration-fast` | `150ms` | Hover states, input transitions, drawer exit |
| `--duration-normal` | `200ms` | Scrim fades |
| `--duration-base` | `200ms` | Alias of normal |
| `--duration-slow` | `300ms` | Drawer slide |
| `--duration-deliberate` | `500ms` | Long-form transitions |

Easing curves (Material Design v3 inspired):

```css
--ease-standard:    cubic-bezier(0.2, 0, 0, 1);   /* general purpose */
--ease-decelerate:  cubic-bezier(0, 0, 0, 1);     /* entry: fast start, smooth stop */
--ease-accelerate:  cubic-bezier(0.3, 0, 1, 1);   /* exit: smooth start, fast end */
--ease-spring:      cubic-bezier(0.34, 1.56, 0.64, 1); /* gentle overshoot */
```

`--ease-spring` powers the Drawer's slide-in (see Drawer section). All
animation is disabled under `prefers-reduced-motion` (handled in
`global.css`).

### 2.5 Shadows (elevation)

| Token | Value |
|---|---|
| `--shadow-sm` | `0 1px 2px rgba(17, 24, 39, 0.06)` |
| `--shadow-md` | `0 2px 8px rgba(17, 24, 39, 0.08)` |
| `--shadow-lg` | `0 8px 24px rgba(17, 24, 39, 0.12)` |

### 2.6 Radii

| Token | Value |
|---|---|
| `--radius-sm` | `4px` |
| `--radius-md` | `6px` |
| `--radius-lg` | `8px` |
| `--radius-full` | `9999px` (pills/badges) |

### 2.7 Layout & touch

```css
--header-height: 56px;
--content-max-width: 1200px;
--breakpoint-md: 768px;
--breakpoint-lg: 1024px;
--touch-target: 44px;   /* minimum touch target (AC-05) */
```

### 2.8 How `@theme` maps tokens to Tailwind utilities

`tailwind.css` imports Tailwind v4 and redeclares the token values inside
`@theme`. Tailwind v4 generates utility classes from namespaced `@theme`
variables, so:

| `@theme` variable | Generated utilities |
|---|---|
| `--color-primary-600: #2563eb` | `bg-primary-600`, `text-primary-600`, `border-primary-600`, `ring-primary-600`, … |
| `--color-gray-200` | `bg-gray-200`, `border-gray-200`, … |
| `--radius-md: 6px` | `rounded-md` |
| `--shadow-lg: …` | `shadow-lg` |
| `--duration-fast: 150ms` | `duration-fast` |
| `--ease-spring: …` | `ease-spring` |
| `--font-family-sans: …` | `font-sans` |

Notes:

- The `@theme` block intentionally omits `--text-*` (typography) and
  `--space-*` (spacing): those scales match Tailwind's built-in defaults
  (`text-sm`, `p-3`, `gap-1.5`, …), so only the CSS variables in `tokens.css`
  are authoritative for them.
- Migrated components reference the raw CSS variables through arbitrary-value
  syntax (e.g. `bg-[var(--color-primary-600)]`) rather than the generated
  utilities. Both work; the arbitrary-value form is the current convention in
  `Button`/`Input`/`Select`/`Badge`/`Skeleton`.
- `tokens.css` and `tailwind.css` are manually kept in sync — always add new
  tokens to both files.

---

## 3. Components

---

### 3.1 Button

**File:** `apps/web/src/components/ui/Button.tsx`
**Import:** `import { Button } from '@/components/ui/Button'`

Tailwind + CVA (shadcn/ui pattern). Same public API as the pre-migration
button.

#### Props

Extends `ButtonHTMLAttributes<HTMLButtonElement>` plus:

| Prop | Type | Default | Description |
|---|---|---|---|
| `variant` | `'primary' \| 'secondary' \| 'danger' \| 'ghost'` | `'primary'` | Visual style |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | Height/padding scale |
| `isLoading` | `boolean` | `false` | Disables the control, shows spinner, sets `aria-busy` |
| `leftIcon` | `ReactNode` | — | Decorative leading icon (`aria-hidden`) |
| `rightIcon` | `ReactNode` | — | Decorative trailing icon (`aria-hidden`) |
| `type` | `string` | `'button'` | Inherited; defaults to `'button'` |

#### Usage

```tsx
import { Button } from '@/components/ui/Button'
import { IconPlus, IconPencil } from '@/components/ui/icons'

// Primary (default)
<Button onClick={handleCreate}>New task</Button>

// Secondary with icon, medium size
<Button variant="secondary" leftIcon={<IconPlus />}>Add</Button>

// Danger, small
<Button variant="danger" size="sm">Delete</Button>

// Loading — disables + spinner + aria-busy
<Button isLoading={isLoading}>{isLoading ? 'Saving…' : 'Save'}</Button>

// Icon-only — MUST provide aria-label (AC-05)
<Button variant="ghost" size="sm" aria-label="Edit task">
  <IconPencil />
</Button>
```

#### Variants

| Variant | Style |
|---|---|
| `primary` | `bg-[var(--color-primary-600)]` text white, hover `primary-700` |
| `secondary` | White bg, `gray-200` border, `gray-700` text |
| `danger` | `bg-[var(--color-error-700)]` text white, hover `red-800` |
| `ghost` | `gray-600` text, hover `gray-100` bg |

Sizes: `sm` h-8 px-3 text-xs · `md` h-[44px] px-4 text-sm · `lg` h-12 px-6 text-base.

#### Accessibility

- `isLoading` sets `disabled` and `aria-busy`; a spinner replaces the icon.
- `md`/`lg` sizes are ≥ 44px tall — the `--touch-target` minimum (AC-05).
- Focus-visible ring uses `var(--color-focus-ring)` with 2px outline + offset.
- Icon-only buttons must be given `aria-label`.

#### Migration status

**Migrated** to Tailwind + CVA. The inner label/icon spans still use the
legacy `.btn__label` / `.btn__icon` BEM classes, which `ui.css` defines for
spacing (`gap-2` on the base class covers it in Tailwind terms).

---

### 3.2 Input

**File:** `apps/web/src/components/ui/Input.tsx`
**Import:** `import { Input } from '@/components/ui/Input'`

Text field with always-visible label, inline error, help text, and optional
leading icon.

#### Props

Extends `InputHTMLAttributes<HTMLInputElement>` plus:

| Prop | Type | Default | Description |
|---|---|---|---|
| `label` | `string` | — | Visible label (see A11y: never placeholder-only) |
| `error` | `string` | — | Inline error message; renders with `role="alert"` |
| `helpText` | `string` | — | Helper text under the field (hidden while `error` is set) |
| `hideLabel` | `boolean` | `false` | Visually hides the label (`sr-only`); keep for a11y |
| `inputClassName` | `string` | — | Extra classes for the `<input>` element |
| `leftIcon` | `ReactNode` | — | Decorative leading icon (`aria-hidden`) |
| `id` / `required` | inherited | `id` auto-generated | `required` renders a `*` marker in the label |

`className` applies to the wrapping `<div>`, not the input.

#### Usage

```tsx
import { Input } from '@/components/ui/Input'
import { IconSearch } from '@/components/ui/icons'

<Input
  label="Task title"
  placeholder="e.g. Draft Q3 report"
  required
  value={title}
  onChange={(e) => setTitle(e.target.value)}
/>

{/* With error */}
<Input
  label="Email"
  type="email"
  error={errors.email}
/>

{/* With help text and leading icon */}
<Input
  label="Search"
  hideLabel
  helpText="Search by title or description"
  leftIcon={<IconSearch />}
  placeholder="Search tasks…"
/>

{/* Controlled + inputClassName passthrough */}
<Input
  label="Due date"
  type="date"
  inputClassName="tabular-nums"
/>
```

#### Accessibility

- Label is always visible (`sr-only` when `hideLabel`) — never placeholder-only (AP-12).
- Error message is `role="alert"` and wired via `aria-describedby`.
- `aria-invalid` set when `error` is present.
- `id` auto-generated with `useId`; `aria-describedby` joins `{id}-error` /
  `{id}-help` ids.
- Required marker `*` is `aria-hidden`; the `required` attribute carries the
  semantics.
- Input height is 44px (`--touch-target`).
- Error state also recolors border and focus ring to `--color-error-*`.

#### Migration status

**Migrated** to Tailwind (no BEM). The old `.field`/`.input`/`.field__error`
classes in `ui.css` are legacy and unused by this component.

---

### 3.3 Select

**File:** `apps/web/src/components/ui/Select.tsx`
**Import:** `import { Select, type SelectOption } from '@/components/ui/Select'`

Native `<select>` wrapper — same a11y contract as `Input`.

#### Props

Extends `Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'>` plus:

| Prop | Type | Default | Description |
|---|---|---|---|
| `label` | `string` | **required** | Always-visible label |
| `options` | `SelectOption[]` | **required** | Options to render (no children API) |
| `placeholder` | `string` | — | Disabled `<option value="">` shown at top |
| `error` | `string` | — | Inline error, `role="alert"` |
| `helpText` | `string` | — | Helper text (hidden while `error` is set) |
| `hideLabel` | `boolean` | `false` | `sr-only` label |

```ts
export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}
```

#### Usage

```tsx
import { Select } from '@/components/ui/Select'

const statusOptions = [
  { value: 'BACKLOG', label: 'Backlog' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'COMPLETED', label: 'Completed' },
]

<Select
  label="Status"
  placeholder="Choose a status…"
  options={statusOptions}
  value={status}
  onChange={(e) => setStatus(e.target.value)}
  required
/>

{/* Error state */}
<Select label="Priority" options={priorityOptions} error="Choose a priority" />
```

#### Accessibility

- Same label / `aria-describedby` / `aria-invalid` wiring as `Input`.
- Placeholder option is rendered `disabled`, so it can't be submitted as a value.
- 44px touch target; error recolors border to `--color-error-border`.

#### Migration status

**Migrated** to Tailwind (no BEM).

---

### 3.4 Badge, PriorityBadge & StatusBadge

**File:** `apps/web/src/components/ui/Badge.tsx`
**Import:** `import { Badge, PriorityBadge, StatusBadge } from '@/components/ui/Badge'`

Small pill labels. The `PriorityBadge`/`StatusBadge` helpers map domain
enums to the right variant + label automatically.

#### Props

`Badge` extends `HTMLAttributes<HTMLSpanElement>`:

| Prop | Type | Default |
|---|---|---|
| `variant` | `'neutral' \| 'success' \| 'warning' \| 'error' \| 'info'` | `'neutral'` |

```ts
interface PriorityBadgeProps { priority: TaskPriority }   // 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
interface StatusBadgeProps { status: TaskStatus }         // 'BACKLOG' | 'PENDING' | 'IN_PROGRESS' | 'BLOCKED' | 'COMPLETED'
```

#### Usage

```tsx
import { Badge, PriorityBadge, StatusBadge } from '@/components/ui/Badge'

<Badge variant="success">Live</Badge>

<PriorityBadge priority="HIGH" />   {/* renders "High" in warning colors */}
<PriorityBadge priority="URGENT" /> {/* renders "Urgent" in error colors */}

<StatusBadge status="IN_PROGRESS" /> {/* renders "In progress" in info colors */}
<StatusBadge status="COMPLETED" />   {/* renders "Completed" in success colors */}
```

#### Variants & semantic maps

| Variant | Palette |
|---|---|
| `neutral` | `gray-100` bg, `gray-700` text, `gray-200` border |
| `success` | `success-50` / `success-700` / `success-border` |
| `warning` | `warning-50` / `warning-700` / `warning-border` |
| `error` | `error-50` / `error-700` / `error-border` |
| `info` | `info-50` / `info-700` / `info-border` |

```ts
PRIORITY_LABELS = { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High', URGENT: 'Urgent' }
PRIORITY_VARIANT = { LOW: neutral, MEDIUM: info, HIGH: warning, URGENT: error }

STATUS_LABELS = { BACKLOG: 'Backlog', PENDING: 'Pending', IN_PROGRESS: 'In progress',
                  BLOCKED: 'Blocked', COMPLETED: 'Completed' }
STATUS_VARIANT = { BACKLOG: neutral, PENDING: info, IN_PROGRESS: info,
                   BLOCKED: error, COMPLETED: success }
```

#### Accessibility

- Status is **never communicated by color alone** (AC-08): every badge ships
  its text label.
- Plain `<span>`; if used standalone to convey state, pair with visually
  hidden text or an existing labelled context.

#### Migration status

**Migrated** to Tailwind + CVA.

---

### 3.5 Skeleton

**File:** `apps/web/src/components/ui/Skeleton.tsx`
**Import:** `import { Skeleton } from '@/components/ui/Skeleton'`

Loading placeholder with a shimmer animation.

#### Props

Extends `HTMLAttributes<HTMLDivElement>`:

| Prop | Type | Default | Description |
|---|---|---|---|
| `as` | `'div' \| 'span'` | `'div'` | Rendered element |

#### Usage

```tsx
import { Skeleton } from '@/components/ui/Skeleton'

<div className="flex flex-col gap-3" role="status" aria-label="Loading tasks">
  <Skeleton className="h-5 w-2/3" />
  <Skeleton className="h-4 w-full" />
  <Skeleton className="h-4 w-1/2" as="span" />
</div>
```

#### Accessibility

- `aria-hidden="true"` by default — wrap skeletons in a container with
  `role="status"` and a visible text equivalent if the region is announced.
- Shimmer animation (`skeleton-shimmer`, 1.8s ease-in-out infinite) is
  disabled under `prefers-reduced-motion` (handled in `global.css`).

#### Migration status

**Migrated** to Tailwind. The `skeleton-shimmer` keyframes are shared with the
legacy `.skeleton` class in `ui.css`.

---

### 3.6 Dialog

**File:** `apps/web/src/components/ui/Dialog.tsx`
**Import:** `import { Dialog } from '@/components/ui/Dialog'`

Hand-rolled modal: `aria-modal`, focus trap, Esc-to-close, focus restore,
rendered through a portal to `document.body`.

#### Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `open` | `boolean` | **required** | Mount/unmount switch |
| `onClose` | `() => void` | **required** | Called on Esc / close button / (external) |
| `title` | `string` | **required** | Heading; `aria-labelledby` the `h2` |
| `children` | `ReactNode` | **required** | Body content |
| `footer` | `ReactNode` | — | Optional footer slot |
| `descriptionId` | `string` | — | Id of an element used as `aria-describedby` |

#### Usage

```tsx
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'

const [open, setOpen] = useState(false)

<Dialog
  open={open}
  onClose={() => setOpen(false)}
  title="Edit task"
  footer={
    <>
      <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
      <Button onClick={handleSave}>Save</Button>
    </>
  }
>
  <p id="dialog-desc">Editing is saved when you confirm.</p>
</Dialog>
```

#### Accessibility

- `role="dialog"` + `aria-modal="true"`; `aria-labelledby` is auto-wired to the
  generated title id (`dialog-title-xxxxxx`).
- Focus moves to the first focusable element (or the panel) on open.
- Focus trap: Tab/Shift+Tab cycle within the panel (`FOCUSABLE_SELECTOR`
  covers links, buttons, inputs, selects, textareas, and positive tabindexes).
- `Esc` closes (with `preventDefault`).
- Focus returns to the element that opened the dialog on close.
- Close button carries `aria-label={Close ${title}}`.
- For descriptions, pass the id of your description element to
  `descriptionId` (e.g. `aria-describedby`).

#### Migration status

**Still BEM** — renders `.dialog`, `.dialog__scrim`, `.dialog__panel`,
`.dialog__header`, `.dialog__title`, `.dialog__body`, `.dialog__footer` and a
legacy `.btn.btn--ghost.btn--sm.btn--icon-only` close button, all styled in
`ui.css`. Behavior and API are final; only the styling layer remains.

---

### 3.7 Drawer

**File:** `apps/web/src/components/ui/Drawer.tsx`
**Import:** `import { Drawer } from '@/components/ui/Drawer'`

Non-modal slide-in side panel (the task panel pattern). Per AP-14 it is
**not** `aria-modal`: the page behind stays accessible and scrollable while
the drawer is open.

#### Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `open` | `boolean` | **required** | Open/close switch |
| `onClose` | `() => void` | **required** | Esc / scrim click / close button |
| `title` | `string` | **required** | Panel heading; used as `aria-label` |
| `side` | `'left' \| 'right'` | `'right'` | Slide-in edge |
| `width` | `number` | `420` | Panel width in px (capped at `100vw`) |
| `children` | `ReactNode` | **required** | Body content |
| `footer` | `ReactNode` | — | Optional footer slot |

#### Usage

```tsx
import { Drawer } from '@/components/ui/Drawer'

const [open, setOpen] = useState(false)

<Drawer
  open={open}
  onClose={() => setOpen(false)}
  title="Task details"
  side="right"
  width={480}
  footer={<Button onClick={handleSave}>Save</Button>}
>
  <TaskDetailPanel task={task} />
</Drawer>
```

#### Motion

- **Entry:** panel slides in over `--duration-slow` (300ms) with
  `--ease-spring` (`cubic-bezier(0.34, 1.56, 0.64, 1)`, gentle overshoot);
  scrim fades in over `--duration-normal` (200ms) with `--ease-decelerate`.
- **Exit:** the component tracks an internal `closing` phase so the exit
  animation plays before unmount — the panel slides back out while the scrim
  fades. The `closing` state clears after 180ms (`--duration-fast` 150ms +
  buffer), then the drawer unmounts.
- Respects `prefers-reduced-motion` via `global.css`.

#### Accessibility

- `role="complementary"` + `aria-label={title}` + `tabIndex={-1}` so the panel
  itself is focusable.
- Focus moves into the panel on open and returns to the trigger on close
  (AP-10).
- `Esc` and scrim click close it. Scrim is `aria-hidden`.
- Page behind remains accessible and scrollable (AP-14) — the panel is **not**
  a modal; there is no focus trap.

#### Migration status

**Still BEM** — renders `.drawer`, `.drawer--left/right`,
`.drawer--closing`, `.drawer__scrim`, `.drawer__panel`,
`.drawer__header/title/body/footer`, styled (including the spring keyframes
`drawer-slide-in-right/left`) in `ui.css`. Close button uses legacy `.btn`
classes.

---

### 3.8 Alert

**File:** `apps/web/src/components/ui/Alert.tsx`
**Import:** `import { Alert } from '@/components/ui/Alert'`

Inline feedback banner. The live-region role is inferred from the variant and
can be overridden.

#### Props

Extends `Omit<HTMLAttributes<HTMLDivElement>, 'title'>`:

| Prop | Type | Default | Description |
|---|---|---|---|
| `variant` | `'info' \| 'success' \| 'warning' \| 'error'` | `'info'` | Visual + icon + inferred role |
| `title` | `ReactNode` | — | Heading line |
| `role` | `'alert' \| 'status'` | inferred | Override the live-region role |
| `children` | `ReactNode` | — | Body content |

Inferred role: `error`/`warning` → `role="alert"`; `info`/`success` →
`role="status"`.

#### Usage

```tsx
import { Alert } from '@/components/ui/Alert'

<Alert variant="error" title="Save failed">
  The task could not be saved. Try again.
</Alert>

<Alert variant="success" title="Task created" />
```

#### Accessibility

- Live-region role mapping per the a11y contract: errors/warnings announce
  with `role="alert"`, info/success with `role="status"`. Override with the
  `role` prop when the inferred role is wrong for the context.
- Icons are decorative (`alert__icon` span, no aria semantics).

#### Migration status

**Still BEM** — `.alert`, `.alert--{info|success|warning|error}`,
`.alert__icon/content/title/body` in `ui.css`.

---

### 3.9 EmptyState

**File:** `apps/web/src/components/ui/EmptyState.tsx`
**Import:** `import { EmptyState } from '@/components/ui/EmptyState'`

Friendly zero-data state with optional call to action.

#### Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `title` | `string` | **required** | Heading |
| `description` | `ReactNode` | — | Supporting copy |
| `action` | `ReactNode` | — | CTA (e.g. a `Button`) |

#### Usage

```tsx
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'

<EmptyState
  title="No tasks yet"
  description="Create your first task to get started."
  action={<Button onClick={handleCreate}>Create task</Button>}
/>
```

#### Accessibility

- Inbox icon is decorative (`aria-hidden`).
- Structural `h3` heading: ensure heading level fits the page hierarchy.

#### Migration status

**Still BEM** — `.empty-state`, `.empty-state__icon/title/description/action`
in `ui.css`.

---

### 3.10 ErrorState

**File:** `apps/web/src/components/ui/ErrorState.tsx`
**Import:** `import { ErrorState } from '@/components/ui/ErrorState'`

Failed data-load screen with a retry action. Shows the API `traceId`
(Problem Details) as an unobtrusive footnote for support requests.

#### Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `title` | `string` | `'Something went wrong'` | Heading |
| `message` | `string` | `'We could not load this data. Please try again.'` | Body copy |
| `traceId` | `string` | — | API trace id rendered as `Reference: {traceId}` |
| `onRetry` | `() => void` | — | Renders a "Try again" button when provided |
| `retryLabel` | `string` | `'Try again'` | Button text |

#### Usage

```tsx
import { ErrorState } from '@/components/ui/ErrorState'

<ErrorState
  traceId={error.traceId}
  onRetry={refetch}
/>
```

#### Accessibility

- Root has `role="alert"` so failures are announced.
- Retry button is a real `<button>` (legacy `.btn btn--secondary btn--sm`).

#### Migration status

**Still BEM** — `.error-state`, `.error-state__icon/title/message/trace` in
`ui.css`; the retry button uses legacy `.btn` classes.

---

### 3.11 Card

**File:** `apps/web/src/components/ui/Card.tsx`
**Import:** `import { Card } from '@/components/ui/Card'`

Surface container with optional header/footer slots.

#### Props

Extends `HTMLAttributes<HTMLDivElement>`:

| Prop | Type | Default | Description |
|---|---|---|---|
| `header` | `ReactNode` | — | Header slot (`card__header`) |
| `footer` | `ReactNode` | — | Footer slot (`card__footer`) |
| `children` | `ReactNode` | — | Body content (`card__body`) |

#### Usage

```tsx
import { Card } from '@/components/ui/Card'

<Card
  header={<h3 className="text-lg font-semibold">Task summary</h3>}
  footer={<span className="text-sm text-gray-400">Updated 2h ago</span>}
>
  <p>Details go here.</p>
</Card>
```

#### Migration status

**Still BEM** — `.card`, `.card__header/body/footer` in `ui.css`.

---

### 3.12 ConfirmDialog

**File:** `apps/web/src/components/ui/ConfirmDialog.tsx`
**Import:** `import { ConfirmDialog } from '@/components/ui/ConfirmDialog'`

Destructive/decision confirmation wrapper over `Dialog` + `Button`: description
copy with a Cancel / Confirm footer. Used by archive, deactivate, and role
demotion flows (CLI-FE-004, USR-FE-002).

#### Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `open` | `boolean` | **required** | Forwarded to `Dialog` |
| `title` | `string` | **required** | Dialog title |
| `description` | `ReactNode` | — | Confirm copy |
| `confirmLabel` | `string` | **required** | Confirm button text |
| `danger` | `boolean` | `false` | Danger-styled confirm button + `role="alert"` description |
| `isLoading` | `boolean` | `false` | Disables both buttons; confirm shows spinner + `Working…` |
| `onConfirm` | `() => void` | **required** | Confirm handler |
| `onClose` | `() => void` | **required** | Cancel / dismiss handler |

#### Usage

```tsx
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'

<ConfirmDialog
  open={confirmOpen}
  title="Archive task"
  description="Archived tasks are hidden from active lists. You can restore them later."
  confirmLabel="Archive"
  danger
  isLoading={archiving}
  onConfirm={handleArchive}
  onClose={() => setConfirmOpen(false)}
/>
```

#### Accessibility

- Inherits the full `Dialog` a11y contract (focus trap, Esc, focus restore).
- With `danger`, the description is announced with `role="alert"` and the
  confirm button uses the `danger` variant.
- While `isLoading`, both buttons are disabled and the confirm shows a spinner
  with `aria-busy`.

#### Migration status

**Hybrid** — the `Button` pair is the migrated Tailwind component; the modal
shell is the still-BEM `Dialog`; the description uses a legacy `.confirm-copy`
class from `ui.css`.

---

### 3.13 Icons

**File:** `apps/web/src/components/ui/icons.tsx`
**Import:** `import { IconX } from '@/components/ui/icons'`

All icons are re-exports of [lucide-react](https://lucide.dev) with an `Icon`
prefix — API-compatible with the previous hand-rolled SVG set. They accept
lucide's props (e.g. `size`, `strokeWidth`).

| Export | lucide source |
|---|---|
| `IconSpinner` | `Loader2` |
| `IconAlertTriangle` | `TriangleAlert` |
| `IconCheckCircle` | `CircleCheck` |
| `IconInfo` | `Info` |
| `IconX` | `X` |
| `IconMenu` | `Menu` |
| `IconChevronDown` | `ChevronDown` |
| `IconChevronRight` | `ChevronRight` |
| `IconUser` | `User` |
| `IconInbox` | `Inbox` |
| `IconSearch` | `Search` |
| `IconCalendar` | `Calendar` |
| `IconLock` | `Lock` |
| `IconShield` | `Shield` |
| `IconArrowLeft` | `ArrowLeft` |
| `IconArrowUp` | `ArrowUp` |
| `IconArrowDown` | `ArrowDown` |
| `IconLogOut` | `LogOut` |
| `IconPlus` | `Plus` |
| `IconArchive` | `Archive` |
| `IconClock` | `Clock` |
| `IconEdit` | `Pencil` |
| `IconGripVertical` | `GripVertical` |
| `IconHistory` | `History` |

#### Usage

```tsx
import { IconSearch, IconSpinner } from '@/components/ui/icons'

<IconSearch size={16} />
<IconSpinner className="animate-spin" />
```

#### Accessibility

- Decorative use: wrap in `aria-hidden="true"` (the ui components do this
  automatically for their internal icons — e.g. `Button` icons, `Input`
  `leftIcon`).
- Icons that carry meaning (e.g. a standalone status icon) need a labelled
  context or `aria-label` on the parent.

#### Migration status

**Migrated** — lucide-react re-exports; the old hand-rolled SVG icons are gone.

---

## 4. Cross-cutting conventions

- `cn()` (from `@/lib/utils`, class-variance-authority's `cx`-style merge)
  combines CVA output with caller `className` — never concat strings manually
  in migrated components.
- A11y identifiers (AC-05 touch target ≥ 44px, AC-08 no color-only status,
  AP-10 focus restore, AP-12 always-visible labels, AP-14 non-modal drawer)
  are enforced per component; see each section.
- **Do not remove the BEM styling layer** (`ui.css`) while components like
  `Dialog`, `Drawer`, `Alert`, `EmptyState`, `ErrorState`, and `Card` still
  rely on it.
- New tokens must be added to **both** `tokens.css` and the `@theme` block in
  `tailwind.css`.
