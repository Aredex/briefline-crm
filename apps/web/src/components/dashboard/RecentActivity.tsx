/*
 * RecentActivity (DASH-003) — visible TaskChange events, newest first
 * (archived tasks are excluded server-side). Renders as "actor verb task"
 * with a relative timestamp; the task title deep-links to /tasks/:taskId.
 * Own query → partial error keeps the other sections alive.
 */
import { Link } from 'react-router'
import type { TaskChangeEvent } from '../../api/types'
import { useRecentActivityQuery } from '../../hooks/useDashboardQueries'
import { formatRelativeDate } from '../../lib/format'
import { EmptyState } from '../ui/EmptyState'
import { ErrorState } from '../ui/ErrorState'
import { Skeleton } from '../ui/Skeleton'
import './Dashboard.css'

const LIMIT = 10

const EVENT_VERB: Record<TaskChangeEvent, string> = {
  CREATED: 'created',
  TITLE_CHANGED: 'renamed',
  STATUS_CHANGED: 'changed the status of',
  PRIORITY_CHANGED: 'changed the priority of',
  ASSIGNEE_CHANGED: 'changed the assignee of',
  DUE_DATE_CHANGED: 'changed the due date of',
  ARCHIVED: 'archived',
  REOPENED: 'reopened',
}

export function RecentActivity() {
  const query = useRecentActivityQuery(LIMIT)
  const items = query.data?.data ?? []

  return (
    <section className="dashboard-section" aria-label="Recent activity">
      <div className="dashboard-section__header">
        <h2 className="dashboard-section__title">Recent activity</h2>
      </div>

      {query.isPending && (
        <div className="skeleton-row" role="status" aria-label="Loading recent activity">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} />
          ))}
        </div>
      )}

      {query.isError && (
        <ErrorState
          title="Could not load recent activity"
          message={query.error instanceof Error ? query.error.message : undefined}
          onRetry={() => void query.refetch()}
        />
      )}

      {query.isSuccess && items.length === 0 && (
        <EmptyState title="No recent activity" description="Task changes will appear here." />
      )}

      {query.isSuccess && items.length > 0 && (
        <ol className="recent-activity">
          {items.map((item) => (
            <li key={item.id} className="recent-activity__item">
              <p className="recent-activity__line">
                <span className="recent-activity__actor">{item.actorName}</span>{' '}
                {EVENT_VERB[item.type]}{' '}
                <Link to={`/tasks/${item.taskId}`} className="recent-activity__task">
                  {item.taskTitle}
                </Link>
              </p>
              <time className="recent-activity__time" dateTime={item.occurredAt}>
                {formatRelativeDate(item.occurredAt)}
              </time>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
