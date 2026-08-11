/*
 * PrimaryBadge — the one-primary-per-client marker (CONT-001). Label is always
 * present (AC-08): never communicated by color alone.
 */
import { Badge } from '../ui/Badge'

export function PrimaryBadge() {
  return <Badge variant="success">Primary</Badge>
}
