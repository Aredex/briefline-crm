/*
 * Dashboard query hooks (DASH-001/002/003) — one server-state source per
 * dashboard endpoint (TASK-API-011). Each section owns its own query so a
 * failure in one never blanks the others (partial error). Server-side sort
 * and limits are contractual — the client renders what it receives.
 */
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import type { Kpis, Paginated, RecentActivityItem, TaskSummary } from '../api/types'

export function useKpisQuery() {
  return useQuery({
    queryKey: ['dashboard', 'kpis'],
    queryFn: () => api.get<Kpis>('/dashboard/kpis'),
  })
}

/** Tasks assigned to the current user — contractual sort (priority desc, due asc). */
export function useMyTasksQuery(limit: number) {
  return useQuery({
    queryKey: ['dashboard', 'my-tasks', limit],
    queryFn: () =>
      api.get<Paginated<TaskSummary>>('/dashboard/my-tasks', { params: { limit } }),
  })
}

/** Visible TaskChange events — archived tasks are excluded server-side (DASH-003). */
export function useRecentActivityQuery(limit: number) {
  return useQuery({
    queryKey: ['dashboard', 'recent-activity', limit],
    queryFn: () =>
      api.get<Paginated<RecentActivityItem>>('/dashboard/recent-activity', {
        params: { limit },
      }),
  })
}
