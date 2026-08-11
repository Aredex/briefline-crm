/*
 * Board (PH-09) — the task kanban. Owns the URL-driven filters (TASK-FE-003),
 * the board query, the "Move to…" flow (TASK-FE-008) — including the blocked-
 * reason dialog (BR-010) and the BR-009 assignee gate — the create/edit
 * dialogs, and the aria-live announcements. Sort comes from the server; the
 * client never reorders (DEC-035).
 */
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import type { UseFormReturn } from 'react-hook-form'
import { ApiError } from '../api/client'
import type { ClientRef, TaskResponse, TaskStatus, TaskSummary, UserResponse } from '../api/types'
import { useAuth } from '../providers/AuthProvider'
import {
  boardFiltersFromSearchParams,
  boardFiltersToSearchParams,
  EMPTY_BOARD_FILTERS,
} from '../hooks/useBoard'
import {
  useActiveClientsQuery,
  useActiveUsersQuery,
  useBoardQuery,
  useTaskQuery,
} from '../hooks/useTaskQueries'
import {
  useChangeTaskStatus,
  useCreateTask,
  useReconcileTask,
  useUpdateTask,
} from '../hooks/useTaskMutations'
import { applyFieldErrors, serverErrorDetail, serverErrorTitle, type BannerError } from '../lib/api-errors'
import { STATUS_LABELS } from '../components/ui/Badge'
import { Alert } from '../components/ui/Alert'
import { Button } from '../components/ui/Button'
import { Dialog } from '../components/ui/Dialog'
import { Drawer } from '../components/ui/Drawer'
import { EmptyState } from '../components/ui/EmptyState'
import { ErrorState } from '../components/ui/ErrorState'
import { Skeleton } from '../components/ui/Skeleton'
import { IconPlus } from '../components/ui/icons'
import { TaskBoard } from '../components/tasks/TaskBoard'
import { TaskFilters } from '../components/tasks/TaskFilters'
import { TaskForm, type TaskFormValues } from '../components/tasks/TaskForm'

