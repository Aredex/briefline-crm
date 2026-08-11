/*
 * TaskDetail (TASK-FE-006/007/009) — routed detail panel at /tasks/:taskId.
 * The board renders behind it; the non-modal drawer sits on top (AP-14 — never
 * aria-modal). Desktop: side panel (min(50vw, 560px)) with scrim; mobile:
 * fullscreen with "← Back to tasks" (wireframe §2.4). Deep links work
 * directly; focus moves into the panel on open and returns on close.
 *
 * States: loading skeleton, 404 ("Task not found, or you don't have access to
 * it."), error, read-only banner for archived tasks, 409 STALE_VERSION banner
 * with "Show latest". Edit mode swaps the body for the shared TaskForm.
 */
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import type { UseFormReturn } from 'react-hook-form'
import { ApiError } from '../api/client'
import type { TaskStatus } from '../api/types'
import { useAuth } from '../providers/AuthProvider'
import { useActiveClientsQuery, useActiveUsersQuery, useTaskQuery } from '../hooks/useTaskQueries'
import {
  useArchiveTask,
  useChangeTaskStatus,
  useReconcileTask,
  useUpdateTask,
} from '../hooks/useTaskMutations'
import { applyFieldErrors, serverErrorDetail, serverErrorTitle, type BannerError } from '../lib/api-errors'
import { dueLabel, formatAbsoluteDate, formatRelativeDate } from '../lib/format'
import { STATUS_LABELS, PriorityBadge, StatusBadge } from '../components/ui/Badge'
import { Alert } from '../components/ui/Alert'
import { Button } from '../components/ui/Button'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { Drawer } from '../components/ui/Drawer'
import { EmptyState } from '../components/ui/EmptyState'
import { ErrorState } from '../components/ui/ErrorState'
import { Skeleton } from '../components/ui/Skeleton'
import { IconArrowLeft, IconArchive } from '../components/ui/icons'
import { MoveToMenu } from '../components/tasks/TaskCard'
import { TaskForm, type TaskFormValues } from '../components/tasks/TaskForm'
import { TaskHistory } from '../components/tasks/TaskHistory'
import { Board } from './Board'

export function TaskDetail() {
  const { taskId = '' } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  const taskQuery = useTaskQuery(taskId)
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

  const close = () => navigate('/tasks')

  /* ---------- Status move (reuses the optimistic mutation) ---------- */

  const handleMove = (status: TaskStatus, blockedReason?: string) => {
    if (!task) return
    setBannerError(null)
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
    const assignee = users.find((item) => item.id === values.assigneeId)
    const client = clients.find((item) => item.id === values.clientId)
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

  /* ---------- Archive (admin, confirmed) ---------- */

  const handleArchive = () => {
    if (!task) return
    setBannerError(null)
    archiveTask.mutate(
      { taskId: task.id, expectedVersion: task.version },
      {
        onSuccess: () => {
          setArchiveOpen(false)
          navigate('/tasks')
        },
        onError: (error) => {
          setArchiveOpen(false)
          setBannerError({ title: serverErrorTitle(error), detail: serverErrorDetail(error) })
        },
      },
    )
  }

  /* ---------- Render ---------- */

  const notFound =
    taskQuery.isError && taskQuery.error instanceof ApiError && taskQuery.error.status === 404
  const due = dueLabel(task?.dueDate ?? null)

  return (
    <>
      {/* The board renders behind the panel (deep-link friendly). */}
      <Board />

      <Drawer open onClose={close} title="Task details" width={560}>
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
            action={
              <Button onClick={close}>
                <IconArrowLeft /> Back to tasks
              </Button>
            }
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
          <div className="task-detail">
            {/* Mobile: explicit back affordance (wireframe §2.4). */}
            <button type="button" className="task-detail__back" onClick={close}>
              <IconArrowLeft /> Back to tasks
            </button>

            {isReadOnly && (
              <Alert variant="info" role="status" title="This task is archived and read-only." />
            )}
            {notice && <Alert variant="success" role="status" title={notice} />}
            {!editing && bannerError && (
              <Alert variant="error" title={bannerError.title}>
                {bannerError.detail}
                <span className="alert--page__actions">
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
                <header className="detail-header">
                  <h3 className="detail-header__title">{task.title}</h3>
                  <div className="detail-header__badges">
                    <PriorityBadge priority={task.priority} />
                    <StatusBadge status={task.status} />
                  </div>
                </header>

                {task.description && (
                  <p className="task-detail__description">{task.description}</p>
                )}

                <ul className="detail-list">
                  <li>
                    <span className="detail-list__label">Assignee</span>
                    <span className="detail-list__value">{task.assignee?.name ?? 'Unassigned'}</span>
                  </li>
                  <li>
                    <span className="detail-list__label">Client</span>
                    <span className="detail-list__value">{task.client?.companyName ?? 'None'}</span>
                  </li>
                  <li>
                    <span className="detail-list__label">Due date</span>
                    <span
                      className={
                        due.kind === 'none'
                          ? 'detail-list__value'
                          : `detail-list__value task-detail__due--${due.kind}`
                      }
                    >
                      {due.kind === 'none' ? 'No due date' : due.label}
                    </span>
                  </li>
                  {task.blockedReason && (
                    <li>
                      <span className="detail-list__label">Blocked reason</span>
                      <span className="detail-list__value">{task.blockedReason}</span>
                    </li>
                  )}
                  <li>
                    <span className="detail-list__label">Created by</span>
                    <span className="detail-list__value">
                      {task.creator.name} · {formatAbsoluteDate(task.createdAt)}
                    </span>
                  </li>
                  <li>
                    <span className="detail-list__label">Last updated</span>
                    <span className="detail-list__value">{formatRelativeDate(task.updatedAt)}</span>
                  </li>
                </ul>

                {!isReadOnly && (
                  <div className="task-detail__actions">
                    <MoveToMenu
                      task={task}
                      disabled={changeStatus.isPending}
                      onMove={handleMove}
                      onRequireAssignee={() => {
                        setFocusAssignee(true)
                        setEditing(true)
                        setNotice('Assign someone to this task before moving it out of the backlog.')
                      }}
                    />
                    {canEdit && (
                      <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
                        Edit
                      </Button>
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
                )}

                <section className="task-detail__section" aria-label="History">
                  <h4 className="task-detail__section-title">History</h4>
                  <TaskHistory taskId={task.id} />
                </section>
              </>
            )}
          </div>
        )}
      </Drawer>

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
    </>
  )
}
