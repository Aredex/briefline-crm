/*
 * ClientStatusBadge — status is NEVER communicated by color alone (AC-08):
 * the label is always present. Active → success, Inactive → warning,
 * Archived → neutral (read-only state).
 */
import type { ClientStatus } from '../../api/types'
import { Badge, type BadgeVariant } from '../ui/Badge'

export const CLIENT_STATUS_LABELS: Record<ClientStatus, string> = {
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  ARCHIVED: 'Archived',
}

const CLIENT_STATUS_VARIANT: Record<ClientStatus, BadgeVariant> = {
  ACTIVE: 'success',
  INACTIVE: 'warning',
  ARCHIVED: 'neutral',
}

export function ClientStatusBadge({ status }: { status: ClientStatus }) {
  return <Badge variant={CLIENT_STATUS_VARIANT[status]}>{CLIENT_STATUS_LABELS[status]}</Badge>
}