export function Board() {
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const filters = boardFiltersFromSearchParams(searchParams)

  const [createOpen, setCreateOpen] = useState(false)
  const [editTargetId, setEditTargetId] = useState<string | null>(null)
  const [focusAssignee, setFocusAssignee] = useState(false)
  const [blockMove, setBlockMove] = useState<TaskSummary | null>(null)
  const [staleTaskId, setStaleTaskId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [bannerError, setBannerError] = useState<BannerError | null>(null)

  const boardQuery = useBoardQuery(filters)
  const activeUsersQuery = useActiveUsersQuery()
  const activeClientsQuery = useActiveClientsQuery()
  const changeStatus = useChangeTaskStatus()
  const createTask = useCreateTask()
  const updateTask = useUpdateTask()
  const reconcileTask = useReconcileTask()

  const users = activeUsersQuery.data?.users ?? []
  const usersGated = activeUsersQuery.data?.gated ?? false
  const clients = activeClientsQuery.data?.data ?? []

  const setFilters = (next: typeof EMPTY_BOARD_FILTERS) => {
    setSearchParams(boardFiltersToSearchParams(next), { replace: true })
  }

  const canEditTask = (task: TaskSummary) =>
    Boolean(user && (user.role === 'ADMIN' || task.assignee?.id === user.id))

  const isMovingTask = (taskId: string) =>
    changeStatus.isPending && changeStatus.variables?.taskId === taskId

  /* ---------- Move to… (TASK-FE-008) ---------- */

  const handleMove = (task: TaskSummary, status: TaskStatus, blockedReason?: string) => {
    setBannerError(null)
    setStaleTaskId(null)
    if (status === 'BLOCKED' && !blockedReason) {
      setBlockMove(task)
      return
    }
    changeStatus.mutate(
      { taskId: task.id, payload: { status, blockedReason, expectedVersion: task.version } },
      {
        onSuccess: () => setNotice(`Moved "${task.title}" to ${STATUS_LABELS[status]}.`),
        onError: (error) => {
          if (error instanceof ApiError && error.status === 409 && error.currentState) {
            setStaleTaskId(task.id)
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

  const handleRequireAssignee = (task: TaskSummary) => {
    setFocusAssignee(true)
    setEditTargetId(task.id)
    setNotice(`Assign someone to "${task.title}" before moving it out of the backlog.`)
  }

  /* ---------- Create / edit ---------- */

  const handleCreateSubmit = async (values: TaskFormValues) => {
    setBannerError(null)
    setStaleTaskId(null)
    try {
      await createTask.mutateAsync({
        title: values.title,
        description: values.description || undefined,
        status: values.status,
        priority: values.priority,
        assigneeId: values.assigneeId || undefined,
        clientId: values.clientId || undefined,
        dueDate: values.dueDate || undefined,
        blockedReason: values.status === 'BLOCKED' ? values.blockedReason : undefined,
      })
      setCreateOpen(false)
      setNotice('Task created.')
    } catch (caught) {
      setBannerError({ title: serverErrorTitle(caught), detail: serverErrorDetail(caught) })
    }
  }

  const handleEditSubmit = async (
    values: TaskFormValues,
    form: UseFormReturn<TaskFormValues>,
  ) => {
    if (!editTargetId || !editTaskDetail) return
    setBannerError(null)
    setStaleTaskId(null)
    const assignee: UserResponse | undefined = users.find((item) => item.id === values.assigneeId)
    const client: ClientRef | undefined = clients.find((item) => item.id === values.clientId)
    try {
      await updateTask.mutateAsync({
        taskId: editTargetId,
        payload: {
          title: values.title,
          description: values.description || undefined,
          priority: values.priority,
          assigneeId: values.assigneeId || undefined,
          clientId: values.clientId || undefined,
          dueDate: values.dueDate || undefined,
          blockedReason: values.status === 'BLOCKED' ? values.blockedReason : undefined,
          expectedVersion: editTaskDetail.version,
        },
        optimisticRefs: {
          assignee: values.assigneeId === undefined || values.assigneeId === ''
            ? null
            : (assignee ?? editTaskDetail.assignee),
          client: values.clientId === undefined || values.clientId === ''
            ? null
            : (client ?? editTaskDetail.client),
        },
      })
      setEditTargetId(null)
      setNotice('Task updated.')
    } catch (caught) {
      if (!applyFieldErrors(form, caught)) {
        setBannerError({ title: serverErrorTitle(caught), detail: serverErrorDetail(caught) })
      }
    }
  }

  const editTaskQuery = useTaskQuery(editTargetId ?? '')
  const editTaskDetail: TaskResponse | undefined = editTaskQuery.data

  /* ---------- Render ---------- */

  const resultCount = boardQuery.data?.meta.total ?? null

  return (
    <>
      <header className="page-header">
        <h1 className="page-header__title">Tasks</h1>
        <div className="page-header__actions">
          <Button leftIcon={<IconPlus />} onClick={() => setCreateOpen(true)}>
            New task
          </Button>
        </div>
      </header>

      {notice && <Alert variant="success" role="status" title={notice} className="alert--page" />}
      {bannerError && (
        <Alert variant="error" title={bannerError.title} className="alert--page">
          {bannerError.detail}
          {staleTaskId && (
            <span className="alert--page__actions">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  reconcileTask(staleTaskId)
                  setBannerError(null)
                  setStaleTaskId(null)
                }}
              >
                Show latest
              </Button>
            </span>
          )}
        </Alert>
      )}

      <TaskFilters
        filters={filters}
        onChange={setFilters}
        users={users}
        usersGated={usersGated}
        clients={clients}
        resultCount={resultCount}
      />

      {boardQuery.isPending && (
        <div className="skeleton-row" role="status" aria-label="Loading tasks">
          <Skeleton />
          <Skeleton />
          <Skeleton />
          <Skeleton />
          <Skeleton />
        </div>
      )}

      {boardQuery.isError && (
        <ErrorState
          title="Could not load tasks"
          message={boardQuery.error instanceof Error ? boardQuery.error.message : undefined}
          onRetry={() => void boardQuery.refetch()}
        />
      )}

      {boardQuery.isSuccess && boardQuery.data.meta.total === 0 && (
        <EmptyState
          title="No tasks match your filters"
          description="Try a different search term or clear the filters."
          action={
            <Button variant="secondary" onClick={() => setFilters(EMPTY_BOARD_FILTERS)}>
              Clear filters
            </Button>
          }
        />
      )}

      {boardQuery.isSuccess && boardQuery.data.meta.total > 0 && (
        <TaskBoard
          board={boardQuery.data}
          canEditTask={canEditTask}
          isMovingTask={isMovingTask}
          onMove={handleMove}
          onEdit={(task) => {
            setFocusAssignee(false)
            setEditTargetId(task.id)
          }}
          onRequireAssignee={handleRequireAssignee}
        />
      )}

      {/* Create — true modal (wireframe §2.3). */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="New task">
        <TaskForm
          mode="create"
          users={users}
          usersGated={usersGated}
          clients={clients}
          isSubmitting={createTask.isPending}
          serverError={bannerError}
          onSubmit={handleCreateSubmit}
        />
      </Dialog>

      {/* Edit — modal from the card actions. */}
      <Drawer
        open={editTargetId !== null}
        onClose={() => setEditTargetId(null)}
        title={editTaskDetail ? `Edit ${editTaskDetail.title}` : 'Edit task'}
        width={480}
      >
        {editTaskDetail ? (
          <TaskForm
            key={editTaskDetail.id}
            mode="edit"
            task={editTaskDetail}
            users={users}
            usersGated={usersGated}
            clients={clients}
            isSubmitting={updateTask.isPending}
            serverError={bannerError}
            focusAssignee={focusAssignee}
            onSubmit={handleEditSubmit}
          />
        ) : (
          <div className="skeleton-row" role="status" aria-label="Loading task">
            <Skeleton />
            <Skeleton />
          </div>
        )}
      </Drawer>

      {/* Blocked reason dialog (BR-010): moving into BLOCKED needs a reason. */}
      <BlockedReasonDialog
        task={blockMove}
        isSubmitting={changeStatus.isPending}
        onClose={() => setBlockMove(null)}
        onConfirm={(reason) => {
          if (blockMove) {
            const task = blockMove
            setBlockMove(null)
            handleMove(task, 'BLOCKED', reason)
          }
        }}
      />
    </>
  )
}

/* ---------- Blocked reason dialog ---------- */

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
        <label htmlFor="blocked-reason-input" className="field__label">
          Blocked reason <span className="field__required">*</span>
        </label>
        <textarea
          id="blocked-reason-input"
          className={`input input--textarea${error ? ' input--error' : ''}`}
          rows={3}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'blocked-reason-error' : undefined}
          value={reason}
          onChange={(event) => {
            setReason(event.target.value)
            if (error) setError(null)
          }}
        />
        {error && (
          <p id="blocked-reason-error" className="field__error" role="alert">
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
