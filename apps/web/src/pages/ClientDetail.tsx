/*
 * ClientDetail — CLI-FE-003. Header card (company name + industry + status
 * badge), contact & details card, related tasks card with client-side
 * pagination. Archived clients render read-only with a banner (FR-CLI-006);
 * admins get Edit / Deactivate / Archive actions (CLI-FE-004). A fresh create
 * announces "Client created." via location state (CLI-FE-002 success).
 */
import { useState } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../api/client'
import type {
  ClientResponse,
  ClientUpdateInput,
  ClientWithTasksResponse,
  TaskSummary,
} from '../api/types'
import { useAuth } from '../providers/AuthProvider'
import { applyFieldErrors, serverErrorDetail, serverErrorTitle, type BannerError } from '../lib/api-errors'
import { formatDueDate } from '../lib/format'
import { Alert } from '../components/ui/Alert'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Drawer } from '../components/ui/Drawer'
import { ErrorState } from '../components/ui/ErrorState'
import { Skeleton } from '../components/ui/Skeleton'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { IconArrowLeft } from '../components/ui/icons'
import { PriorityBadge, StatusBadge } from '../components/ui/Badge'
import { ClientForm, type ClientFormProps } from '../components/clients/ClientForm'
import { ClientStatusBadge } from '../components/clients/ClientStatusBadge'

const PAGE_SIZE = 5

