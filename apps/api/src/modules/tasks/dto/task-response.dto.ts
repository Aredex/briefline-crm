// Task response shapes — TASK-API-001..010 (PH-06).
//
// The API NEVER exposes the Prisma Task/TaskChange models directly — every
// response goes through the mapper (tasks.mapper.ts). The Prisma model carries
// raw FK columns (assigneeId, creatorId, archivedById); the API exposes the
// resolved `assignee`/`creator`/`archivedBy` user refs and `client` refs.
import type {
  TaskChangeEvent,
  TaskPriority,
  TaskStatus,
} from '../../../generated/prisma/client'
import type { TaskComment } from '../../comments/dto/comment-response.dto'
import type { TaskLabelRef } from '../../labels/dto/label-response.dto'

export interface UserRef {
  id: string
  name: string
}

export interface ClientRef {
  id: string
  companyName: string
}

export interface PageMeta {
  page: number
  limit: number
  total: number
}

/** Compact task card (board, lists, my tasks) — no description or history. */
export interface TaskSummary {
  id: string
  title: string
  status: TaskStatus
  priority: TaskPriority
  assignee: UserRef | null
  client: ClientRef | null
  /** Date-only deadline, serialized 'YYYY-MM-DD' (ADR-003). */
  dueDate: string | null
  version: number
  updatedAt: Date
  /** Assigned labels, alphabetical (LAB-002). */
  labels: TaskLabelRef[]
}

/** Full task representation. */
export interface TaskResponse {
  id: string
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  assignee: UserRef | null
  client: ClientRef | null
  dueDate: string | null
  blockedReason: string | null
  creator: UserRef
  version: number
  archivedAt: Date | null
  archivedBy: UserRef | null
  createdAt: Date
  updatedAt: Date
  /** Assigned labels, alphabetical (LAB-002). */
  labels: TaskLabelRef[]
}

/** Append-only history entry; version = task version after this mutation (D-5). */
export interface TaskChangeResponse {
  id: string
  taskId: string
  version: number
  event: TaskChangeEvent
  field: string | null
  oldValue: string | null
  newValue: string | null
  actor: UserRef
  createdAt: Date
}

/** GET /tasks/:id — task plus its last 5 comments, newest first (PC-03, COMM-001). */
export interface TaskDetailResponse extends TaskResponse {
  comments: TaskComment[]
}

/** GET /tasks/board — separate backlog plus the four active columns (DEC-035). */
export interface BoardData {
  backlog: TaskSummary[]
  columns: {
    PENDING: TaskSummary[]
    IN_PROGRESS: TaskSummary[]
    BLOCKED: TaskSummary[]
    COMPLETED: TaskSummary[]
  }
}

export interface BoardResponse {
  data: BoardData
  meta: { total: number }
}
