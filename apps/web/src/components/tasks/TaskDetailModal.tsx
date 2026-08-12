/*
 * TaskDetailModal — slide-from-right drawer that opens when a board card or
 * list row is clicked. Shows the complete task: title, description, metadata
 * grid (status with MoveTo, priority, assignee, client, due date, timestamps),
 * checklist, labels, comments, and history. Edit/archive actions for
 * authorized users.
 *
 * States: loading skeleton, 404, error, read-only banner for archived tasks.
 */
import { useState } from 'react'
import type { UseFormReturn } from 'react-hook-form'
import { ApiError } from '../../api/client'
import type { ClientRef, TaskStatus, TaskSummary, UserResponse } from '../../api/types'
import { useAuth } from '../../providers/AuthProvider'
import { useActiveClientsQuery, useActiveUsersQuery, useTaskQuery } from '../../hooks/useTaskQueries'
import {
  useArchiveTask,
  useChangeTaskStatus,
  useReconcileTask,
  useUpdateTask,
} from '../../hooks/useTaskMutations'
import { applyFieldErrors, serverErrorDetail, serverErrorTitle, type BannerError } from '../../lib/api-errors'
import { dueLabel, formatAbsoluteDate, formatRelativeDate } from '../../lib/format'
import { PriorityBadge, StatusBadge, STATUS_LABELS } from '../ui/Badge'
import { Alert } from '../ui/Alert'
import { Button } from '../ui/Button'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { Dialog } from '../ui/Dialog'
import { Drawer } from '../ui/Drawer'
import { EmptyState } from '../ui/EmptyState'
import { ErrorState } from '../ui/ErrorState'
import { Skeleton } from '../ui/Skeleton'
import { IconArchive, IconEdit } from '../ui/icons'
import { MoveToMenu } from './TaskCard'
import { TaskChecklist } from './TaskChecklist'
import { TaskComments } from './TaskComments'
import { TaskForm, type TaskFormValues } from './TaskForm'
import { TaskHistory } from './TaskHistory'
import { TaskLabels } from './TaskLabels'
import './TaskDetailModal.css'

export interface TaskDetailModalProps {
  taskId: string | null
  open: boolean
  onClose: () => void
}

