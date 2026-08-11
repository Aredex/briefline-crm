/*
 * KpiCard (DASH-001) — metric card that deep-links into the board with the
 * matching filter (DASH-004). A real <Link> (anchor) keeps it keyboard
 * navigable and gives the browser native back/forward behavior.
 *
 * States: loading → pulsing skeleton in the value slot; error → "—" with a
 * native tooltip ("Unable to load") while the link stays usable; ready →
 * the number. Tone drives the icon color and squircle surface.
 */
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Skeleton } from '../ui/Skeleton'

export type KpiTone = 'primary' | 'warning' | 'danger' | 'success'

export interface KpiCardProps {
  label: string
  /** Board deep link, e.g. "/tasks?due=OVERDUE". */
  href: string
  icon: ReactNode
  tone: KpiTone
  isLoading: boolean
  isError: boolean
  value?: number
}

export function KpiCard({ label, href, icon, tone, isLoading, isError, value }: KpiCardProps) {
  const accessibleName = isLoading || isError ? label : `${label}: ${value ?? 0}`
  return (
    <Link
      to={href}
      className={`kpi-card kpi-card--${tone}`}
      aria-label={accessibleName}
      title={isError ? 'Unable to load' : undefined}
    >
      <span className="kpi-card__icon" aria-hidden="true">
        {icon}
      </span>
      <span className="kpi-card__value">
        {isLoading ? (
          <Skeleton className="kpi-card__skeleton" />
        ) : isError ? (
          '—'
        ) : (
          value
        )}
      </span>
      <span className="kpi-card__label">{label}</span>
    </Link>
  )
}
