/*
 * EmptyState — friendly zero-data state with optional CTA. Decorative icon.
 */
import type { ReactNode } from 'react'
import { IconInbox } from './icons'

export interface EmptyStateProps {
  title: string
  description?: ReactNode
  action?: ReactNode
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <span className="empty-state__icon" aria-hidden="true">
        <IconInbox />
      </span>
      <h3 className="empty-state__title">{title}</h3>
      {description && <p className="empty-state__description">{description}</p>}
      {action && <div className="empty-state__action">{action}</div>}
    </div>
  )
}
