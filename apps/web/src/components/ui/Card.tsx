/*
 * Card — surface container with optional header/footer slots.
 */
import type { HTMLAttributes, ReactNode } from 'react'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  header?: ReactNode
  footer?: ReactNode
}

export function Card({ header, footer, className, children, ...rest }: CardProps) {
  return (
    <div className={`card ${className ?? ''}`} {...rest}>
      {header && <div className="card__header">{header}</div>}
      {children && <div className="card__body">{children}</div>}
      {footer && <div className="card__footer">{footer}</div>}
    </div>
  )
}
