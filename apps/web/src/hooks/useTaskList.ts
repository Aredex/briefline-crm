/*
 * Task list model (PC-02, LIST-002/003) — filters and sort live in the URL as
 * flat query params (FR-TASK-006 pattern): q, status, priority, assigneeId,
 * clientId, sort, order, page. The page owns the search-params sync; this
 * module owns the state shape and the (de)serialization, mirroring useBoard.
 *
 * Validation: unknown/invalid values are ignored and fall back to defaults
 * (a bad sort is dropped → the server default createdAt desc).
 */
import type { TaskPriority, TaskStatus } from '../api/types'

export type TaskSortField = 'title' | 'priority' | 'status' | 'dueDate' | 'createdAt' | 'updatedAt'

export type TaskListOrder = 'asc' | 'desc'

export interface TaskListState {
  q: string
  status: TaskStatus | ''
  priority: TaskPriority | ''
  assigneeId: string
  clientId: string
  /** null = no explicit sort (server default: createdAt desc). */
  sort: TaskSortField | null
  order: TaskListOrder
  page: number
}

export const DEFAULT_SORT_FIELD: TaskSortField = 'createdAt'
export const DEFAULT_SORT_ORDER: TaskListOrder = 'desc'

export const EMPTY_TASK_LIST_STATE: TaskListState = {
  q: '',
  status: '',
  priority: '',
  assigneeId: '',
  clientId: '',
  sort: null,
  order: DEFAULT_SORT_ORDER,
  page: 1,
}

export const SORT_FIELDS: TaskSortField[] = ['title', 'priority', 'status', 'dueDate', 'createdAt', 'updatedAt']

const SORT_VALUES = new Set<string>(SORT_FIELDS)
const STATUS_VALUES = new Set(['BACKLOG', 'PENDING', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED'])
const PRIORITY_VALUES = new Set(['LOW', 'MEDIUM', 'HIGH', 'URGENT'])

function asStatus(value: string | null): TaskStatus | '' {
  return value && STATUS_VALUES.has(value) ? (value as TaskStatus) : ''
}

function asPriority(value: string | null): TaskPriority | '' {
  return value && PRIORITY_VALUES.has(value) ? (value as TaskPriority) : ''
}

function asSort(value: string | null): TaskSortField | null {
  return value && SORT_VALUES.has(value) ? (value as TaskSortField) : null
}

function asOrder(value: string | null): TaskListOrder {
  return value === 'asc' ? 'asc' : 'desc'
}

function asPage(value: string | null): number {
  const page = Number(value)
  return Number.isInteger(page) && page >= 1 ? page : 1
}

/** Read list state from the URL (invalid values are ignored). */
export function taskListFromSearchParams(params: URLSearchParams): TaskListState {
  return {
    q: params.get('q') ?? '',
    status: asStatus(params.get('status')),
    priority: asPriority(params.get('priority')),
    assigneeId: params.get('assigneeId') ?? '',
    clientId: params.get('clientId') ?? '',
    sort: asSort(params.get('sort')),
    order: asOrder(params.get('order')),
    page: asPage(params.get('page')),
  }
}

/** Serialize list state to URL search params (empty/default values omitted). */
export function taskListToSearchParams(state: TaskListState): URLSearchParams {
  const params = new URLSearchParams()
  if (state.q) params.set('q', state.q)
  if (state.status) params.set('status', state.status)
  if (state.priority) params.set('priority', state.priority)
  if (state.assigneeId) params.set('assigneeId', state.assigneeId)
  if (state.clientId) params.set('clientId', state.clientId)
  if (state.sort) {
    params.set('sort', state.sort)
    params.set('order', state.order)
  }
  if (state.page > 1) params.set('page', String(state.page))
  return params
}

/** True when at least one FILTER is active (sort/page are navigation, not filters). */
export function hasActiveTaskListFilters(state: TaskListState): boolean {
  return (
    state.q !== '' ||
    state.status !== '' ||
    state.priority !== '' ||
    state.assigneeId !== '' ||
    state.clientId !== ''
  )
}
