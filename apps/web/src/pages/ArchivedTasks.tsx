/*
 * ArchivedTasks (TASK-FE-009) — admin-only listing (route guard requireAdmin)
 * with server pagination. Each row deep-links to /tasks/:taskId, where the
 * detail drawer renders the archived task read-only with a banner. Empty and
 * error states included; the table degrades to stacked cards below 768px.
 */
import { useState } from 'react'
import { Link } from 'react-router'
import { useArchivedTasksQuery } from '../hooks/useTaskQueries'
import { formatAbsoluteDate } from '../lib/format'
import { PriorityBadge, StatusBadge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { ErrorState } from '../components/ui/ErrorState'
import { Skeleton } from '../components/ui/Skeleton'
import { IconArrowLeft } from '../components/ui/icons'

const PAGE_SIZE = 20

export function ArchivedTasks() {
  const [page, setPage] = useState(1)
  const query = useArchivedTasksQuery(page)

  const meta = query.data?.meta
  const totalPages = meta ? Math.max(1, Math.ceil(meta.total / PAGE_SIZE)) : 1

  return (
    <>
      <header className="page-header">
        <div>
          <Link to="/tasks" className="page-header__back">
            <IconArrowLeft /> Back to tasks
          </Link>
          <h1 className="page-header__title">Archived tasks</h1>
        </div>
      </header>

      {query.isPending && (
        <div className="skeleton-row" role="status" aria-label="Loading archived tasks">
          <Skeleton />
          <Skeleton />
          <Skeleton />
        </div>
      )}

      {query.isError && (
        <ErrorState
          title="Could not load archived tasks"
          message={query.error instanceof Error ? query.error.message : undefined}
          onRetry={() => void query.refetch()}
        />
      )}

      {query.isSuccess && query.data.data.length === 0 && (
        <EmptyState
          title="No archived tasks"
          description="Tasks you archive will appear here."
          action={
            <Button variant="secondary" onClick={() => setPage(1)}>
              Refresh
            </Button>
          }
        />
      )}

      {query.isSuccess && query.data.data.length > 0 && (
        <>
          <div className="table-wrap table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Status</th>
                  <th>Priority</th>
                  <th>Client</th>
                  <th>Due date</th>
                  <th>Assignee</th>
                  <th>Archived</th>
                </tr>
              </thead>
              <tbody>
                {query.data.data.map((task) => (
                  <tr key={task.id}>
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
                    <td>{task.client?.companyName ?? '—'}</td>
                    <td>{task.dueDate ? formatAbsoluteDate(task.dueDate) : '—'}</td>
                    <td>{task.assignee?.name ?? '—'}</td>
                    <td>
                      <span className="data-table__secondary">
                        {formatAbsoluteDate(task.archivedAt ?? task.updatedAt)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="data-cards">
            {query.data.data.map((task) => (
              <div className="data-card" key={task.id}>
                <Link to={`/tasks/${task.id}`} className="data-table__primary">
                  {task.title}
                </Link>
                <div className="data-card__badges">
                  <StatusBadge status={task.status} />
                  <PriorityBadge priority={task.priority} />
                </div>
                <div className="data-card__row">
                  <span className="data-card__label">Client</span>
                  <span>{task.client?.companyName ?? '—'}</span>
                </div>
                <div className="data-card__row">
                  <span className="data-card__label">Due</span>
                  <span>{task.dueDate ? formatAbsoluteDate(task.dueDate) : '—'}</span>
                </div>
                <div className="data-card__row">
                  <span className="data-card__label">Assignee</span>
                  <span>{task.assignee?.name ?? '—'}</span>
                </div>
              </div>
            ))}
          </div>

          <nav className="pagination" aria-label="Archived tasks pagination">
            <p className="pagination__info">
              Page {meta?.page} of {totalPages} · {meta?.total} archived task
              {meta?.total === 1 ? '' : 's'}
            </p>
            <div className="pagination__controls">
              <Button
                variant="secondary"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((value) => value - 1)}
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((value) => value + 1)}
              >
                Next
              </Button>
            </div>
          </nav>
        </>
      )}
    </>
  )
}
