/*
 * TaskList (PC-02, LIST-002/003) — desktop task list table. Every filter and
 * the sort live in the URL (?q=&status=&priority=&assigneeId=&clientId=
 * &sort=&order=&page=), so the browser back/forward buttons restore any
 * previous state (LIST-003). Sort cycle on a column: asc → desc → none.
 *
 * Follows ClientList's skeleton/empty/error/pagination patterns; the table
 * itself (headers, states, row navigation) is encapsulated in TaskTable.
 */
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import type { Paginated, TaskPriority, TaskStatus, TaskSummary, UserResponse } from '../api/types'
import {
  DEFAULT_SORT_ORDER,
  hasActiveTaskListFilters,
  taskListFromSearchParams,
  taskListToSearchParams,
  type TaskListState,
  type TaskSortField,
} from '../hooks/useTaskList'
import { useActiveClientsQuery, useActiveUsersQuery } from '../hooks/useTaskQueries'
import { STATUS_LABELS, PRIORITY_LABELS } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { IconSearch } from '../components/ui/icons'
import { TaskDetailModal } from '../components/tasks/TaskDetailModal'
import { TaskTable } from '../components/tasks/TaskTable'

const PAGE_SIZE = 10

const STATUS_OPTIONS = (Object.keys(STATUS_LABELS) as TaskStatus[]).map((status) => ({
  value: status,
  label: STATUS_LABELS[status],
}))

const PRIORITY_OPTIONS = (Object.keys(PRIORITY_LABELS) as TaskPriority[]).map((priority) => ({
  value: priority,
  label: PRIORITY_LABELS[priority],
}))

