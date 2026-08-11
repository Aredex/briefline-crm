/*
 * UserBadges — role and status badges for the users table. Text + color
 * always (AC-08): Admin → info, Member → neutral; Active → success,
 * Inactive → neutral.
 */
import type { UserRole, UserStatus } from '../../api/types'
import { Badge } from '../ui/Badge'

export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: 'Admin',
  MEMBER: 'Member',
}

export const USER_STATUS_LABELS: Record<UserStatus, string> = {
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
}

export function RoleBadge({ role }: { role: UserRole }) {
  return <Badge variant={role === 'ADMIN' ? 'info' : 'neutral'}>{ROLE_LABELS[role]}</Badge>
}

export function UserStatusBadge({ status }: { status: UserStatus }) {
  return <Badge variant={status === 'ACTIVE' ? 'success' : 'neutral'}>{USER_STATUS_LABELS[status]}</Badge>
}