export function ClientDetail() {
  const { clientId } = useParams()
  const { user } = useAuth()
  const isAdmin = user?.role === 'ADMIN'
  const queryClient = useQueryClient()
  const location = useLocation()
  const created = Boolean((location.state as { created?: boolean } | null)?.created)

  const [taskPage, setTaskPage] = useState(1)
  const [editOpen, setEditOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [deactivateOpen, setDeactivateOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(created ? 'Client created.' : null)
  const [bannerError, setBannerError] = useState<BannerError | null>(null)

  const query = useQuery({
    queryKey: ['clients', clientId],
    queryFn: () => api.get<ClientWithTasksResponse>(`/clients/${clientId}`),
    enabled: Boolean(clientId),
  })

  const client = query.data?.client
  const relatedTasks = query.data?.relatedTasks ?? null

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['clients'] })
    void queryClient.invalidateQueries({ queryKey: ['clients', clientId] })
  }

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ClientUpdateInput }) =>
      api.patch<ClientResponse>(`/clients/${id}`, payload),
    onSuccess: () => {
      setEditOpen(false)
      setBannerError(null)
      setNotice('Client updated.')
      invalidate()
    },
  })

  const archiveMutation = useMutation({
    mutationFn: (id: string) => api.post<ClientResponse>(`/clients/${id}/archive`, {}),
    onSuccess: () => {
      setArchiveOpen(false)
      setBannerError(null)
      setNotice('Client archived.')
      invalidate()
    },
  })

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => api.post<ClientResponse>(`/clients/${id}/deactivate`, {}),
    onSuccess: () => {
      setDeactivateOpen(false)
      setBannerError(null)
      setNotice('Client deactivated.')
      invalidate()
    },
  })

  const handleUpdateSubmit: ClientFormProps['onSubmit'] = async (values, form) => {
    if (!client) return
    setBannerError(null)
    try {
      await updateMutation.mutateAsync({
        id: client.id,
        payload: {
          companyName: values.companyName,
          industry: values.industry || undefined,
          contactName: values.contactName,
          contactEmail: values.contactEmail,
          phone: values.phone ? values.phone : null,
          notes: values.notes ? values.notes : null,
        },
      })
    } catch (caught) {
      if (!applyFieldErrors(form, caught)) {
        setBannerError({ title: serverErrorTitle(caught), detail: serverErrorDetail(caught) })
      }
    }
  }

  const taskTotal = relatedTasks?.meta.total ?? 0
  const taskStart = taskTotal === 0 ? 0 : (taskPage - 1) * PAGE_SIZE + 1
  const taskEnd = Math.min(taskStart + PAGE_SIZE - 1, taskTotal)
  const visibleTasks: TaskSummary[] = relatedTasks
    ? relatedTasks.data.slice(taskStart - 1, taskEnd)
    : []

  const renderTaskRow = (task: TaskSummary) => (
    <li key={task.id}>
      <div className="task-row">
        <Link to={`/tasks/${task.id}`} className="task-row__title">
          {task.title}
        </Link>
        <PriorityBadge priority={task.priority} />
        <StatusBadge status={task.status} />
        <span className="task-row__meta">{task.assignee?.name ?? 'Unassigned'}</span>
        <span className="task-row__meta">{formatDueDate(task.dueDate)}</span>
      </div>
    </li>
  )

  if (query.isPending) {
    return (
      <div className="skeleton-row" role="status" aria-label="Loading client">
        <Skeleton />
        <Skeleton />
        <Skeleton />
      </div>
    )
  }

  if (query.isError) {
    const error = query.error
    const notFound = error instanceof ApiError && error.status === 404
    return (
      <ErrorState
        title={notFound ? 'Client not found' : 'Could not load client'}
        message={notFound ? 'The requested client does not exist or is not visible to you.' : error.message}
        onRetry={notFound ? undefined : () => void query.refetch()}
      />
    )
  }

  if (!client) return null

  const archived = client.status === 'ARCHIVED'

  return (
    <>
      <Link to="/clients" className="page-header__back">
        <IconArrowLeft /> Back to clients
      </Link>

      <div className="detail-header">
        <div className="detail-header__left">
          <h1 className="detail-header__title">{client.companyName}</h1>
          <div className="detail-header__badges">
            {client.industry && <span className="detail-header__subtitle">{client.industry}</span>}
            <ClientStatusBadge status={client.status} />
          </div>
        </div>
        {isAdmin && !archived && (
          <div className="page-header__actions">
            <Button variant="secondary" onClick={() => setEditOpen(true)}>
              Edit
            </Button>
            {client.status === 'ACTIVE' && (
              <Button variant="ghost" onClick={() => setDeactivateOpen(true)}>
                Deactivate
              </Button>
            )}
            <Button variant="ghost" onClick={() => setArchiveOpen(true)}>
              Archive
            </Button>
          </div>
        )}
      </div>

      {notice && (
        <Alert variant="success" role="status" title={notice} className="alert--page" />
      )}
      {bannerError && (
        <Alert variant="error" title={bannerError.title} className="alert--page">
          {bannerError.detail}
        </Alert>
      )}
      {archived && (
        <Alert variant="info" title="This client is archived and read-only." className="alert--page">
          It can't be linked to new tasks.
        </Alert>
      )}

      <div className="detail-grid">
        <Card header={<h2 className="card__title">Contact &amp; details</h2>}>
          <ul className="detail-list">
            <li>
              <div className="detail-list__label">Primary contact</div>
              <div className="detail-list__value">{client.contactName}</div>
            </li>
            <li>
              <div className="detail-list__label">Email</div>
              <div className="detail-list__value">
                <a href={`mailto:${client.contactEmail}`}>{client.contactEmail}</a>
              </div>
            </li>
            <li>
              <div className="detail-list__label">Phone</div>
              <div className="detail-list__value">{client.phone ?? '—'}</div>
            </li>
            <li>
              <div className="detail-list__label">Notes</div>
              <div className="detail-list__value">{client.notes ?? '—'}</div>
            </li>
            <li>
              <div className="detail-list__label">Created by</div>
              <div className="detail-list__value">{client.createdBy.name}</div>
            </li>
          </ul>
        </Card>

        <Card
          header={
            <h2 className="card__title">
              Tasks <span className="data-table__secondary">({taskTotal})</span>
            </h2>
          }
        >
          {taskTotal === 0 ? (
            <p className="empty-state__description">No tasks are linked to this client yet.</p>
          ) : (
            <>
              <ul className="detail-list">{visibleTasks.map(renderTaskRow)}</ul>
              {taskTotal > PAGE_SIZE && (
                <nav className="pagination" aria-label="Related tasks pagination">
                  <p className="pagination__info">
                    {taskStart}–{taskEnd} of {taskTotal}
                  </p>
                  <div className="pagination__controls">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={taskPage <= 1}
                      onClick={() => setTaskPage((current) => current - 1)}
                    >
                      Previous
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={taskEnd >= taskTotal}
                      onClick={() => setTaskPage((current) => current + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </nav>
              )}
            </>
          )}
        </Card>
      </div>

      {/* Edit drawer (CLI-FE-004) */}
      <Drawer open={editOpen} onClose={() => setEditOpen(false)} title="Edit client" width={480}>
        <ClientForm
          values={{
            companyName: client.companyName,
            industry: client.industry,
            contactName: client.contactName,
            contactEmail: client.contactEmail,
            phone: client.phone ?? '',
            notes: client.notes ?? '',
          }}
          submitLabel="Save changes"
          isSubmitting={updateMutation.isPending}
          error={bannerError}
          onSubmit={handleUpdateSubmit}
        />
      </Drawer>

      {/* Archive confirm */}
      <ConfirmDialog
        open={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        title={`Archive ${client.companyName}?`}
        description="No new tasks can be linked to an archived client."
        confirmLabel="Archive"
        danger
        isLoading={archiveMutation.isPending}
        onConfirm={() => void archiveMutation.mutate(client.id)}
      />

      {/* Deactivate confirm */}
      <ConfirmDialog
        open={deactivateOpen}
        onClose={() => setDeactivateOpen(false)}
        title={`Deactivate ${client.companyName}?`}
        description="Existing tasks stay linked; it won't accept new activity."
        confirmLabel="Deactivate"
        danger
        isLoading={deactivateMutation.isPending}
        onConfirm={() => void deactivateMutation.mutate(client.id)}
      />
    </>
  )
}
