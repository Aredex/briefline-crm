/*
 * Badge — neutral/success/warning/error/info variants plus semantic maps for
 * task priority and status. Status is NEVER communicated by color alone
 * (AC-08): every badge ships with its text label. Migrated to Tailwind CSS.
 */
import { cva, type VariantProps } from 'class-variance-authority'
import type { HTMLAttributes } from 'react'
import { cn } from '../../lib/utils'
import type { TaskPriority, TaskStatus } from '../../api/types'

const badgeVariants = cva(
  'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border',
  {
    variants: {
      variant: {
        neutral: 'bg-[var(--color-gray-100)] text-[var(--color-gray-700)] border-[var(--color-gray-200)]',
        success: 'bg-[var(--color-success-50)] text-[var(--color-success-700)] border-[var(--color-success-border)]',
        warning: 'bg-[var(--color-warning-50)] text-[var(--color-warning-700)] border-[var(--color-warning-border)]',
        error: 'bg-[var(--color-error-50)] text-[var(--color-error-700)] border-[var(--color-error-border)]',
        info: 'bg-[var(--color-info-50)] text-[var(--color-info-700)] border-[var(--color-info-border)]',
      },
    },
    defaultVariants: {
      variant: 'neutral',
    },
  },
)

export type BadgeVariant = VariantProps<typeof badgeVariants>['variant']

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
}

export function Badge({ variant, className, children, ...rest }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...rest}>
      {children}
    </span>
  )
}

/* ---------- Semantic maps ---------- */

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  URGENT: 'Urgent',
}

export const STATUS_LABELS: Record<TaskStatus, string> = {
  BACKLOG: 'Backlog',
  PENDING: 'Pending',
  IN_PROGRESS: 'In progress',
  BLOCKED: 'Blocked',
  COMPLETED: 'Completed',
}

const PRIORITY_VARIANT: Record<TaskPriority, BadgeVariant> = {
  LOW: 'neutral',
  MEDIUM: 'info',
  HIGH: 'warning',
  URGENT: 'error',
}

const STATUS_VARIANT: Record<TaskStatus, BadgeVariant> = {
  BACKLOG: 'neutral',
  PENDING: 'info',
  IN_PROGRESS: 'info',
  BLOCKED: 'error',
  COMPLETED: 'success',
}

export interface PriorityBadgeProps {
  priority: TaskPriority
}

export function PriorityBadge({ priority }: PriorityBadgeProps) {
  return <Badge variant={PRIORITY_VARIANT[priority]}>{PRIORITY_LABELS[priority]}</Badge>
}

export interface StatusBadgeProps {
  status: TaskStatus
}

export function StatusBadge({ status }: StatusBadgeProps) {
  return <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABELS[status]}</Badge>
}
