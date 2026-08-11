/*
 * Task query hooks — one server-state source per endpoint (TASK-FE-001).
 *
 * Board filters are flat query params (FR-TASK-006); the response carries the
 * contractual server-side sort (priority desc, due asc nulls last, updatedAt
 * desc) — the client never reorders (DEC-035). The "No due date" filter has no
 * server equivalent, so it is applied client-side while preserving the
 * server sort and recounting meta.total.
 */
import { useQuery } from '@tanstack/react-query'
import { api, ApiError } from '../api/client'
import type {
  BoardResponse,
  Paginated,
  TaskChange,
  TaskResponse,
  UserResponse,
} from '../api/types'
import { madridToday } from '../lib/format'
import type { BoardFilters, DueFilter } from './useBoard'

/** Civil-date arithmetic on YYYY-MM-DD strings (no Date/DST math, BR-020). */
function shiftDate(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, (day ?? 1) + days))
    .toISOString()
    .slice(0, 10)
}

/** dueBefore/dueAfter for the "Overdue"/"Due today"/"This week" filters. */
function dueWindow(due: Exclude<DueFilter, '' | 'NO_DUE'>): { dueBefore?: string; dueAfter?: string } {
  const today = madridToday()
  if (due === 'OVERDUE') return { dueBefore: shiftDate(today, -1) }
  if (due === 'TODAY') return { dueBefore: today, dueAfter: today }
  return { dueBefore: shiftDate(today, 7), dueAfter: today }
}

export function useBoardQuery(filters: BoardFilters) {
  return useQuery({
    queryKey: ['tasks', 'board', filters],
    queryFn: async () => {
      const params: Record<string, string> = {}
      if (filters.q) params.q = filters.q
      if (filters.status) params.status = filters.status
      if (filters.priority) params.priority = filters.priority
      if (filters.assigneeId) params.assigneeId = filters.assigneeId
      if (filters.clientId) params.clientId = filters.clientId
      if (filters.due && filters.due !== 'NO_DUE') {
        const window = dueWindow(filters.due)
        if (window.dueBefore) params.dueBefore = window.dueBefore
        if (window.dueAfter) params.dueAfter = window.dueAfter
      }
      const board = await api.get<BoardResponse>('/tasks/board', { params })
      if (filters.due !== 'NO_DUE') return board

      // Client-side pass for "No due date" (no server param exists). Filtering
      // after the server sort preserves the contractual ordering.
      const keep = (task: { dueDate: string | null }) => task.dueDate === null
      const columns = {
        PENDING: board.columns.PENDING.filter(keep),
        IN_PROGRESS: board.columns.IN_PROGRESS.filter(keep),
        BLOCKED: board.columns.BLOCKED.filter(keep),
        COMPLETED: board.columns.COMPLETED.filter(keep),
      }
      const total =
        board.backlog.filter(keep).length +
        columns.PENDING.length +
        columns.IN_PROGRESS.length +
        columns.BLOCKED.length +
        columns.COMPLETED.length
      return { backlog: board.backlog.filter(keep), columns, meta: { total } }
    },
  })
}

export function useTaskQuery(taskId: string) {
  return useQuery({
    queryKey: ['tasks', 'detail', taskId],
    queryFn: () => api.get<TaskResponse>(`/tasks/${taskId}`),
    enabled: Boolean(taskId),
  })
}

export function useTaskHistoryQuery(taskId: string) {
  return useQuery({
    queryKey: ['tasks', 'history', taskId],
    // TASK-API-007: history is paginated ({ data, meta }) — read the envelope
    // and ask for the whole timeline (limit is capped at 100 by the API).
    queryFn: () => api.get<Paginated<TaskChange>>(`/tasks/${taskId}/history`, { params: { limit: 100 } }),
    enabled: Boolean(taskId),
  })
}

export function useArchivedTasksQuery(page: number) {
  return useQuery({
    queryKey: ['tasks', 'archived', page],
    queryFn: () =>
      api.get<Paginated<TaskResponse>>('/tasks/archived', { params: { page, limit: 20 } }),
  })
}

/**
 * ACTIVE users for the Assignee selects. GET /users is admin-only, so members
 * receive 403: the hook degrades to an empty list flagged `gated` — the form
 * then disables the field with an explanatory hint (contract-safe, no invented
 * endpoint).
 */
export function useActiveUsersQuery() {
  return useQuery({
    queryKey: ['users', 'active'],
    queryFn: async (): Promise<{ users: UserResponse[]; gated: boolean }> => {
      try {
        const result = await api.get<Paginated<UserResponse>>('/users', {
          params: { status: 'ACTIVE', limit: 50 },
        })
        return { users: result.data, gated: false }
      } catch (error) {
        if (error instanceof ApiError && error.status === 403) return { users: [], gated: true }
        throw error
      }
    },
  })
}

/** Non-archived clients for the Client selects (BR-005: archived excluded by default). */
export function useActiveClientsQuery() {
  return useQuery({
    queryKey: ['clients', 'active'],
    queryFn: () => api.get<Paginated<import('../api/types').ClientResponse>>('/clients', { params: { limit: 50 } }),
  })
}
