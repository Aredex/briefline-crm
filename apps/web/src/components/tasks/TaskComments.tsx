/*
 * TaskComments (PC-03, COMM-001) — append-only discussion thread.
 *
 * Timeline with the author avatar on the left; the server returns the thread
 * newest first (contractual sort), so the list renders as-is. The composer is
 * gated by the task edit policy (BR-013/014) — a read-only viewer still reads
 * the thread but cannot post. Content is trimmed at the boundary and capped at
 * 2000 chars (mirror of the API's @db.VarChar(2000)).
 */
import { useState, type FormEvent } from 'react'
import { ApiError } from '../../api/client'
import type { CommentResponse } from '../../api/types'
import { formatRelativeDate } from '../../lib/format'
import { serverErrorDetail, serverErrorTitle } from '../../lib/api-errors'
import { Button } from '../ui/Button'
import { EmptyState } from '../ui/EmptyState'
import { ErrorState } from '../ui/ErrorState'
import { Skeleton } from '../ui/Skeleton'
import { Textarea } from '../ui/Textarea'
import { useTaskCommentsQuery } from '../../hooks/useTaskQueries'
import { useAddComment } from '../../hooks/useTaskMutations'
import './TaskComments.css'

export interface TaskCommentsProps {
  taskId: string
  /** BR-013/014 — admin, creator, or assignee may comment. */
  canEdit: boolean
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function CommentItem({ comment }: { comment: CommentResponse }) {
  return (
    <li className="task-comments__item">
      <span className="task-comments__avatar" aria-hidden="true">
        {initials(comment.author.name)}
      </span>
      <div className="task-comments__body">
        <p className="task-comments__meta">
          <span className="task-comments__author">{comment.author.name}</span>
          <time className="task-comments__date" dateTime={comment.createdAt}>
            {formatRelativeDate(comment.createdAt)}
          </time>
        </p>
        <p className="task-comments__content">{comment.content}</p>
      </div>
    </li>
  )
}

export function TaskComments({ taskId, canEdit }: TaskCommentsProps) {
  const query = useTaskCommentsQuery(taskId)
  const addComment = useAddComment()

  const [content, setContent] = useState('')
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    const trimmed = content.trim()
    if (!trimmed) {
      setFieldError('Comment is required.')
      return
    }
    if (trimmed.length > 2000) {
      setFieldError('Comments are limited to 2000 characters.')
      return
    }
    setFieldError(null)
    setSubmitError(null)
    addComment.mutate(
      { taskId, content: trimmed },
      {
        onSuccess: () => setContent(''),
        onError: (error) => {
          setSubmitError(error instanceof ApiError ? serverErrorDetail(error) : serverErrorTitle(error))
        },
      },
    )
  }

  if (query.isPending) {
    return (
      <div className="task-comments__loading" role="status" aria-label="Loading comments">
        <Skeleton />
        <Skeleton />
        <Skeleton />
      </div>
    )
  }

  if (query.isError) {
    return (
      <ErrorState
        title="Could not load comments"
        message={query.error instanceof Error ? query.error.message : undefined}
        onRetry={() => void query.refetch()}
      />
    )
  }

  const comments = query.data?.data ?? []
  const hasThread = Boolean(query.data && query.data.meta.total > 0)

  return (
    <div className="task-comments">
      {hasThread ? (
        <ol className="task-comments__list" aria-label="Comments">
          {comments.map((comment) => (
            <CommentItem key={comment.id} comment={comment} />
          ))}
        </ol>
      ) : (
        <EmptyState title="No comments yet" description="Start the discussion on this task." />
      )}

      {canEdit && (
        <form className="task-comments__composer" onSubmit={handleSubmit} noValidate>
          {submitError && (
            <p className="task-comments__error" role="alert">
              {submitError}
            </p>
          )}
          <Textarea
            label="Add a comment"
            rows={2}
            value={content}
            error={fieldError ?? undefined}
            maxLength={2000}
            onChange={(event) => {
              setContent(event.target.value)
              if (fieldError) setFieldError(null)
            }}
          />
          <div className="task-comments__actions">
            <Button type="submit" size="sm" isLoading={addComment.isPending} disabled={!content.trim()}>
              Add comment
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}
