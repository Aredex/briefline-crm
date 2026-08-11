/*
 * Display formatting helpers — relative dates for tables (wireframes §2.5:
 * "Updated (relative date)"). Pure functions; no locale-dependent surprises
 * (the relative text is always derived from an absolute diff, never a locale).
 */

/** Relative date: "Just now", "5m ago", "3h ago", "2d ago", or an absolute date. */
export function formatRelativeDate(iso: string | null): string {
  if (!iso) return 'Never'
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return 'Never'
  const diffMs = Date.now() - then
  if (diffMs < 0) return formatAbsoluteDate(iso) // clock skew / future fixture — never lie
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return formatAbsoluteDate(iso)
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Aug 1" / "Aug 1, 2025" — used once a date is older than ~30 days. */
export function formatAbsoluteDate(iso: string): string {
  const date = new Date(iso)
  const month = MONTHS[date.getMonth()]
  const day = date.getDate()
  return date.getFullYear() === new Date().getFullYear()
    ? `${month} ${day}`
    : `${month} ${day}, ${date.getFullYear()}`
}

/* ---------- Task due dates (BR-019/020) ---------- */
/* Contract: dueDate is date-only (YYYY-MM-DD), interpreted as end-of-day in
 * Europe/Madrid. We compare civil dates as strings — no Date/DST math — so
 * "today", "overdue" and plain labels stay deterministic in any timezone. */

/** Today's civil date in Europe/Madrid as YYYY-MM-DD. */
export function madridToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

export type DueLabel =
  | { kind: 'none' }
  | { kind: 'overdue'; label: string }
  | { kind: 'today'; label: string }
  | { kind: 'date'; label: string }

/**
 * Due-date display label: "Overdue" (red + icon in the card), "Due today",
 * or an absolute date ("Aug 21"). Date-only parsing avoids timezone drift.
 */
export function dueLabel(due: string | null): DueLabel {
  if (!due) return { kind: 'none' }
  const today = madridToday()
  if (due < today) return { kind: 'overdue', label: 'Overdue' }
  if (due === today) return { kind: 'today', label: 'Due today' }
  const [year, month = 1, day = 1] = due.split('-').map(Number)
  const label =
    year === new Date().getFullYear()
      ? `${MONTHS[month - 1]} ${day}`
      : `${MONTHS[month - 1]} ${day}, ${year}`
  return { kind: 'date', label }
}

/** Due-date label: "Aug 21" or "Overdue by 3d" (used in related tasks). */
export function formatDueDate(iso: string | null): string {
  if (!iso) return 'No due date'
  const due = new Date(iso)
  const diffMs = due.getTime() - Date.now()
  if (diffMs < 0) {
    const daysLate = Math.max(1, Math.ceil(-diffMs / 86_400_000))
    return `Overdue by ${daysLate}d`
  }
  return formatAbsoluteDate(iso)
}
