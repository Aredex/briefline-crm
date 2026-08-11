/*
 * TaskHistory (TASK-FE-007) — append-only change timeline: actor, date, event
 * badge and old → new values. Values arrive JSON-encoded; parsing has a
 * fallback so malformed entries never crash the timeline. Immutable UI — no
 * actions, only a readable audit trail.
 */
import type { TaskChange, TaskChangeEvent } from '../../api/types'
import { PRIORITY_LABELS, STATUS_LABELS } from '../ui/Badge'
import { Skeleton } from '../ui/Skeleton'
import { ErrorState } from '../ui/ErrorState'
import { EmptyState } from '../ui/EmptyState'
import { useTaskHistoryQuery } from '../../hooks/useTaskQueries'
import './TaskHistory.css'

const EVENT_LABEL: Record<TaskChangeEvent, string> = {
  CREATED: 'Created',
  TITLE_CHANGED: 'Title changed',
  STATUS_CHANGED: 'Status changed',
  PRIORITY_CHANGED: 'Priority changed',
  ASSIGNEE_CHANGED: 'Assignee changed',
  DUE_DATE_CHANGED: 'Due date changed',
  ARCHIVED: 'Archived',
  REOPENED: 'Reopened',
}

const EVENT_VARIANT: Record<TaskChangeEvent, 'created' | 'updated' | 'archived'> = {
  CREATED: 'created',
  TITLE_CHANGED: 'updated',
  STATUS_CHANGED: 'updated',
  PRIORITY_CHANGED: 'updated',
  ASSIGNEE_CHANGED: 'updated',
  DUE_DATE_CHANGED: 'updated',
  ARCHIVED: 'archived',
  REOPENED: 'updated',
}

/** Fields the UI can render with friendly labels. */
const FIELD_LABEL: Record<string, string> = {
  title: 'Title',
  description: 'Description',
  status: 'Status',
  priority: 'Priority',
  assigneeId: 'Assignee',
  clientId: 'Client',
  dueDate: 'Due date',
  blockedReason: 'Blocked reason',
}

function decode(value: string | null): string | null {
  if (value === null) return null
  try {
    const parsed: unknown = JSON.parse(value)
    if (parsed === null || parsed === undefined) return null
    return typeof parsed === 'string' ? parsed : JSON.stringify(parsed)
  } catch {
    return value // keep the raw string rather than lying about content
  }
}

/** Map raw values to display labels where the contract defines them. */
function displayValue(field: string | null, raw: string | null): string {
  const value = decode(raw)
  if (value === null) return 'none'
  if (field === 'status' && value in STATUS_LABELS) return STATUS_LABELS[value as keyof typeof STATUS_LABELS]
  if (field === 'priority' && value in PRIORITY_LABELS) return PRIORITY_LABELS[value as keyof typeof PRIORITY_LABELS]
  if (field === 'dueDate') return value
  if (field === 'assigneeId') return `${value.slice(0, 8)}…` // names aren't in the timeline payload
  return value
}

function formatDateTime(iso: string): string {
  const date = new Date(iso)
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][date.getMonth()]
  const year = date.getFullYear() === new Date().getFullYear() ? '' : `, ${date.getFullYear()}`
  return `${month} ${date.getDate()}${year}, ${date.getHours()}:${minutes}`
}

function TimelineEntry({ change }: { change: TaskChange }) {
  const field = change.field ? (FIELD_LABEL[change.field] ?? change.field) : null
  const oldValue = displayValue(change.field, change.oldValue)
  const newValue = displayValue(change.field, change.newValue)
  const hasChange = change.event !== 'CREATED' && change.event !== 'ARCHIVED'
  const variant = EVENT_VARIANT[change.event]

  return (
    <li className="task-history__item">
      <span className={`task-history__badge task-history__badge--${variant}`}>
        {EVENT_LABEL[change.event]}
      </span>
      <div className="task-history__content">
        <p className="task-history__summary">
          {change.actor.name} {EVENT_LABEL[change.event].toLowerCase()}
          {field ? ` ${field}` : ''} this task
        </p>
        {hasChange && (
          <p className="task-history__values">
            <span className="task-history__value">{oldValue}</span>
            <span className="task-history__arrow" aria-hidden="true">
              →
            </span>
            <span className="task-history__value">{newValue}</span>
          </p>
        )}
        <time className="task-history__date" dateTime={change.createdAt}>
          {formatDateTime(change.createdAt)}
        </time>
      </div>
    </li>
  )
}

export interface TaskHistoryProps {
  taskId: string
}

export function TaskHistory({ taskId }: TaskHistoryProps) {
  const query = useTaskHistoryQuery(taskId)

  if (query.isPending) {
    return (
      <div className="task-history__loading" role="status" aria-label="Loading task history">
        <Skeleton />
        <Skeleton />
        <Skeleton />
      </div>
    )
  }

  if (query.isError) {
    return (
      <ErrorState
        title="Could not load task history"
        message={query.error instanceof Error ? query.error.message : undefined}
        onRetry={() => void query.refetch()}
      />
    )
  }

  if (!query.data || query.data.meta.total === 0) {
    return <EmptyState title="No history yet" description="Changes to this task will appear here." />
  }

  return (
    <ol className="task-history" aria-label="Task history">
      {query.data.data.map((change) => (
        <TimelineEntry key={change.id} change={change} />
      ))}
    </ol>
  )
}
