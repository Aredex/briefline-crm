// Central task object policy — TASK-API-001 (PH-06).
//
// Mirrors permission-matrix.md §4 rows 19-31 + edge cases 3/4/15/16/18:
//
//   canViewTask  — active tasks: team-wide view for every authenticated user.
//                  Archived: admin only; members get a 404 identical to an
//                  unknown id (BOLA-safe, BR-016).
//   canEditTask  — archived: no one (admin -> 409 TASK_ARCHIVED, member -> 404
//                  at resolve time). Admin: any task (BR-014). Member: only
//                  tasks they created or are assigned to (BR-013) — otherwise
//                  403, never a hint about the task's existence.
//   canArchiveTask — admin only (BR-015); a double archive is a 409 no-op.
//
// These pure predicates are the ONLY authorization surface for tasks — every
// read/write path in TasksService routes through them inside the mutation
// transaction, so authorization and mutation commit atomically (TASK-API-008).
import type { UserRole } from '../../../../../packages/api-contract/src/generated/prisma/client'

export interface TaskRowLike {
  archivedAt: Date | null
  creatorId: string
  assigneeId: string | null
}

export interface ActorLike {
  id: string
  role: UserRole
}

export function canViewTask(actor: ActorLike, task: TaskRowLike): boolean {
  if (task.archivedAt) return actor.role === 'ADMIN'
  return true
}

export function canEditTask(actor: ActorLike, task: TaskRowLike): boolean {
  if (task.archivedAt) return false
  if (actor.role === 'ADMIN') return true
  return task.creatorId === actor.id || task.assigneeId === actor.id
}

export function canArchiveTask(actor: ActorLike, task: TaskRowLike): boolean {
  if (actor.role !== 'ADMIN') return false
  return !task.archivedAt
}
