/*
 * TaskBoard (TASK-FE-001/004/010/011) — backlog section (collapsible, internal
 * scroll, max-height ~40vh) above the four active columns. Desktop: horizontal
 * grid of columns. Mobile (<768px): the same groups stack vertically — a list
 * grouped by status with no page-level horizontal scroll (TASK-FE-004).
 *
 * Drag-and-drop (progressive enhancement, TASK-FE-010/011): dnd-kit classic
 * family only (core + sortable's coordinate getter). Columns are drop targets;
 * the backlog is NOT (tasks move out of it, never back). Same-column drops are
 * no-ops. Pointer drag needs 6px of movement so clicks are never eaten; the
 * keyboard flow (Space to start, arrows, Escape to cancel) uses
 * sortableKeyboardCoordinates. The drop reuses the board's onMove, so the
 * blocked-reason dialog (BR-010) and the BR-009 assignee gate apply exactly as
 * they do for the "Move to…" menu — drag is never a special path.
 */
import { useState } from 'react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import type { BoardResponse, TaskStatus, TaskSummary } from '../../api/types'
import { STATUS_LABELS } from '../ui/Badge'
import { IconChevronDown } from '../ui/icons'
import { TaskCard } from './TaskCard'
import { TaskColumn, type ActiveStatus } from './TaskColumn'
import './TaskBoard.css'

const COLUMN_ORDER: ActiveStatus[] = ['PENDING', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED']

export interface TaskBoardProps {
  board: BoardResponse
  canEditTask: (task: TaskSummary) => boolean
  isMovingTask: (taskId: string) => boolean
  onMove: (task: TaskSummary, status: TaskStatus, blockedReason?: string) => void
  onEdit: (task: TaskSummary) => void
  onRequireAssignee: (task: TaskSummary) => void
}

export function TaskBoard({
  board,
  canEditTask,
  isMovingTask,
  onMove,
  onEdit,
  onRequireAssignee,
}: TaskBoardProps) {
  const [backlogOpen, setBacklogOpen] = useState(true)

  const sensors = useSensors(
    // Distance constraint: a plain click (link, menu) never starts a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const findTask = (taskId: string): TaskSummary | undefined => {
    const inBacklog = board.backlog.find((task) => task.id === taskId)
    if (inBacklog) return inBacklog
    for (const status of COLUMN_ORDER) {
      const found = board.columns[status].find((task) => task.id === taskId)
      if (found) return found
    }
    return undefined
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over) return
    const target = String(over.id) as ActiveStatus
    const task = findTask(String(active.id))
    // Same-column drop → no-op; the backlog is not a drop target at all.
    if (!task || task.status === target) return
    // BR-009 — same gate as the "Move to…" menu: assign someone first.
    if (task.status === 'BACKLOG' && task.assignee === null) {
      onRequireAssignee(task)
      return
    }
    onMove(task, target)
  }

  const columnProps = {
    canEditTask,
    isMovingTask,
    onMove,
    onEdit,
    onRequireAssignee,
    dndEnabled: true,
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      {/* Backlog — collapsible section above the active columns. */}
      <section className="task-backlog" aria-label="Backlog">
        <button
          type="button"
          className="task-backlog__toggle"
          aria-expanded={backlogOpen}
          onClick={() => setBacklogOpen((open) => !open)}
        >
          <IconChevronDown className={`task-backlog__chevron${backlogOpen ? ' is-open' : ''}`} />
          <span>{STATUS_LABELS.BACKLOG}</span>
          <span className="task-backlog__count" aria-label={`${board.backlog.length} tasks`}>
            {board.backlog.length}
          </span>
        </button>
        {backlogOpen && (
          <div className="task-backlog__list">
            {board.backlog.length === 0 ? (
              <p className="task-backlog__empty">No backlog tasks</p>
            ) : (
              board.backlog.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  canEdit={canEditTask(task)}
                  isMoving={isMovingTask(task.id)}
                  dndEnabled
                  onMove={(status, reason) => onMove(task, status, reason)}
                  onEdit={() => onEdit(task)}
                  onRequireAssignee={() => onRequireAssignee(task)}
                />
              ))
            )}
          </div>
        )}
      </section>

      {/* Active columns — grid on desktop, stacked groups on mobile. */}
      <div className="task-board__columns">
        {COLUMN_ORDER.map((status) => (
          <TaskColumn key={status} status={status} tasks={board.columns[status]} {...columnProps} />
        ))}
      </div>
    </DndContext>
  )
}
