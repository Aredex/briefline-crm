/*
 * TaskLabels (PC-04, LAB-002) — colored badges for the labels assigned to the
 * task, plus an "Add label" picker fed by the team-wide catalogue (LAB-001).
 *
 * The assigned labels come from the task payload (TaskSummary.labels — the
 * parent owns that query); this component mutates via POST/DELETE
 * /tasks/:taskId/labels/:labelId and invalidates the detail + board keys so
 * the badges re-render from fresh data.
 *
 * Badge text color is derived from the label's background by perceived
 * luminance, so dark and light catalogue colors both stay legible (the
 * backend seeds #RRGGBB colors — LAB-001).
 */
import { useEffect, useRef, useState } from 'react'
import type { LabelResponse, TaskLabel } from '../../api/types'
import { useLabelsQuery } from '../../hooks/useTaskQueries'
import { useAssignLabel, useRemoveLabel } from '../../hooks/useTaskMutations'
import { Button } from '../ui/Button'
import { ErrorState } from '../ui/ErrorState'
import { IconPlus, IconX } from '../ui/icons'
import { Skeleton } from '../ui/Skeleton'
import './TaskLabels.css'

export interface TaskLabelsProps {
  taskId: string
  /** BR-013/014 — admin, creator, or assignee may manage labels. */
  canEdit: boolean
  /** Labels currently assigned to the task (TaskSummary.labels). */
  labels: TaskLabel[]
}

/** Readable text color for a #RRGGBB background (perceived luminance). */
export function textOnColor(color: string): string {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim())
  const hex = match?.[1] ?? ''
  if (!hex) return '#ffffff'
  const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.55 ? '#1f2937' : '#ffffff'
}

export function TaskLabels({ taskId, canEdit, labels }: TaskLabelsProps) {
  const catalogueQuery = useLabelsQuery()
  const assignLabel = useAssignLabel()
  const removeLabel = useRemoveLabel()

  const [open, setOpen] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  // Esc closes and restores focus; outside click closes (same contract as MoveToMenu).
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
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

  const catalogue = catalogueQuery.data ?? []
  const available = catalogue.filter(
    (label) => !labels.some((assigned) => assigned.id === label.id),
  )

  const handleAssign = (label: LabelResponse) => {
    setBusyId(label.id)
    assignLabel.mutate(
      { taskId, labelId: label.id },
      {
        onSettled: () => {
          setBusyId(null)
          setOpen(false)
        },
      },
    )
  }

  const handleRemove = (label: TaskLabel) => {
    setBusyId(label.id)
    removeLabel.mutate(
      { taskId, labelId: label.id },
      { onSettled: () => setBusyId(null) },
    )
  }

  if (catalogueQuery.isPending) {
    return (
      <div className="task-labels__loading" role="status" aria-label="Loading labels">
        <Skeleton />
        <Skeleton />
      </div>
    )
  }

  if (catalogueQuery.isError) {
    return (
      <ErrorState
        title="Could not load labels"
        message={catalogueQuery.error instanceof Error ? catalogueQuery.error.message : undefined}
        onRetry={() => void catalogueQuery.refetch()}
      />
    )
  }

  return (
    <div className="task-labels" ref={wrapRef}>
      <div className="task-labels__badges">
        {labels.length === 0 ? (
          <span className="task-labels__empty">No labels</span>
        ) : (
          labels.map((label) => (
            <span
              key={label.id}
              className="task-labels__badge"
              style={{ backgroundColor: label.color, color: textOnColor(label.color) }}
            >
              {label.name}
              {canEdit && (
                <button
                  type="button"
                  className="task-labels__remove"
                  aria-label={`Remove ${label.name} label`}
                  disabled={busyId === label.id}
                  onClick={() => handleRemove(label)}
                >
                  <IconX width={12} height={12} />
                </button>
              )}
            </span>
          ))
        )}
      </div>

      {canEdit && (
        <div className="task-labels__picker">
          <Button
            ref={triggerRef}
            variant="ghost"
            size="sm"
            className="task-labels__trigger"
            aria-haspopup="menu"
            aria-expanded={open}
            disabled={assignLabel.isPending || removeLabel.isPending}
            onClick={() => setOpen((value) => !value)}
          >
            <IconPlus /> Add label
          </Button>
          {open && (
            <div className="task-labels__dropdown" role="menu" aria-label="Available labels">
              {available.length === 0 ? (
                <p className="task-labels__hint" role="presentation">
                  All labels are assigned
                </p>
              ) : (
                available.map((label) => (
                  <button
                    key={label.id}
                    type="button"
                    role="menuitem"
                    className="task-labels__option"
                    disabled={busyId === label.id}
                    onClick={() => handleAssign(label)}
                  >
                    <span
                      className="task-labels__dot"
                      aria-hidden="true"
                      style={{ backgroundColor: label.color }}
                    />
                    {label.name}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
