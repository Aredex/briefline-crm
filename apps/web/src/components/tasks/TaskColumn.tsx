/*
 * TaskColumn (TASK-FE-001/004) — one active status group: named heading with
 * count and the cards inside. Same DOM renders the desktop grid and the mobile
 * stacked list (grouped by status, no page-level horizontal scroll); CSS media
 * queries flip the layout. Column headers stay visible when the group is empty
 * so the board always communicates all four active statuses.
 */
import { useDroppable } from '@dnd-kit/core'
import type { TaskStatus, TaskSummary } from '../../api/types'
import { STATUS_LABELS } from '../ui/Badge'
import { TaskCard } from './TaskCard'

export type ActiveStatus = Exclude<TaskStatus, 'BACKLOG'>

export interface TaskColumnProps {
  status: ActiveStatus
  tasks: TaskSummary[]
  canEditTask: (task: TaskSummary) => boolean
  isMovingTask: (taskId: string) => boolean
  onMove: (task: TaskSummary, status: TaskStatus, blockedReason?: string) => void
  onEdit: (task: TaskSummary) => void
  onRequireAssignee: (task: TaskSummary) => void
  /** Progressive enhancement: register the column as a DnD drop target. */
  dndEnabled?: boolean
}

export function TaskColumn({
  status,
  tasks,
  canEditTask,
  isMovingTask,
  onMove,
  onEdit,
  onRequireAssignee,
  dndEnabled = false,
}: TaskColumnProps) {
  // Only the four active columns are drop targets — the backlog is NOT
  // (the contract moves tasks out of the backlog, never back in).
  const { setNodeRef, isOver } = useDroppable({ id: status, disabled: !dndEnabled })
  const headingId = `column-${status.toLowerCase()}`
  return (
    <section
      ref={setNodeRef}
      className={`task-column${isOver ? ' task-column--drop' : ''}`}
      aria-labelledby={headingId}
    >
      <h2 id={headingId} className="task-column__heading">
        <span className="task-column__name">{STATUS_LABELS[status]}</span>
        <span className="task-column__count" aria-label={`${tasks.length} tasks`}>
          {tasks.length}
        </span>
      </h2>
      <div className="task-column__list">
        {tasks.length === 0 ? (
          <p className="task-column__empty">No tasks here</p>
        ) : (
          tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              canEdit={canEditTask(task)}
              isMoving={isMovingTask(task.id)}
              dndEnabled={dndEnabled}
              onMove={(nextStatus, blockedReason) => onMove(task, nextStatus, blockedReason)}
              onEdit={() => onEdit(task)}
              onRequireAssignee={() => onRequireAssignee(task)}
            />
          ))
        )}
      </div>
    </section>
  )
}
