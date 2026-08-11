/*
 * Alert — inline feedback. role mapping per the a11y contract: errors and
 * warnings announce with role="alert", info/success with role="status".
 */
import type { HTMLAttributes, ReactNode } from 'react'
import { IconAlertTriangle, IconCheckCircle, IconInfo } from './icons'

export type AlertVariant = 'info' | 'success' | 'warning' | 'error'

export interface AlertProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  variant?: AlertVariant
  title?: ReactNode
  /** Override the inferred live region role (alert for error/warning). */
  role?: 'alert' | 'status'
}

const ICON: Record<AlertVariant, typeof IconInfo> = {
  info: IconInfo,
  success: IconCheckCircle,
  warning: IconAlertTriangle,
  error: IconAlertTriangle,
}

export function Alert({ variant = 'info', title, role, children, className, ...rest }: AlertProps) {
  const Icon = ICON[variant]
  const liveRole = role ?? (variant === 'error' || variant === 'warning' ? 'alert' : 'status')
  return (
    <div className={`alert alert--${variant} ${className ?? ''}`} role={liveRole} {...rest}>
      <Icon className="alert__icon" />
      <div className="alert__content">
        {title && <p className="alert__title">{title}</p>}
        {children && <div className="alert__body">{children}</div>}
      </div>
    </div>
  )
}