export function TaskList() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const state = taskListFromSearchParams(searchParams)

  // Local search input; the debounced value is pushed into the URL (300ms).
  const [search, setSearch] = useState(state.q)
  useEffect(() => {
    setSearch(state.q)
  }, [state.q])

  const setState = (patch: Partial<TaskListState>) => {
    // Any filter or sort change restarts pagination at page 1 (LIST-003).
    const resetsPage =
      'q' in patch ||
      'status' in patch ||
      'priority' in patch ||
      'assigneeId' in patch ||
      'clientId' in patch ||
      'sort' in patch ||
      'order' in patch
    const next = { ...state, ...patch, page: resetsPage ? 1 : (patch.page ?? state.page) }
    // Push (not replace): the browser back button restores the previous state.
    setSearchParams(taskListToSearchParams(next))
  }

  // Debounce the search input (300ms) before writing it to the URL.
  useEffect(() => {
    const timer = setTimeout(() => {
      const trimmed = search.trim()
      if (trimmed !== state.q) setState({ q: trimmed })
    }, 300)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setState identity changes per render; the guard prevents loops.
  }, [search, state.q])

  const listQuery = useQuery({
    queryKey: ['tasks', 'list', state],
    queryFn: () =>
      api.get<Paginated<TaskSummary>>('/tasks', {
        params: {
          q: state.q || undefined,
          status: state.status || undefined,
          priority: state.priority || undefined,
          assigneeId: state.assigneeId || undefined,
          clientId: state.clientId || undefined,
          sort: state.sort ?? undefined,
          order: state.sort ? state.order : undefined,
          page: state.page,
          limit: PAGE_SIZE,
        },
      }),
  })

  const activeUsersQuery = useActiveUsersQuery()
  const activeClientsQuery = useActiveClientsQuery()
  const users = activeUsersQuery.data?.users ?? []
  const usersGated = activeUsersQuery.data?.gated ?? false
  const clients = activeClientsQuery.data?.data ?? []

  /* ---------- Sort cycle (LIST-003): asc → desc → none ---------- */

  const handleSort = (field: TaskSortField) => {
    if (state.sort !== field) {
      setState({ sort: field, order: 'asc' })
    } else if (state.order === 'asc') {
      setState({ order: 'desc' })
    } else {
      // none → no explicit sort (server default createdAt desc)
      setState({ sort: null, order: DEFAULT_SORT_ORDER })
    }
  }

  const clearFilters = () => {
    setSearch('')
    setState({ q: '', status: '', priority: '', assigneeId: '', clientId: '' })
  }

  /* ---------- Pagination + result copy (ClientList pattern) ---------- */

  const hasFilters = hasActiveTaskListFilters(state)
  const meta = listQuery.data?.meta
  const total = meta?.total ?? 0
  const metaPage = meta?.page ?? 1
  const metaLimit = meta?.limit ?? 1
  const start = total === 0 ? 0 : (metaPage - 1) * metaLimit + 1
  const end = Math.min(metaPage * metaLimit, total)

  const tableStatus = listQuery.isPending
    ? ('loading' as const)
    : listQuery.isError
      ? ('error' as const)
      : total === 0
        ? ('empty' as const)
        : ('ready' as const)

  return (
    <>
      <header className="page-header">
        <h1 className="page-header__title">Task List</h1>
        <div className="page-header__actions">
          <Link to="/tasks" className="btn btn--secondary">
            Open board
          </Link>
        </div>
      </header>

      <div className="toolbar toolbar--filters">
        <div className="toolbar__search">
          <Input
            label="Search tasks"
            hideLabel
            type="search"
            placeholder="Search by title or description"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            leftIcon={<IconSearch />}
          />
        </div>

        <Select
          label="Status filter"
          hideLabel
          aria-label="Filter tasks by status"
          value={state.status}
          onChange={(event) => setState({ status: event.target.value as '' | TaskStatus })}
          options={[{ value: '', label: 'All statuses' }, ...STATUS_OPTIONS]}
        />

        <Select
          label="Priority filter"
          hideLabel
          aria-label="Filter tasks by priority"
          value={state.priority}
          onChange={(event) => setState({ priority: event.target.value as '' | TaskPriority })}
          options={[{ value: '', label: 'All priorities' }, ...PRIORITY_OPTIONS]}
        />

        <Select
          label="Assignee filter"
          hideLabel
          aria-label="Filter tasks by assignee"
          value={state.assigneeId}
          disabled={usersGated}
          onChange={(event) => setState({ assigneeId: event.target.value })}
          options={[
            { value: '', label: 'Anyone' },
            ...users.map((user: UserResponse) => ({ value: user.id, label: user.name })),
          ]}
        />

        <Select
          label="Client filter"
          hideLabel
          aria-label="Filter tasks by client"
          value={state.clientId}
          onChange={(event) => setState({ clientId: event.target.value })}
          options={[
            { value: '', label: 'Any client' },
            ...clients.map((client) => ({ value: client.id, label: client.companyName })),
          ]}
        />

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Clear filters
          </Button>
        )}

        <p className="toolbar__result" role="status">
          {listQuery.isSuccess
            ? total === 0
              ? 'No tasks match your filters.'
              : `Showing ${start}–${end} of ${total} tasks`
            : ''}
        </p>
      </div>

      <TaskTable
        status={tableStatus}
        tasks={listQuery.data?.data ?? []}
        errorMessage={listQuery.error instanceof Error ? listQuery.error.message : undefined}
        onRetry={() => void listQuery.refetch()}
        hasFilters={hasFilters}
        onClearFilters={clearFilters}
        sort={state.sort}
        order={state.order}
        onSort={handleSort}
        onRowClick={(task) => setSelectedTaskId(task.id)}
      />

      {tableStatus === 'ready' && total > PAGE_SIZE && (
        <nav className="pagination" aria-label="Tasks pagination">
          <p className="pagination__info">
            Page {metaPage} of {Math.ceil(total / metaLimit)}
          </p>
          <div className="pagination__controls">
            <Button
              variant="secondary"
              disabled={state.page <= 1}
              onClick={() => setState({ page: Math.max(1, state.page - 1) })}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              disabled={state.page >= Math.ceil(total / metaLimit)}
              onClick={() => setState({ page: state.page + 1 })}
            >
              Next
            </Button>
          </div>
        </nav>
      )}

      {/* Task detail drawer — slides from right over the list */}
      <TaskDetailModal
        taskId={selectedTaskId}
        open={selectedTaskId !== null}
        onClose={() => setSelectedTaskId(null)}
      />
    </>
  )
}
