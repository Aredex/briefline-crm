// Dashboard response shapes — TASK-API-011 (PH-06, FR-DASH-001..003).
import type { TaskChangeEvent } from '../../../../../../packages/api-contract/src/generated/prisma/client'
import type { PageMeta, TaskSummary } from '../../tasks/dto/task-response.dto'

/** GET /dashboard/kpis — server-side counts over all active tasks (DASH-001). */
export interface Kpis {
  /** Non-completed, non-archived active tasks. */
  open: number
  /** Due date fully ended in Europe/Madrid (BR-019/020, ADR-003). */
  overdue: number
  /** Tasks currently BLOCKED. */
  blocked: number
  /** Tasks completed within the last 7 days. */
  completedLast7Days: number
}

export interface DashboardKpisResponse {
  data: Kpis
}

export interface DashboardMyTasksResponse {
  data: TaskSummary[]
  meta: PageMeta
}

/** GET /dashboard/recent-activity — dashboard feed item derived from TaskChange. */
export interface ActivityItem {
  id: string
  type: TaskChangeEvent
  taskId: string
  taskTitle: string
  actorName: string
  occurredAt: Date
}

export interface DashboardRecentActivityResponse {
  data: ActivityItem[]
  meta: PageMeta
}

export type { PageMeta, TaskSummary }
