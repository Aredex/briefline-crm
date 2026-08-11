/*
 * PagePlaceholder — dev scaffold placeholder used by the PH-07 pages until
 * their phase lands. Shows the page name and route for quick orientation.
 */
import type { ReactNode } from 'react'

export interface PagePlaceholderProps {
  title: string
  description?: string
  children?: ReactNode
}

export function PagePlaceholder({ title, description, children }: PagePlaceholderProps) {
  return (
    <section className="page-placeholder">
      <h1 className="page-placeholder__title">{title}</h1>
      {description && <p className="page-placeholder__description">{description}</p>}
      {children}
    </section>
  )
}
