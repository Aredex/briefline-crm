/*
 * TaskCard (TASK-FE-002) — priority + status badges (text AND color, AC-08),
 * client / assignee / due date (overdue: red + clock icon + the word
 * "Overdue"), title deep-link to /tasks/:taskId, permanent "Move to…" menu
 * (the contractual keyboard-first alternative to drag-and-drop, FR-TASK-005),
 * and an Edit action gated by BR-013/014 (admin, creator, or assignee).
 *
 * "Move to…" (TASK-FE-008): current status shown disabled ("Current: …");
 * Enter/Space opens, arrows navigate, Esc closes and focus returns. Moving a
 * backlog task without an assignee cannot be a plain transition (BR-009): the
 * destination opens the edit panel focused on Assignee instead.
 *
 * The drag handle (IconGripVertical) is rendered always so the layout is
 * stable; dnd-kit listeners are attached only when the parent enables DnD
 * (progressive enhancement — TASK-FE-010/011).
 */
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { Link } from 'react-router'
import type { TaskStatus, TaskSummary } from '../../api/types'
import { PriorityBadge, StatusBadge, STATUS_LABELS } from '../ui/Badge'
import { Button } from '../ui/Button'
import { IconClock, IconEdit, IconGripVertical, IconUser } from '../ui/icons'
import { dueLabel } from '../../lib/format'
import './TaskCard.css'

const ACTIVE_STATUSES: Exclude<TaskStatus, 'BACKLOG'>[] = [
  'PENDING',
  'IN_PROGRESS',
  'BLOCKED',
  'COMPLETED',
]

export interface TaskCardProps {
  task: TaskSummary
  /** BR-013/014 — admin, creator, or assignee may edit. */
  canEdit: boolean
  /** A status mutation for this task is pending (disables the menu). */
  isMoving: boolean
  onMove: (status: TaskStatus, blockedReason?: string) => void
  onEdit: () => void
  /** Backlog task without assignee — open edit focused on Assignee (BR-009). */
  onRequireAssignee: () => void
  /**
   * Progressive enhancement (TASK-FE-010/011): when the parent board mounts a
   * DndContext, the drag handle becomes a real draggable. Off by default — the
   * "Move to…" menu remains the contractually required way to change status.
   */
  dndEnabled?: boolean
}

function dueMeta(task: TaskSummary) {
  const label = dueLabel(task.dueDate)
  if (label.kind === 'none') return null
  if (label.kind === 'overdue') {
    return (
      <span className="task-card__due task-card__due--overdue">
        <IconClock /> <span>Overdue</span>
      </span>
    )
  }
  if (label.kind === 'today') {
    return (
      <span className="task-card__due">
        <IconClock /> <span>Due today</span>
      </span>
    )
  }
  return (
    <span className="task-card__due">
      <IconClock /> <span>{label.label}</span>
    </span>
  )
}

/* ---------- "Move to…" menu ---------- */

export interface MoveToMenuProps {
  task: TaskSummary
  disabled: boolean
  onMove: (status: TaskStatus, blockedReason?: string) => void
  /** Backlog task without assignee — destinations need an assignee first (BR-009). */
  onRequireAssignee: () => void
}

export function MoveToMenu({ task, disabled, onMove, onRequireAssignee }: MoveToMenuProps) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  const requiresAssignee = task.status === 'BACKLOG' && task.assignee === null

  // Esc closes and restores focus; outside click closes.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!open) return
    const buttons = ACTIVE_STATUSES.map((status) => itemRefs.current[status]).filter(
      Boolean,
    ) as HTMLButtonElement[]
    if (buttons.length === 0) return
    const activeIndex = buttons.indexOf(document.activeElement as HTMLButtonElement)

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      buttons[(activeIndex + 1) % buttons.length]?.focus()
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      buttons[(activeIndex - 1 + buttons.length) % buttons.length]?.focus()
    }
  }

  const select = (status: TaskStatus) => {
    setOpen(false)
    triggerRef.current?.focus()
    if (requiresAssignee && status !== 'BACKLOG') {
      onRequireAssignee()
      return
    }
    onMove(status)
  }

  return (
    <div className="move-menu" ref={menuRef}>
      <Button
        ref={triggerRef}
        variant="secondary"
        size="sm"
        className="move-menu__trigger"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        Move to…
      </Button>
      {open && (
        <div
          className="move-menu__dropdown"
          role="menu"
          aria-label={`Move ${task.title} to`}
          onKeyDown={handleMenuKeyDown}
        >
          <div className="move-menu__current" role="presentation">
            Current: {STATUS_LABELS[task.status]}
          </div>
          {requiresAssignee && (
            <p className="move-menu__hint" role="presentation">
              Assign someone first
            </p>
          )}
          {ACTIVE_STATUSES.map((status) => (
            <button
              key={status}
              ref={(node) => {
                itemRefs.current[status] = node
              }}
              type="button"
              role="menuitem"
              className="move-menu__item"
              disabled={status === task.status}
              onClick={() => select(status)}
            >
              <span className="move-menu__dot move-menu__dot--active" aria-hidden="true" />
              {status === task.status ? `Current: ${STATUS_LABELS[status]}` : STATUS_LABELS[status]}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ---------- Card ---------- */

export function TaskCard({
  task,
  canEdit,
  isMoving,
  onMove,
  onEdit,
  onRequireAssignee,
  dndEnabled = false,
}: TaskCardProps) {
  // Draggable wiring is inert unless the parent enables DnD (progressive
  // enhancement). Listeners land ONLY on the handle — never on the card —
  // so links, menus and buttons inside keep working.
  const { attributes, listeners, setNodeRef, isDragging, transform } = useDraggable({
    id: task.id,
    disabled: !dndEnabled,
  })
  const dragInstructionId = `drag-instruction-${task.id}`
  const dragStyle = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined

  return (
    <article
      ref={setNodeRef}
      style={dragStyle}
      className={`task-card${isDragging ? ' task-card--dragging' : ''}`}
      aria-label={task.title}
    >
      {/* Drag handle — focusable; keyboard: Space starts the move (TASK-FE-011),
          Escape cancels (dnd-kit KeyboardSensor). */}
      <button
        type="button"
        className="task-card__handle"
        {...attributes}
        {...listeners}
        aria-label={`Move ${task.title}`}
        aria-describedby={dndEnabled && !isDragging ? dragInstructionId : undefined}
      >
        <IconGripVertical />
      </button>
      <span id={dragInstructionId} className="sr-only">
        Press Space to start moving
      </span>
      <div className="task-card__body">
        <div className="task-card__badges">
          <PriorityBadge priority={task.priority} />
          <StatusBadge status={task.status} />
        </div>
        <h3 className="task-card__title">
          <Link to={`/tasks/${task.id}`}>{task.title}</Link>
        </h3>
        <div className="task-card__meta">
          {task.client && <span className="task-card__client">{task.client.companyName}</span>}
          {task.assignee && (
            <span className="task-card__assignee">
              <IconUser /> <span>{task.assignee.name}</span>
            </span>
          )}
          {dueMeta(task)}
        </div>
      </div>
      <footer className="task-card__footer">
        <MoveToMenu task={task} disabled={isMoving} onMove={onMove} onRequireAssignee={onRequireAssignee} />
        {canEdit && (
          <Button variant="ghost" size="sm" onClick={onEdit} aria-label={`Edit ${task.title}`}>
            <IconEdit /> Edit
          </Button>
        )}
      </footer>
    </article>
  )
}
