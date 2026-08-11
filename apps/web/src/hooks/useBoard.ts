/*
 * Board model (TASK-FE-001/003) — filters live in the URL as flat query params
 * (FR-TASK-006): q, status, priority, assignee, client, due. The board query
 * itself lives in useTaskQueries (useBoardQuery) so mutations can target the
 * whole ['tasks', 'board'] key family; this module owns the filter
 * shape and the search-params (de)serialization.
 */
import type { TaskPriority, TaskStatus } from '../api/types'

export type DueFilter = '' | 'OVERDUE' | 'TODAY' | 'THIS_WEEK' | 'NO_DUE'

export interface BoardFilters {
  q: string
  status: TaskStatus | ''
  priority: TaskPriority | ''
  assigneeId: string
  clientId: string
  due: DueFilter
}

export const EMPTY_BOARD_FILTERS: BoardFilters = {
  q: '',
  status: '',
  priority: '',
  assigneeId: '',
  clientId: '',
  due: '',
}

export const DUE_FILTERS: { value: DueFilter; label: string }[] = [
  { value: '', label: 'Any due date' },
  { value: 'OVERDUE', label: 'Overdue' },
  { value: 'TODAY', label: 'Due today' },
  { value: 'THIS_WEEK', label: 'Due this week' },
  { value: 'NO_DUE', label: 'No due date' },
]

const STATUS_VALUES = new Set(['BACKLOG', 'PENDING', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED'])
const PRIORITY_VALUES = new Set(['LOW', 'MEDIUM', 'HIGH', 'URGENT'])
const DUE_VALUES: Set<string> = new Set(DUE_FILTERS.map((option) => option.value))

function asStatus(value: string | null): TaskStatus | '' {
  return value && STATUS_VALUES.has(value) ? (value as TaskStatus) : ''
}

function asPriority(value: string | null): TaskPriority | '' {
  return value && PRIORITY_VALUES.has(value) ? (value as TaskPriority) : ''
}

function asDue(value: string | null): DueFilter {
  return value && DUE_VALUES.has(value) ? (value as DueFilter) : ''
}

/** Read filters from the URL (unknown/invalid values are ignored). */
export function boardFiltersFromSearchParams(params: URLSearchParams): BoardFilters {
  return {
    q: params.get('q') ?? '',
    status: asStatus(params.get('status')),
    priority: asPriority(params.get('priority')),
    assigneeId: params.get('assignee') ?? '',
    clientId: params.get('client') ?? '',
    due: asDue(params.get('due')),
  }
}

/** Serialize filters to URL search params (empty values omitted). */
export function boardFiltersToSearchParams(filters: BoardFilters): URLSearchParams {
  const params = new URLSearchParams()
  if (filters.q) params.set('q', filters.q)
  if (filters.status) params.set('status', filters.status)
  if (filters.priority) params.set('priority', filters.priority)
  if (filters.assigneeId) params.set('assignee', filters.assigneeId)
  if (filters.clientId) params.set('client', filters.clientId)
  if (filters.due) params.set('due', filters.due)
  return params
}

/** True when at least one filter is active (drives "Clear filters" + result copy). */
export function hasActiveBoardFilters(filters: BoardFilters): boolean {
  return (
    filters.q !== '' ||
    filters.status !== '' ||
    filters.priority !== '' ||
    filters.assigneeId !== '' ||
    filters.clientId !== '' ||
    filters.due !== ''
  )
}
