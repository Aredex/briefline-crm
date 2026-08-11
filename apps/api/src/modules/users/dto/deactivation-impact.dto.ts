// GET /users/:id/deactivation-impact shapes — USR-004 (PH-04).
//
// Counts + summaries of the tasks that would be orphaned or stalled if the
// user were deactivated:
//   - assigned: open tasks currently assigned to the user
//     (archivedAt IS NULL AND status NOT IN [COMPLETED])
//   - created:  open tasks created by the user that are not yet completed
//     (archivedAt IS NULL AND status != COMPLETED)
import type { TaskPriority, TaskStatus } from '../../../../../../packages/api-contract/src/generated/prisma/client'

export interface TaskSummary {
  id: string
  title: string
  status: TaskStatus
  priority: TaskPriority
  assignee: { id: string; name: string } | null
  client: { id: string; companyName: string } | null
  dueDate: Date | null
  version: number
  updatedAt: Date
  labels: { id: string; name: string; color: string }[]
}

export interface DeactivationImpact {
  userId: string
  assignedTasks: { count: number; tasks: TaskSummary[] }
  createdTasks: { count: number; tasks: TaskSummary[] }
}
