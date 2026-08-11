/*
 * Task mutations (TASK-FE-012/013) — optimistic updates with rollback.
 *
 * Contract: PATCH /tasks/{taskId} (allowlist, TASK-API-003), PATCH
 * /tasks/{taskId}/status (free transitions, DEC-024), POST /tasks,
 * POST /tasks/{taskId}/archive (admin). Every mutation carries expectedVersion;
 * a stale version → 409 STALE_VERSION with currentState for reconciliation.
 *
 * Concurrency (TASK-FE-013): one pending mutation per task. Each task keeps a
 * monotonic request id; a response is applied only if it is still the latest —
 * out-of-order responses are ignored. Snapshots are taken per cached board key
 * so any filter variant rolls back correctly.
 */
import { useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import type {
  BoardResponse,
  ChangeTaskStatusInput,
  TaskCreateInput,
  TaskPriority,
  TaskResponse,
  TaskStatus,
  TaskSummary,
  TaskUpdateInput,
} from '../api/types'

const PRIORITY_RANK: Record<TaskPriority, number> = { URGENT: 4, HIGH: 3, MEDIUM: 2, LOW: 1 }

/** Contractual board order: priority desc, due asc (nulls last), updatedAt desc. */
function compareTasks(a: TaskSummary, b: TaskSummary): number {
  const priorityDiff = PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority]
  if (priorityDiff !== 0) return priorityDiff
  if (a.dueDate === null && b.dueDate !== null) return 1
  if (a.dueDate !== null && b.dueDate === null) return -1
  if (a.dueDate !== null && b.dueDate !== null && a.dueDate !== b.dueDate) {
    return a.dueDate < b.dueDate ? -1 : 1
  }
  return b.updatedAt.localeCompare(a.updatedAt)
}

function sortInsert(list: TaskSummary[], task: TaskSummary): TaskSummary[] {
  const index = list.findIndex((item) => compareTasks(task, item) < 0)
  const next = [...list]
  if (index === -1) next.push(task)
  else next.splice(index, 0, task)
  return next
}

function withColumns(
  board: BoardResponse,
  fn: (list: TaskSummary[]) => TaskSummary[],
): BoardResponse {
  return {
    backlog: fn(board.backlog),
    columns: {
      PENDING: fn(board.columns.PENDING),
      IN_PROGRESS: fn(board.columns.IN_PROGRESS),
      BLOCKED: fn(board.columns.BLOCKED),
      COMPLETED: fn(board.columns.COMPLETED),
    },
    meta: board.meta,
  }
}

/** Field-level optimistic patch applied to every cached board. */
function applyBoardPatch(board: BoardResponse, taskId: string, patch: Partial<TaskSummary>): BoardResponse {
  return withColumns(board, (list) =>
    list.map((task) => (task.id === taskId ? { ...task, ...patch } : task)),
  )
}

/** Status move: remove from every group, insert into the destination with sort. */
function applyBoardMove(board: BoardResponse, taskId: string, task: TaskSummary): BoardResponse {
  const without = withColumns(board, (list) => list.filter((item) => item.id !== taskId))
  if (task.status === 'BACKLOG') {
    return { ...without, backlog: sortInsert(without.backlog, task) }
  }
  return {
    ...without,
    columns: { ...without.columns, [task.status]: sortInsert(without.columns[task.status], task) },
  }
}

/** Snapshot every cached board variant so any filter rollback restores exactly. */
function snapshotBoards(queryClient: ReturnType<typeof useQueryClient>) {
  return queryClient
    .getQueriesData<BoardResponse>({ queryKey: ['tasks', 'board'] })
    .filter((entry): entry is [unknown[], BoardResponse] => Boolean(entry[1]))
}

function restoreBoards(
  queryClient: ReturnType<typeof useQueryClient>,
  snapshots: [unknown[], BoardResponse][],
) {
  for (const [key, data] of snapshots) {
    queryClient.setQueryData(key, data)
  }
}

interface StatusVariables {
  taskId: string
  payload: ChangeTaskStatusInput
}

