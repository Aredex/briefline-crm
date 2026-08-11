/*
 * Unit tests for the display formatting helpers (src/lib/format.ts).
 *
 * All tests pin a fixed "now" (2026-08-11T12:00:00Z) via fake timers so the
 * relative/absolute boundaries are deterministic. Instants are chosen at
 * 12:00 UTC so the civil day is stable in nearly every host timezone
 * (formatAbsoluteDate/dueLabel read the host-local day); madridToday is tested
 * with its own Europe/Madrid conversion, including the midnight cross-over.
 */
import { describe, expect, it, afterEach, vi } from 'vitest'
import {
  dueLabel,
  formatAbsoluteDate,
  formatDueDate,
  formatRelativeDate,
  madridToday,
} from '../src/lib/format'

const NOW = '2026-08-11T12:00:00Z'

afterEach(() => {
  vi.useRealTimers()
})

describe('formatRelativeDate', () => {
  it('returns "Never" for null, empty and invalid input', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(NOW))
    expect(formatRelativeDate(null)).toBe('Never')
    expect(formatRelativeDate('')).toBe('Never')
    expect(formatRelativeDate('not-a-date')).toBe('Never')
  })

  it('renders "Just now" for under a minute', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(NOW))
    expect(formatRelativeDate('2026-08-11T11:59:30Z')).toBe('Just now')
  })

  it('renders minute buckets for under an hour', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(NOW))
    expect(formatRelativeDate('2026-08-11T11:59:00Z')).toBe('1m ago')
    expect(formatRelativeDate('2026-08-11T11:55:00Z')).toBe('5m ago')
    expect(formatRelativeDate('2026-08-11T11:01:00Z')).toBe('59m ago')
  })

  it('renders hour buckets for under a day', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(NOW))
    expect(formatRelativeDate('2026-08-11T11:00:00Z')).toBe('1h ago')
    expect(formatRelativeDate('2026-08-11T00:00:00Z')).toBe('12h ago')
    expect(formatRelativeDate('2026-08-10T13:00:00Z')).toBe('23h ago')
  })

  it('renders day buckets for under 30 days', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(NOW))
    expect(formatRelativeDate('2026-08-10T12:00:00Z')).toBe('1d ago')
    expect(formatRelativeDate('2026-07-13T12:00:00Z')).toBe('29d ago')
  })

  it('falls back to an absolute date at 30 days and older', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(NOW))
    expect(formatRelativeDate('2026-07-12T12:00:00Z')).toBe('Jul 12')
  })

  it('falls back to the absolute date for future timestamps (clock skew — never lies)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(NOW))
    expect(formatRelativeDate('2026-08-12T12:00:00Z')).toBe('Aug 12')
  })
})

describe('formatAbsoluteDate', () => {
  it('renders "Month day" without the year for the current year', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(NOW))
    expect(formatAbsoluteDate('2026-08-11T12:00:00Z')).toBe('Aug 11')
  })

  it('appends the year for dates outside the current year', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(NOW))
    expect(formatAbsoluteDate('2025-08-11T12:00:00Z')).toBe('Aug 11, 2025')
  })

  it('renders December and January edges correctly', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(NOW))
    expect(formatAbsoluteDate('2026-12-31T12:00:00Z')).toBe('Dec 31')
    expect(formatAbsoluteDate('2027-01-01T12:00:00Z')).toBe('Jan 1, 2027')
  })
})

describe('madridToday', () => {
  it('returns the civil date in Europe/Madrid (CEST) for a midday instant', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-11T12:00:00Z'))
    expect(madridToday()).toBe('2026-08-11')
  })

  it('rolls to the NEXT Madrid day when the UTC instant is past Madrid midnight', () => {
    // 22:30Z in August = 00:30 next day in Madrid (UTC+2).
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-11T22:30:00Z'))
    expect(madridToday()).toBe('2026-08-12')
  })

  it('rolls to the next day in winter (CET, UTC+1) too', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-31T23:30:00Z'))
    expect(madridToday()).toBe('2026-02-01')
  })
})

describe('dueLabel', () => {
  it('returns kind "none" for a missing due date', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(NOW))
    expect(dueLabel(null)).toEqual({ kind: 'none' })
  })

  it('returns "Overdue" for dates before today (string comparison — no DST math)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(NOW))
    expect(dueLabel('2026-08-10')).toEqual({ kind: 'overdue', label: 'Overdue' })
  })

  it('returns "Due today" exactly on today', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(NOW))
    expect(dueLabel('2026-08-11')).toEqual({ kind: 'today', label: 'Due today' })
  })

  it('renders a plain date without year for future dates in the current year', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(NOW))
    expect(dueLabel('2026-08-21')).toEqual({ kind: 'date', label: 'Aug 21' })
  })

  it('renders a dated label with the year for future dates beyond the current year', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(NOW))
    expect(dueLabel('2027-03-05')).toEqual({ kind: 'date', label: 'Mar 5, 2027' })
  })
})

describe('formatDueDate', () => {
  it('returns "No due date" for a missing value', () => {
    expect(formatDueDate(null)).toBe('No due date')
  })

  it('reports overdue days with a minimum of 1 day', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(NOW))
    // 12 hours late — ceil(0.5) clamps to 1.
    expect(formatDueDate('2026-08-11T00:00:00Z')).toBe('Overdue by 1d')
    // 2.5 days late — ceil(2.5) rounds up to 3.
    expect(formatDueDate('2026-08-09T00:00:00Z')).toBe('Overdue by 3d')
  })

  it('renders an absolute date for future or exactly-now instants', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(NOW))
    expect(formatDueDate('2026-08-11T12:00:00Z')).toBe('Aug 11')
    expect(formatDueDate('2026-08-21T12:00:00Z')).toBe('Aug 21')
  })
})
