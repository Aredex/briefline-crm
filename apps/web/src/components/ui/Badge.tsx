/*
 * Badge — neutral/success/warning/error/info variants plus semantic maps for
 * task priority and status. Status is NEVER communicated by color alone
 * (AC-08): every badge ships with its text label.
 */
import type { HTMLAttributes } from 'react'
import type { TaskPriority, TaskStatus } from '../../api/types'

export type BadgeVariant = 'neutral' | 'success' | 'warning' | 'error' | 'info'

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
}

export function Badge({ variant = 'neutral', className, children, ...rest }: BadgeProps) {
  return (
    <span className={`badge badge--${variant} ${className ?? ''}`} {...rest}>
      {children}
    </span>
  )
}

/* ---------- Semantic maps (labels come from the wireframes) ---------- */

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
