// Task -> API response mappers — TASK-API-001..010 (PH-06).
//
// The single place where Prisma Task/TaskChange rows become the API contract:
// FK columns become resolved refs, `dueDate` becomes the 'YYYY-MM-DD' date-only
// string the OpenAPI declares (ADR-003), and TaskChange entries gain their
// derived version (D-5: version = 1 + index in createdAt order). Every response
// path MUST go through here — never the raw Prisma model.
import type { Task, TaskChange, TaskChangeEvent } from '../../generated/prisma/client'
import type { TaskChangeResponse, TaskResponse, TaskSummary } from './dto/task-response.dto'

export interface UserRefShape {
  id: string
  name: string
}

export interface ClientRefShape {
  id: string
  companyName: string
}

export interface LabelRefShape {
  id: string
  name: string
  color: string
}

/** @db.Date values round-trip as UTC-midnight Date; slice to 'YYYY-MM-DD' (ADR-003). */
export function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export type TaskWithRefs = Task & {
  assignee: UserRefShape | null
  client: ClientRefShape | null
  creator: UserRefShape
  archiver: UserRefShape | null
  /** Join rows (TaskLabel) — flattened to LabelRefShape by the mappers (LAB-002). */
  labels: Array<{ label: LabelRefShape }>
}

/** Card row — only the refs the summary shape needs (board/list/my-tasks). */
export type TaskCardRow = Task & {
  assignee: UserRefShape | null
  client: ClientRefShape | null
  labels: Array<{ label: LabelRefShape }>
}

export function toTaskSummary(task: TaskCardRow): TaskSummary {
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    assignee: task.assignee,
    client: task.client,
    dueDate: task.dueDate ? toDateOnly(task.dueDate) : null,
    version: task.version,
    updatedAt: task.updatedAt,
    labels: task.labels.map((tl) => tl.label),
  }
}

export function toTaskResponse(task: TaskWithRefs): TaskResponse {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    assignee: task.assignee,
    client: task.client,
    dueDate: task.dueDate ? toDateOnly(task.dueDate) : null,
    blockedReason: task.blockedReason,
    creator: task.creator,
    version: task.version,
    archivedAt: task.archivedAt,
    archivedBy: task.archiver,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    labels: task.labels.map((tl) => tl.label),
  }
}

export type ChangeWithActor = TaskChange & { actor: UserRefShape }

/** History entry version = 1-based position in the chronological timeline (D-5). */
export function toTaskChange(change: ChangeWithActor, index: number): TaskChangeResponse {
  return {
    id: change.id,
    taskId: change.taskId,
    version: index + 1,
    event: change.event as TaskChangeEvent,
    field: change.field,
    oldValue: change.oldValue,
    newValue: change.newValue,
    actor: change.actor,
    createdAt: change.createdAt,
  }
}
