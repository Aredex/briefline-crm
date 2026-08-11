/*
 * MyTasks (DASH-002) — the current user's assigned tasks (server-sorted:
 * priority desc, due asc). Title + priority/status badges + due label, each
 * row deep-links to /tasks/:taskId (DASH-004). Own query → a failure here
 * never hides the other dashboard sections (partial error).
 */
import { Link } from 'react-router'
import { useMyTasksQuery } from '../../hooks/useDashboardQueries'
import { dueLabel } from '../../lib/format'
import { PriorityBadge, StatusBadge } from '../ui/Badge'
import { EmptyState } from '../ui/EmptyState'
import { ErrorState } from '../ui/ErrorState'
import { Skeleton } from '../ui/Skeleton'
import { IconClock } from '../ui/icons'
import './Dashboard.css'

const LIMIT = 8

function dueMeta(due: string | null) {
  const label = dueLabel(due)
  if (label.kind === 'none') return null
  return (
    <span className={`my-tasks__due my-tasks__due--${label.kind}`}>
      <IconClock /> <span>{label.label}</span>
    </span>
  )
}

export function MyTasks() {
  const query = useMyTasksQuery(LIMIT)
  const tasks = query.data?.data ?? []

  return (
    <section className="dashboard-section" aria-label="My tasks">
      <div className="dashboard-section__header">
        <h2 className="dashboard-section__title">My Tasks</h2>
        <Link to="/tasks" className="dashboard-section__link">
          View all
        </Link>
      </div>

      {query.isPending && (
        <div className="skeleton-row" role="status" aria-label="Loading my tasks">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} />
          ))}
        </div>
      )}

      {query.isError && (
        <ErrorState
          title="Could not load your tasks"
          message={query.error instanceof Error ? query.error.message : undefined}
          onRetry={() => void query.refetch()}
        />
      )}

      {query.isSuccess && tasks.length === 0 && (
        <EmptyState
          title="No tasks assigned to you"
          description="Tasks assigned to you will appear here."
        />
      )}

      {query.isSuccess && tasks.length > 0 && (
        <ul className="my-tasks">
          {tasks.map((task) => (
            <li key={task.id} className="my-tasks__item">
              <Link to={`/tasks/${task.id}`} className="my-tasks__title">
                {task.title}
              </Link>
              <div className="my-tasks__meta">
                <PriorityBadge priority={task.priority} />
                <StatusBadge status={task.status} />
                {dueMeta(task.dueDate)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