/** Prefer the cached summary so the optimistic move renders from current data. */
function findInBoard(board: BoardResponse, taskId: string): TaskSummary | undefined {
  if (board.backlog.some((t) => t.id === taskId)) return board.backlog.find((t) => t.id === taskId)
  for (const key of ['PENDING', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED'] as const) {
    const found = board.columns[key].find((t) => t.id === taskId)
    if (found) return found
  }
  return undefined
}

/* ---------- Status move (optimistic) ---------- */

export function useChangeTaskStatus() {
  const queryClient = useQueryClient()
  const requestIds = useRef(new Map<string, number>())

  return useMutation({
    mutationFn: ({ taskId, payload }: StatusVariables) =>
      api.patch<TaskResponse>(`/tasks/${taskId}/status`, payload),
    onMutate: async ({ taskId, payload }: StatusVariables) => {
      const requestId = (requestIds.current.get(taskId) ?? 0) + 1
      requestIds.current.set(taskId, requestId)

      await queryClient.cancelQueries({ queryKey: ['tasks', 'board'] })
      const boardSnapshots = snapshotBoards(queryClient)
      const detailSnapshot = queryClient.getQueryData<TaskResponse>(['tasks', 'detail', taskId])

      // Build the optimistic summary from the first cached board that has it.
      let optimistic: TaskSummary | undefined
      for (const [, board] of boardSnapshots) {
        const found = findInBoard(board, taskId)
        if (found) {
          optimistic = found
          break
        }
      }
      if (optimistic) {
        const patch: Partial<TaskSummary> = {
          status: payload.status,
          version: optimistic.version + 1,
          updatedAt: new Date().toISOString(),
        }
        queryClient.setQueriesData<BoardResponse>(
          { queryKey: ['tasks', 'board'] },
          (board) => (board ? applyBoardMove(board, taskId, { ...optimistic, ...patch }) : board),
        )
        if (detailSnapshot) {
          queryClient.setQueryData<TaskResponse>(['tasks', 'detail', taskId], {
            ...detailSnapshot,
            status: payload.status,
            blockedReason:
              payload.status === 'BLOCKED'
                ? (payload.blockedReason ?? detailSnapshot.blockedReason)
                : null,
            version: detailSnapshot.version + 1,
            updatedAt: patch.updatedAt!,
          })
        }
      }

      return { taskId, requestId, boardSnapshots, detailSnapshot }
    },
    onError: (error, _variables, context) => {
      if (!context || context.requestId !== requestIds.current.get(context.taskId)) return
      restoreBoards(queryClient, context.boardSnapshots)
      if (context.detailSnapshot) {
        queryClient.setQueryData(['tasks', 'detail', context.taskId], context.detailSnapshot)
      }
      // The caller surfaces error (incl. 409 currentState + "Show latest").
      void error
    },
    onSettled: (_data, _error, variables, context) => {
      if (!context || context.requestId !== requestIds.current.get(context.taskId)) return
      void queryClient.invalidateQueries({ queryKey: ['tasks', 'board'] })
      void queryClient.invalidateQueries({ queryKey: ['tasks', 'detail', variables.taskId] })
    },
  })
}

/* ---------- Update fields (optimistic) ---------- */

interface UpdateVariables {
  taskId: string
  payload: TaskUpdateInput
  /**
   * Resolved refs for the optimistic summary — the board card needs the
   * assignee/client *names*, which the caller resolves from its lists
   * (the API only exchanges ids).
   */
  optimisticRefs?: { assignee?: import('../api/types').UserRef | null; client?: import('../api/types').ClientRef | null }
}

export function useUpdateTask() {
  const queryClient = useQueryClient()
  const requestIds = useRef(new Map<string, number>())

  return useMutation({
    mutationFn: ({ taskId, payload }: UpdateVariables) =>
      api.patch<TaskResponse>(`/tasks/${taskId}`, payload),
    onMutate: async ({ taskId, payload, optimisticRefs }: UpdateVariables) => {
      const requestId = (requestIds.current.get(taskId) ?? 0) + 1
      requestIds.current.set(taskId, requestId)

      await queryClient.cancelQueries({ queryKey: ['tasks', 'board'] })
      const boardSnapshots = snapshotBoards(queryClient)
      const detailSnapshot = queryClient.getQueryData<TaskResponse>(['tasks', 'detail', taskId])

      const { expectedVersion: _expectedVersion, ...patch } = payload
      const now = new Date().toISOString()
      const summaryPatch: Partial<TaskSummary> = {
        title: patch.title,
        priority: patch.priority,
        dueDate: patch.dueDate,
        version: (detailSnapshot?.version ?? 0) + 1,
        updatedAt: now,
      }
      if (patch.assigneeId !== undefined) {
        summaryPatch.assignee =
          patch.assigneeId === null ? null : (optimisticRefs?.assignee ?? detailSnapshot?.assignee ?? null)
      }
      if (patch.clientId !== undefined) {
        summaryPatch.client =
          patch.clientId === null ? null : (optimisticRefs?.client ?? detailSnapshot?.client ?? null)
      }
      for (const key of Object.keys(summaryPatch) as (keyof TaskSummary)[]) {
        if (summaryPatch[key] === undefined) delete summaryPatch[key]
      }

      queryClient.setQueriesData<BoardResponse>(
        { queryKey: ['tasks', 'board'] },
        (board) => (board ? applyBoardPatch(board, taskId, summaryPatch) : board),
      )
      if (detailSnapshot) {
        const { assigneeId: _dropAssigneeId, clientId: _dropClientId, ...fieldPatch } = patch
        queryClient.setQueryData<TaskResponse>(['tasks', 'detail', taskId], {
          ...detailSnapshot,
          ...fieldPatch,
          assignee:
            patch.assigneeId === undefined
              ? detailSnapshot.assignee
              : (patch.assigneeId === null
                  ? null
                  : (optimisticRefs?.assignee ?? detailSnapshot.assignee)),
          client:
            patch.clientId === undefined
              ? detailSnapshot.client
              : (patch.clientId === null
                  ? null
                  : (optimisticRefs?.client ?? detailSnapshot.client)),
          version: detailSnapshot.version + 1,
          updatedAt: now,
        })
      }

      return { taskId, requestId, boardSnapshots, detailSnapshot }
    },
    onError: (_error, _variables, context) => {
      if (!context || context.requestId !== requestIds.current.get(context.taskId)) return
      restoreBoards(queryClient, context.boardSnapshots)
      if (context.detailSnapshot) {
        queryClient.setQueryData(['tasks', 'detail', context.taskId], context.detailSnapshot)
      }
    },
    onSettled: (_data, _error, variables, context) => {
      if (!context || context.requestId !== requestIds.current.get(context.taskId)) return
      void queryClient.invalidateQueries({ queryKey: ['tasks', 'board'] })
      void queryClient.invalidateQueries({ queryKey: ['tasks', 'detail', variables.taskId] })
    },
  })
}

/* ---------- Create (no optimistic — task is not in cache yet) ---------- */

export function useCreateTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: TaskCreateInput) => api.post<TaskResponse>('/tasks', payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tasks', 'board'] })
    },
  })
}

/* ---------- Archive (admin, confirm-guarded — no optimistic) ---------- */

export function useArchiveTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ taskId, expectedVersion }: { taskId: string; expectedVersion: number }) =>
      api.post<TaskResponse>(`/tasks/${taskId}/archive`, { expectedVersion }),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['tasks', 'board'] })
      void queryClient.invalidateQueries({ queryKey: ['tasks', 'archived'] })
      void queryClient.invalidateQueries({ queryKey: ['tasks', 'detail', variables.taskId] })
    },
  })
}

/** Reconcile a 409 STALE_VERSION: re-read everything (board + detail) from the server. */
export function useReconcileTask() {
  const queryClient = useQueryClient()
  return (taskId: string) => {
    void queryClient.invalidateQueries({ queryKey: ['tasks', 'board'] })
    void queryClient.invalidateQueries({ queryKey: ['tasks', 'detail', taskId] })
  }
}

export type { TaskStatus }