export function TaskDetailModal({ taskId, open, onClose }: TaskDetailModalProps) {
  const { user } = useAuth()

  const taskQuery = useTaskQuery(taskId ?? '')
  const activeUsersQuery = useActiveUsersQuery()
  const activeClientsQuery = useActiveClientsQuery()
  const changeStatus = useChangeTaskStatus()
  const updateTask = useUpdateTask()
  const archiveTask = useArchiveTask()
  const reconcileTask = useReconcileTask()

  const [editing, setEditing] = useState(false)
  const [focusAssignee, setFocusAssignee] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [bannerError, setBannerError] = useState<BannerError | null>(null)
  const [blockMove, setBlockMove] = useState<TaskSummary | null>(null)

  const task = taskQuery.data
  const users = activeUsersQuery.data?.users ?? []
  const usersGated = activeUsersQuery.data?.gated ?? false
  const clients = activeClientsQuery.data?.data ?? []

  const isReadOnly = Boolean(task?.archivedAt)
  const canEdit = Boolean(
    task &&
      user &&
      (user.role === 'ADMIN' || task.creator.id === user.id || task.assignee?.id === user.id),
  )

  /* Reset local state when modal opens for a different task. */
  const handleClose = () => {
    setEditing(false)
    setFocusAssignee(false)
    setNotice(null)
    setBannerError(null)
    onClose()
  }

  /* ---------- Status move ---------- */

  const handleMove = (status: TaskStatus, blockedReason?: string) => {
    if (!task) return
    setBannerError(null)
    // Members can only move tasks assigned to them; admins can move any.
    if (user?.role !== 'ADMIN' && task.assignee?.id !== user?.id) {
      setNotice('You can only move tasks assigned to you.')
      return
    }
    // BR-010: moving to BLOCKED requires a reason.
    if (status === 'BLOCKED' && !blockedReason) {
      setBlockMove(task)
      return
    }
    changeStatus.mutate(
      { taskId: task.id, payload: { status, blockedReason, expectedVersion: task.version } },
      {
        onSuccess: () => setNotice(`Moved to ${STATUS_LABELS[status]}.`),
        onError: (error) => {
          if (error instanceof ApiError && error.status === 409 && error.currentState) {
            setBannerError({
              title: 'This task was changed by someone else.',
              detail: serverErrorDetail(error),
            })
            return
          }
          setBannerError({ title: serverErrorTitle(error), detail: serverErrorDetail(error) })
        },
      },
    )
  }

  /* ---------- Edit ---------- */

  const handleEditSubmit = async (
    values: TaskFormValues,
    form: UseFormReturn<TaskFormValues>,
  ) => {
    if (!task) return
    setBannerError(null)
    const assignee: UserResponse | undefined = users.find((item) => item.id === values.assigneeId)
    const client: ClientRef | undefined = clients.find((item) => item.id === values.clientId)
    try {
      await updateTask.mutateAsync({
        taskId: task.id,
        payload: {
          title: values.title,
          description: values.description || undefined,
          priority: values.priority,
          assigneeId: values.assigneeId || undefined,
          clientId: values.clientId || undefined,
          dueDate: values.dueDate || undefined,
          blockedReason: values.status === 'BLOCKED' ? values.blockedReason : undefined,
          expectedVersion: task.version,
        },
        optimisticRefs: {
          assignee:
            values.assigneeId === undefined || values.assigneeId === ''
              ? null
              : (assignee ?? task.assignee),
          client:
            values.clientId === undefined || values.clientId === ''
              ? null
              : (client ?? task.client),
        },
      })
      setEditing(false)
      setNotice('Task updated.')
    } catch (caught) {
      if (!applyFieldErrors(form, caught)) {
        setBannerError({ title: serverErrorTitle(caught), detail: serverErrorDetail(caught) })
      }
    }
  }

  /* ---------- Archive ---------- */

  const handleArchive = () => {
    if (!task) return
    setBannerError(null)
    archiveTask.mutate(
      { taskId: task.id, expectedVersion: task.version },
      {
        onSuccess: () => {
          setArchiveOpen(false)
          handleClose()
        },
        onError: (error) => {
          setArchiveOpen(false)
          setBannerError({ title: serverErrorTitle(error), detail: serverErrorDetail(error) })
        },
      },
    )
  }

  /* ---------- Derived values ---------- */

  const notFound =
    taskQuery.isError && taskQuery.error instanceof ApiError && taskQuery.error.status === 404
  const due = dueLabel(task?.dueDate ?? null)

  /* ---------- Render ---------- */

  return (
    <Drawer open={open} onClose={handleClose} title={task ? task.title : 'Task details'} width={560}>
      {taskQuery.isPending && (
        <div className="skeleton-row" role="status" aria-label="Loading task">
          <Skeleton />
          <Skeleton />
          <Skeleton />
        </div>
      )}

      {notFound && (
        <EmptyState
          title="Task not found, or you don't have access to it."
          description="It may have been archived, or the link may be wrong."
        />
      )}

      {taskQuery.isError && !notFound && (
        <ErrorState
          title="Could not load this task"
          message={taskQuery.error instanceof Error ? taskQuery.error.message : undefined}
          onRetry={() => void taskQuery.refetch()}
        />
      )}

      {task && (
        <div className="tdm">
          {/* Banners */}
          {isReadOnly && (
            <Alert variant="info" role="status" title="This task is archived and read-only." />
          )}
          {notice && <Alert variant="success" role="status" title={notice} />}
          {!editing && bannerError && (
            <Alert variant="error" title={bannerError.title}>
              {bannerError.detail}
              <span className="tdm__alert-actions">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    reconcileTask(task.id)
                    setBannerError(null)
                  }}
                >
                  Show latest
                </Button>
              </span>
            </Alert>
          )}

          {editing ? (
            <TaskForm
              key={task.id}
              mode="edit"
              task={task}
              users={users}
              usersGated={usersGated}
              clients={clients}
              isSubmitting={updateTask.isPending}
              serverError={bannerError}
              focusAssignee={focusAssignee}
              onSubmit={handleEditSubmit}
            />
          ) : (
            <>
              {/* Header */}
              <header className="tdm__header">
                <div className="tdm__badges">
                  <PriorityBadge priority={task.priority} />
                  <StatusBadge status={task.status} />
                </div>
                <div className="tdm__header-actions">
                  {!isReadOnly && (
                    <MoveToMenu
                      task={task}
                      disabled={changeStatus.isPending}
                      onMove={handleMove}
                      onRequireAssignee={() => {
                        setFocusAssignee(true)
                        setEditing(true)
                      }}
                    />
                  )}
                  {canEdit && !isReadOnly && (
                    <Button
                      variant="secondary"
                      size="sm"
                      leftIcon={<IconEdit />}
                      onClick={() => setEditing(true)}
                      aria-label="Edit task"
                    />
                  )}
                  {user?.role === 'ADMIN' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      leftIcon={<IconArchive />}
                      onClick={() => setArchiveOpen(true)}
                    >
                      Archive
                    </Button>
                  )}
                </div>
              </header>

              {/* Description */}
              {task.description && (
                <p className="tdm__description">{task.description}</p>
              )}

              {/* Metadata grid */}
              <div className="tdm__meta-grid">
                <div className="tdm__meta-item">
                  <span className="tdm__meta-label">Assignee</span>
                  <span className="tdm__meta-value">
                    {task.assignee?.name ?? '—'}
                  </span>
                </div>
                <div className="tdm__meta-item">
                  <span className="tdm__meta-label">Client</span>
                  <span className="tdm__meta-value">
                    {task.client?.companyName ?? '—'}
                  </span>
                </div>
                <div className="tdm__meta-item">
                  <span className="tdm__meta-label">Due date</span>
                  <span className={`tdm__meta-value${due.kind === 'overdue' ? ' tdm__meta-value--overdue' : ''}`}>
                    {due.kind === 'none' ? '—' : due.label}
                  </span>
                </div>
                {task.blockedReason && (
                  <div className="tdm__meta-item tdm__meta-item--full">
                    <span className="tdm__meta-label">Blocked reason</span>
                    <span className="tdm__meta-value">{task.blockedReason}</span>
                  </div>
                )}
                <div className="tdm__meta-item">
                  <span className="tdm__meta-label">Created by</span>
                  <span className="tdm__meta-value">
                    {task.creator.name} · {formatAbsoluteDate(task.createdAt)}
                  </span>
                </div>
                <div className="tdm__meta-item">
                  <span className="tdm__meta-label">Last updated</span>
                  <span className="tdm__meta-value">{formatRelativeDate(task.updatedAt)}</span>
                </div>
              </div>

              {/* Sections */}
              <div className="tdm__sections">
                <details className="tdm__section" open>
                  <summary className="tdm__section-title">Checklist</summary>
                  <TaskChecklist taskId={task.id} canEdit={canEdit && !isReadOnly} />
                </details>

                <details className="tdm__section" open>
                  <summary className="tdm__section-title">Labels</summary>
                  <TaskLabels taskId={task.id} canEdit={canEdit && !isReadOnly} labels={task.labels} />
                </details>

                <details className="tdm__section" open>
                  <summary className="tdm__section-title">Comments</summary>
                  <TaskComments taskId={task.id} canEdit={canEdit && !isReadOnly} />
                </details>

                <details className="tdm__section">
                  <summary className="tdm__section-title">History</summary>
                  <TaskHistory taskId={task.id} />
                </details>
              </div>
            </>
          )}
        </div>
      )}

      {/* Archive confirmation */}
      <ConfirmDialog
        open={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        title={task ? `Archive "${task.title}"?` : 'Archive task?'}
        description="Archived tasks are read-only and only visible to administrators."
        confirmLabel="Archive"
        danger
        isLoading={archiveTask.isPending}
        onConfirm={handleArchive}
      />

      {/* Blocked reason (BR-010) — moving into BLOCKED needs a reason. */}
      <BlockedReasonDialog
        task={blockMove}
        isSubmitting={changeStatus.isPending}
        onClose={() => setBlockMove(null)}
        onConfirm={(reason) => {
          if (blockMove) {
            setBlockMove(null)
            handleMove('BLOCKED', reason)
          }
        }}
      />
    </Drawer>
  )
}

/* ---------- Blocked reason dialog (BR-010) ---------- */

function BlockedReasonDialog({
  task,
  isSubmitting,
  onClose,
  onConfirm,
}: {
  task: TaskSummary | null
  isSubmitting: boolean
  onClose: () => void
  onConfirm: (reason: string) => void
}) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  return (
    <Dialog open={task !== null} onClose={onClose} title={task ? `Block ${task.title}` : 'Block task'}>
      <form
        className="form-stack"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          const trimmed = reason.trim()
          if (!trimmed) {
            setError('A blocked reason is required.')
            return
          }
          onConfirm(trimmed)
        }}
      >
        <label htmlFor="modal-blocked-reason-input" className="field__label">
          Blocked reason <span className="field__required">*</span>
        </label>
        <textarea
          id="modal-blocked-reason-input"
          className={`input input--textarea${error ? ' input--error' : ''}`}
          rows={3}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'modal-blocked-reason-error' : undefined}
          value={reason}
          onChange={(event) => {
            setReason(event.target.value)
            if (error) setError(null)
          }}
        />
        {error && (
          <p id="modal-blocked-reason-error" className="field__error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog__footer">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSubmitting}>
            Block task
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
