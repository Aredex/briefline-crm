/*
 * TaskFilters (TASK-FE-003) — flat filter controls: search (debounced 300ms),
 * status / priority / assignee / client / due selects, "Clear filters", and
 * the result count announced with role="status". Filters mirror the URL
 * search params (FR-TASK-006) — the page owns that sync.
 *
 * Assignee options come from active users (admin-only endpoint): when the
 * caller is a member the list is empty and the select is disabled with a hint.
 */
import { useEffect, useState } from 'react'
import type { TaskPriority, TaskStatus, UserResponse } from '../../api/types'
import { STATUS_LABELS, PRIORITY_LABELS } from '../ui/Badge'
import { Select } from '../ui/Select'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { IconSearch } from '../ui/icons'
import {
  DUE_FILTERS,
  EMPTY_BOARD_FILTERS,
  hasActiveBoardFilters,
  type BoardFilters,
} from '../../hooks/useBoard'

const STATUS_OPTIONS = (Object.keys(STATUS_LABELS) as TaskStatus[]).map((status) => ({
  value: status,
  label: STATUS_LABELS[status],
}))

const PRIORITY_OPTIONS = (Object.keys(PRIORITY_LABELS) as TaskPriority[]).map((priority) => ({
  value: priority,
  label: PRIORITY_LABELS[priority],
}))

export interface TaskFiltersProps {
  filters: BoardFilters
  onChange: (next: BoardFilters) => void
  /** Active users for the Assignee select (empty when the caller can't list them). */
  users: UserResponse[]
  usersGated: boolean
  /** Non-archived clients for the Client select. */
  clients: { id: string; companyName: string }[]
  /** Result count announced via role="status" (null while loading). */
  resultCount: number | null
}

export function TaskFilters({
  filters,
  onChange,
  users,
  usersGated,
  clients,
  resultCount,
}: TaskFiltersProps) {
  const [search, setSearch] = useState(filters.q)
  const [debounced, setDebounced] = useState(filters.q)

  // Sync the local input when the URL drives a change from outside (clear/back).
  useEffect(() => {
    setSearch(filters.q)
  }, [filters.q])

  // Debounce the search term (300ms) before pushing it up.
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 300)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    if (debounced === filters.q) return
    onChange({ ...filters, q: debounced })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])

  const patch = (partial: Partial<BoardFilters>) => onChange({ ...filters, ...partial })

  return (
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
        value={filters.status}
        onChange={(event) => patch({ status: event.target.value as '' | TaskStatus })}
        options={[{ value: '', label: 'All statuses' }, ...STATUS_OPTIONS]}
      />

      <Select
        label="Priority filter"
        hideLabel
        aria-label="Filter tasks by priority"
        value={filters.priority}
        onChange={(event) => patch({ priority: event.target.value as '' | TaskPriority })}
        options={[{ value: '', label: 'All priorities' }, ...PRIORITY_OPTIONS]}
      />

      <Select
        label="Assignee filter"
        hideLabel
        aria-label="Filter tasks by assignee"
        value={filters.assigneeId}
        disabled={usersGated}
        onChange={(event) => patch({ assigneeId: event.target.value })}
        options={[
          { value: '', label: 'Anyone' },
          ...users.map((user) => ({ value: user.id, label: user.name })),
        ]}
      />

      <Select
        label="Client filter"
        hideLabel
        aria-label="Filter tasks by client"
        value={filters.clientId}
        onChange={(event) => patch({ clientId: event.target.value })}
        options={[
          { value: '', label: 'Any client' },
          ...clients.map((client) => ({ value: client.id, label: client.companyName })),
        ]}
      />

      <Select
        label="Due date filter"
        hideLabel
        aria-label="Filter tasks by due date"
        value={filters.due}
        onChange={(event) => patch({ due: event.target.value as BoardFilters['due'] })}
        options={DUE_FILTERS}
      />

      {hasActiveBoardFilters(filters) && (
        <Button variant="ghost" size="sm" onClick={() => onChange(EMPTY_BOARD_FILTERS)}>
          Clear filters
        </Button>
      )}

      <p className="toolbar__result" role="status">
        {resultCount === null ? '' : resultCount === 0 ? 'No tasks match your filters.' : `${resultCount} ${resultCount === 1 ? 'task' : 'tasks'}`}
      </p>
    </div>
  )
}
