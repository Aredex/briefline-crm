/*
 * TaskBoard (TASK-FE-001/004/010/011) — the four active columns (grid on
 * desktop, stacked groups below 768px — TASK-FE-004) with the backlog below
 * them as an always-visible compact table: title, status, priority, assignee,
 * client, due date, and actions — every column aligned so values sit at the
 * same horizontal position across all rows.
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
import { useState } from 'react'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { Link } from 'react-router'
import type { BoardResponse, TaskStatus, TaskSummary } from '../../api/types'
import { PriorityBadge, StatusBadge, STATUS_LABELS } from '../ui/Badge'
import { Button } from '../ui/Button'
import { IconEdit, IconUser } from '../ui/icons'
import { MoveToMenu } from './TaskCard'
import { TaskColumn, type ActiveStatus } from './TaskColumn'
import { dueLabel } from '../../lib/format'
import './TaskBoard.css'

const COLUMN_ORDER: ActiveStatus[] = ['PENDING', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED']

export interface TaskBoardProps {
  board: BoardResponse
  canEditTask: (task: TaskSummary) => boolean
  isMovingTask: (taskId: string) => boolean
  onMove: (task: TaskSummary, status: TaskStatus, blockedReason?: string) => void
  onEdit: (task: TaskSummary) => void
  onRequireAssignee: (task: TaskSummary) => void
  /** Called when a board card is clicked — opens the detail modal. */
  onTaskClick?: (task: TaskSummary) => void
}

/* Compact backlog row — all columns aligned: title, status, priority,
   assignee, client, due date, and actions. Draggable out of the backlog
   (never a drop target). */
interface BacklogRowProps {
  task: TaskSummary
  canEdit: boolean
  isMoving: boolean
  dndEnabled: boolean
  onMove: (status: TaskStatus, blockedReason?: string) => void
  onEdit: () => void
  onRequireAssignee: () => void
}

function BacklogRow({ task, canEdit, isMoving, dndEnabled, onMove, onEdit, onRequireAssignee }: BacklogRowProps) {
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: task.id,
    disabled: !dndEnabled,
  })

  const due = dueLabel(task.dueDate)

  return (
    <div
      className="task-backlog__row"
      {...(dndEnabled ? { ...attributes, ...listeners } : {})}
      ref={dndEnabled ? setNodeRef : undefined}
    >
      <span className="task-backlog__cell task-backlog__title">
        <Link to={`/tasks/${task.id}`}>{task.title}</Link>
      </span>
      <span className="task-backlog__cell">
        <StatusBadge status={task.status} />
      </span>
      <span className="task-backlog__cell">
        <PriorityBadge priority={task.priority} />
      </span>
      <span className="task-backlog__cell task-backlog__assignee">
        {task.assignee ? (
          <span className="task-backlog__assignee-name">{task.assignee.name}</span>
        ) : (
          <span className="task-backlog__empty-value">—</span>
        )}
      </span>
      <span className="task-backlog__cell task-backlog__client">
        {task.client ? (
          <span>{task.client.companyName}</span>
        ) : (
          <span className="task-backlog__empty-value">—</span>
        )}
      </span>
      <span className={`task-backlog__cell task-backlog__due${due.kind === 'overdue' ? ' task-backlog__due--overdue' : ''}`}>
        {due.kind !== 'none' ? due.label : <span className="task-backlog__empty-value">—</span>}
      </span>
      <span className="task-backlog__cell task-backlog__actions">
        <MoveToMenu task={task} disabled={isMoving} onMove={onMove} onRequireAssignee={onRequireAssignee} />
        {canEdit && (
          <Button variant="ghost" size="sm" onClick={onEdit} aria-label={`Edit ${task.title}`}>
            <IconEdit />
          </Button>
        )}
      </span>
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
  onTaskClick,
}: TaskBoardProps) {
  const [activeDrag, setActiveDrag] = useState<TaskSummary | null>(null)

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

  const handleDragStart = (event: DragStartEvent) => {
    const task = findTask(String(event.active.id))
    setActiveDrag(task ?? null)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDrag(null)
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
    onTaskClick,
    dndEnabled: true,
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
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
          <div className="task-backlog__header" aria-hidden="true">
            <span>Title</span>
            <span>Status</span>
            <span>Priority</span>
            <span>Assignee</span>
            <span>Client</span>
            <span>Due</span>
            <span>Actions</span>
          </div>
          {board.backlog.length === 0 ? (
            <p className="task-backlog__empty">No backlog tasks</p>
          ) : (
            board.backlog.map((task) => (
              <BacklogRow
                key={task.id}
                task={task}
                canEdit={canEditTask(task)}
                isMoving={isMovingTask(task.id)}
                dndEnabled
                onMove={(status, blockedReason) => onMove(task, status, blockedReason)}
                onEdit={() => onEdit(task)}
                onRequireAssignee={() => onRequireAssignee(task)}
              />
            ))
          )}
        </div>
      </section>

      {/* DragOverlay — floating copy of the card that stays visible during drag */}
      <DragOverlay dropAnimation={null}>
        {activeDrag ? (
          <div className="task-card task-card--overlay" style={{ cursor: 'grabbing' }}>
            <h3 className="task-card__title">{activeDrag.title}</h3>
            <div className="task-card__footer">
              <PriorityBadge priority={activeDrag.priority} />
              {activeDrag.assignee && (
                <span className="task-card__assignee">
                  <IconUser /> <span>{activeDrag.assignee.name}</span>
                </span>
              )}
            </div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
