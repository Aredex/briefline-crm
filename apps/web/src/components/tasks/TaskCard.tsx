/*
 * TaskCard (TASK-FE-002) — simplified board card. Full-width title, footer
 * with priority badge and assignee at the bottom. The whole card is the drag
 * surface (dnd-kit, progressive enhancement). Clicking opens the task detail
 * modal; the PointerSensor distance constraint (8px) keeps drag and click
 * independent.
 *
 * Status badges and the "Move to…" menu are intentionally absent — the column
 * already communicates status, and status changes happen inside the detail
 * modal or via drag-and-drop.
 */
import { useDraggable } from '@dnd-kit/core'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { TaskStatus, TaskSummary } from '../../api/types'
import { PriorityBadge, STATUS_LABELS } from '../ui/Badge'
import { Button } from '../ui/Button'
import { IconUser } from '../ui/icons'
import './TaskCard.css'

const ACTIVE_STATUSES: Exclude<TaskStatus, 'BACKLOG'>[] = [
  'PENDING',
  'IN_PROGRESS',
  'BLOCKED',
  'COMPLETED',
]

export interface TaskCardProps {
  task: TaskSummary
  /** Progressive enhancement: when the parent mounts a DndContext. */
  dndEnabled?: boolean
  /** Open the full detail modal for this task. */
  onClick?: () => void
}

export function TaskCard({ task, dndEnabled = false, onClick }: TaskCardProps) {
  const { attributes, listeners, setNodeRef, isDragging, transform } = useDraggable({
    id: task.id,
    disabled: !dndEnabled,
  })
  const dragStyle = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined

  const handleClick = () => {
    // Only fire when dnd-kit hasn't started a drag (distance < 8px).
    if (!isDragging) onClick?.()
  }

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onClick?.()
    }
  }

  return (
    <article
      ref={setNodeRef}
      style={dragStyle}
      className={`task-card${isDragging ? ' task-card--dragging' : ''}`}
      aria-label={task.title}
      {...attributes}
      {...listeners}
      aria-roledescription="draggable"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      <h3 className="task-card__title">{task.title}</h3>
      <div className="task-card__footer">
        <PriorityBadge priority={task.priority} />
        {task.assignee && (
          <span className="task-card__assignee">
            <IconUser /> <span>{task.assignee.name}</span>
          </span>
        )}
      </div>
    </article>
  )
}

/* ---------- "Move to…" menu — shared with backlog rows and detail modal ---------- */

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
