/*
 * TaskChecklist (PC-05, CHECK-001/002) — checkbox list with progress in the
 * header, inline add, and a subtle remove affordance.
 *
 * Toggles and content edits are CAS-guarded by expectedVersion (ADR-004): a
 * 409 STALE_VERSION surfaces the "modified, please refresh" notice and
 * re-reads the checklist so the UI never silently diverges from the server.
 * Mutations are gated by the task edit policy (BR-013/014); viewers can read
 * and tick nothing.
 */
import { useState, type FormEvent } from 'react'
import { ApiError } from '../../api/client'
import { serverErrorDetail, serverErrorTitle } from '../../lib/api-errors'
import { useTaskChecklistQuery } from '../../hooks/useTaskQueries'
import {
  useAddChecklistItem,
  useDeleteChecklistItem,
  useUpdateChecklistItem,
} from '../../hooks/useTaskMutations'
import { Button } from '../ui/Button'
import { EmptyState } from '../ui/EmptyState'
import { ErrorState } from '../ui/ErrorState'
import { IconX } from '../ui/icons'
import { Input } from '../ui/Input'
import { Skeleton } from '../ui/Skeleton'
import './TaskChecklist.css'

export interface TaskChecklistProps {
  taskId: string
  /** BR-013/014 — admin, creator, or assignee may edit the checklist. */
  canEdit: boolean
}

export function TaskChecklist({ taskId, canEdit }: TaskChecklistProps) {
  const checklistQuery = useTaskChecklistQuery(taskId)
  const addItem = useAddChecklistItem()
  const updateItem = useUpdateChecklistItem()
  const deleteItem = useDeleteChecklistItem()

  const [newItem, setNewItem] = useState('')
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const items = checklistQuery.data ?? []
  const completedCount = items.filter((item) => item.completed).length

  const handleToggle = (itemId: string, completed: boolean, version: number) => {
    setNotice(null)
    setBusyId(itemId)
    updateItem.mutate(
      { taskId, itemId, patch: { completed: !completed, expectedVersion: version } },
      { onError: handleMutationError, onSettled: () => setBusyId(null) },
    )
  }

  const handleDelete = (itemId: string) => {
    setNotice(null)
    setBusyId(itemId)
    deleteItem.mutate(
      { taskId, itemId },
      { onError: handleMutationError, onSettled: () => setBusyId(null) },
    )
  }

  /** 409 STALE_VERSION → tell the user and re-read; anything else → surface it. */
  const handleMutationError = (error: unknown) => {
    if (error instanceof ApiError && error.status === 409) {
      setNotice('This item was modified, please refresh')
      void checklistQuery.refetch()
      return
    }
    setNotice(error instanceof Error ? serverErrorDetail(error) || serverErrorTitle(error) : 'Could not update the checklist.')
  }

  const handleAdd = (event: FormEvent) => {
    event.preventDefault()
    const trimmed = newItem.trim()
    if (!trimmed) {
      setFieldError('Item is required.')
      return
    }
    if (trimmed.length > 500) {
      setFieldError('Items are limited to 500 characters.')
      return
    }
    setFieldError(null)
    setNotice(null)
    addItem.mutate(
      { taskId, content: trimmed },
      {
        onSuccess: () => setNewItem(''),
        onError: handleMutationError,
      },
    )
  }

  if (checklistQuery.isPending) {
    return (
      <div className="task-checklist__loading" role="status" aria-label="Loading checklist">
        <Skeleton />
        <Skeleton />
        <Skeleton />
      </div>
    )
  }

  if (checklistQuery.isError) {
    return (
      <ErrorState
        title="Could not load the checklist"
        message={checklistQuery.error instanceof Error ? checklistQuery.error.message : undefined}
        onRetry={() => void checklistQuery.refetch()}
      />
    )
  }

  return (
    <div className="task-checklist">
      <p className="task-checklist__progress">
        {completedCount}/{items.length} completed
      </p>

      {notice && (
        <p className="task-checklist__notice" role="alert">
          {notice}
        </p>
      )}

      {items.length === 0 ? (
        <EmptyState title="No checklist items" description="Break the work down into checkable steps." />
      ) : (
        <ul className="task-checklist__items">
          {items.map((item) => (
            <li key={item.id} className="task-checklist__item">
              <label className="task-checklist__label">
                <input
                  type="checkbox"
                  checked={item.completed}
                  disabled={!canEdit || busyId === item.id}
                  onChange={() => handleToggle(item.id, item.completed, item.version)}
                />
                <span
                  className={
                    item.completed
                      ? 'task-checklist__content task-checklist__content--done'
                      : 'task-checklist__content'
                  }
                >
                  {item.content}
                </span>
              </label>
              {canEdit && (
                <button
                  type="button"
                  className="task-checklist__remove"
                  aria-label={`Delete item "${item.content}"`}
                  disabled={busyId === item.id}
                  onClick={() => handleDelete(item.id)}
                >
                  <IconX width={14} height={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && (
        <form className="task-checklist__add" onSubmit={handleAdd} noValidate>
          <Input
            label="New item"
            value={newItem}
            error={fieldError ?? undefined}
            maxLength={500}
            inputClassName="task-checklist__add-input"
            onChange={(event) => {
              setNewItem(event.target.value)
              if (fieldError) setFieldError(null)
            }}
          />
          <Button type="submit" size="sm" isLoading={addItem.isPending} disabled={!newItem.trim()}>
            Add
          </Button>
        </form>
      )}
    </div>
  )
}
