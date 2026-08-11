/*
 * TaskTable (PC-02, LIST-002) — accessible task list table with sortable
 * headers (title/status/priority/due date; the assignee/client columns are
 * not sortable — the API allowlist is Task columns only, LIST-001).
 *
 * Loading (skeleton rows), error (retry) and empty (clear filters) states are
 * encapsulated: callers pass the query status and stay presentational.
 *
 * Sort semantics (LIST-003): the sort cycle is asc → desc → none (no explicit
 * sort → server default createdAt desc). The sort button inside <th> keeps
 * the table keyboard-accessible; aria-sort announces the state.
 */
import { Link } from 'react-router'
import type { TaskSortField, TaskListOrder } from '../../hooks/useTaskList'
import type { TaskSummary } from '../../api/types'
import { dueLabel } from '../../lib/format'
import { Badge, PriorityBadge, StatusBadge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { EmptyState } from '../ui/EmptyState'
import { ErrorState } from '../ui/ErrorState'
import { Skeleton } from '../ui/Skeleton'
import { IconArrowDown, IconArrowUp } from '../ui/icons'

export type TaskTableStatus = 'loading' | 'error' | 'empty' | 'ready'

export interface TaskTableProps {
  status: TaskTableStatus
  tasks: TaskSummary[]
  errorMessage?: string
  onRetry?: () => void
  /** True when at least one filter is active (drives the empty-state CTA). */
  hasFilters?: boolean
  onClearFilters?: () => void
  sort: TaskSortField | null
  order: TaskListOrder
  onSort: (field: TaskSortField) => void
  onRowClick: (task: TaskSummary) => void
}

interface Column {
  key: TaskSortField | null
  label: string
  /** Right-aligned actions-like column (none today — reserved for future). */
  alignEnd?: boolean
}

const COLUMNS: Column[] = [
  { key: 'title', label: 'Title' },
  { key: 'status', label: 'Status' },
  { key: 'priority', label: 'Priority' },
  { key: null, label: 'Assignee' },
  { key: null, label: 'Client' },
  { key: 'dueDate', label: 'Due date' },
]

const EMPTY_CELL = '—'

/** Due-date cell: compact label ("Overdue" in red, "Aug 21" otherwise). */
function DueDateBadge({ dueDate }: { dueDate: string }) {
  const due = dueLabel(dueDate)
  // Unreachable with a non-null date (dueDate is date-only) — defensive.
  if (due.kind === 'none') return <>{EMPTY_CELL}</>
  return <Badge variant={due.kind === 'overdue' ? 'error' : 'neutral'}>{due.label}</Badge>
}

export function TaskTable({
  status,
  tasks,
  errorMessage,
  onRetry,
  hasFilters,
  onClearFilters,
  sort,
  order,
  onSort,
  onRowClick,
}: TaskTableProps) {
  if (status === 'loading') {
    return (
      <div className="skeleton-row" role="status" aria-label="Loading tasks">
        <Skeleton />
        <Skeleton />
        <Skeleton />
        <Skeleton />
        <Skeleton />
      </div>
    )
  }

  if (status === 'error') {
    return (
      <ErrorState
        title="Could not load tasks"
        message={errorMessage}
        onRetry={onRetry}
      />
    )
  }

  if (status === 'empty') {
    return hasFilters ? (
      <EmptyState
        title="No tasks match your filters"
        description="Try a different search term or clear the filters."
        action={
          <Button variant="secondary" onClick={onClearFilters}>
            Clear filters
          </Button>
        }
      />
    ) : (
      <EmptyState
        title="No tasks yet"
        description="Create your first task on the board to start tracking work."
      />
    )
  }

  const sortedColumn: TaskSortField | null = sort
  const direction = order

  return (
    <div className="table-wrap table-responsive">
      <table className="data-table">
        <caption className="sr-only">Tasks</caption>
        <thead>
          <tr>
            {COLUMNS.map((column) => {
              const isSortable = column.key !== null
              const isActive = isSortable && sortedColumn === column.key
              return (
                <th
                  key={column.label}
                  scope="col"
                  aria-sort={
                    isSortable
                      ? isActive
                        ? direction === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : 'none'
                      : undefined
                  }
                >
                  {isSortable ? (
                    <button
                      type="button"
                      className="data-table__sort"
                      aria-label={`Sort by ${column.label}${isActive ? `, ${direction === 'asc' ? 'ascending' : 'descending'}` : ''}`}
                      onClick={() => onSort(column.key as TaskSortField)}
                    >
                      {column.label}
                      {isActive && (
                        <span className="data-table__sort-indicator" aria-hidden="true">
                          {direction === 'asc' ? <IconArrowUp /> : <IconArrowDown />}
                        </span>
                      )}
                    </button>
                  ) : (
                    column.label
                  )}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => (
            <tr
              key={task.id}
              data-clickable="true"
              onClick={(event) => {
                // Let the title link handle its own navigation (no double push).
                if ((event.target as HTMLElement).closest('a')) return
                onRowClick(task)
              }}
            >
              <td>
                <Link to={`/tasks/${task.id}`} className="data-table__primary">
                  {task.title}
                </Link>
              </td>
              <td>
                <StatusBadge status={task.status} />
              </td>
              <td>
                <PriorityBadge priority={task.priority} />
              </td>
              <td>{task.assignee?.name ?? EMPTY_CELL}</td>
              <td>{task.client?.companyName ?? EMPTY_CELL}</td>
              <td>{task.dueDate ? <DueDateBadge dueDate={task.dueDate} /> : EMPTY_CELL}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
