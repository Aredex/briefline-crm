/*
 * TaskBoard (TASK-FE-001/004/010/011) — the four active columns (grid on
 * desktop, stacked groups below 768px — TASK-FE-004) with the backlog below
 * them as an always-visible compact table: title, priority, assignee.
 *
 * Drag-and-drop (progressive enhancement, TASK-FE-010/011): dnd-kit classic
 * family only (core + sortable's coordinate getter). Columns are drop targets;
 * the backlog is NOT (tasks move out of it, never back). Same-column drops are
 * no-ops. Pointer drag needs 8px of movement so clicks are never eaten; the
 * keyboard flow (Space to start, arrows, Escape to cancel) uses
 * sortableKeyboardCoordinates. The drop reuses the board's onMove, so the
 * blocked-reason dialog (BR-010) and the BR-009 assignee gate apply exactly as
 * they do for the "Move to…" menu — drag is never a special path.
 */
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { Link } from 'react-router'
import type { BoardResponse, TaskStatus, TaskSummary } from '../../api/types'
import { PriorityBadge, STATUS_LABELS } from '../ui/Badge'
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

/* Compact backlog row — draggable out of the backlog (never a drop target). */
function BacklogRow({ task, dndEnabled }: { task: TaskSummary; dndEnabled: boolean }) {
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: task.id,
    disabled: !dndEnabled,
  })
  return (
    <div
      className="task-backlog__row"
      {...(dndEnabled ? { ...attributes, ...listeners } : {})}
      ref={dndEnabled ? setNodeRef : undefined}
    >
      <span className="task-backlog__title">
        <Link to={`/tasks/${task.id}`}>{task.title}</Link>
      </span>
      <PriorityBadge priority={task.priority} />
      {task.assignee && <span className="task-backlog__assignee">{task.assignee.name}</span>}
    </div>
  )
}

export function TaskBoard({
  board,
  canEditTask,
  isMovingTask,
  onMove,
  onEdit,
  onRequireAssignee,
}: TaskBoardProps) {
  const sensors = useSensors(
    // Distance constraint: a plain click (link, menu) never starts a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
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
      {/* Active columns — grid on desktop, stacked groups on mobile. */}
      <div className="task-board__columns">
        {COLUMN_ORDER.map((status) => (
          <TaskColumn key={status} status={status} tasks={board.columns[status]} {...columnProps} />
        ))}
      </div>

      {/* Backlog — always visible, compact table below the columns. */}
      <section className="task-backlog" aria-label="Backlog">
        <h2 className="task-backlog__heading">
          {STATUS_LABELS.BACKLOG}{' '}
          <span className="task-backlog__count" aria-label={`${board.backlog.length} tasks`}>
            {board.backlog.length}
          </span>
        </h2>
        <div className="task-backlog__table">
          {board.backlog.length === 0 ? (
            <p className="task-backlog__empty">No backlog tasks</p>
          ) : (
            board.backlog.map((task) => <BacklogRow key={task.id} task={task} dndEnabled />)
          )}
        </div>
      </section>
    </DndContext>
  )
}
