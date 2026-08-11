/*
 * ClientList — CLI-FE-001: search (debounced 300ms), status filter
 * (Archived only for admins, BR-005), paginated table ≥768px / stacked cards
 * below, skeleton/empty/filtered-empty/error states, and admin-only
 * Edit / Deactivate / Archive actions (CLI-FE-004). Members are read-only.
 */
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import type {
  ClientResponse,
  ClientStatus,
  ClientUpdateInput,
  Paginated,
} from '../api/types'
import { useAuth } from '../providers/AuthProvider'
import { applyFieldErrors, serverErrorDetail, serverErrorTitle, type BannerError } from '../lib/api-errors'
import { formatRelativeDate } from '../lib/format'
import { Alert } from '../components/ui/Alert'
import { Button } from '../components/ui/Button'
import { Drawer } from '../components/ui/Drawer'
import { EmptyState } from '../components/ui/EmptyState'
import { ErrorState } from '../components/ui/ErrorState'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { Skeleton } from '../components/ui/Skeleton'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { IconPlus, IconSearch } from '../components/ui/icons'
import { ClientForm, type ClientFormProps } from '../components/clients/ClientForm'
import { ClientStatusBadge } from '../components/clients/ClientStatusBadge'

const PAGE_SIZE = 10

const STATUS_FILTERS: { value: '' | ClientStatus; label: string }[] = [
  { value: '', label: 'All statuses' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
]

export function ClientList() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'ADMIN'
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [status, setStatus] = useState<'' | ClientStatus>('')
  const [page, setPage] = useState(1)
  const [editTarget, setEditTarget] = useState<ClientResponse | null>(null)
  const [archiveTarget, setArchiveTarget] = useState<ClientResponse | null>(null)
  const [deactivateTarget, setDeactivateTarget] = useState<ClientResponse | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [bannerError, setBannerError] = useState<BannerError | null>(null)

  // Debounce the search input (300ms) and reset pagination on any filter change.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, status])

  const listQuery = useQuery({
    queryKey: ['clients', { q: debouncedSearch, status, page }],
    queryFn: () =>
      api.get<Paginated<ClientResponse>>('/clients', {
        params: {
          q: debouncedSearch || undefined,
          status: status || undefined,
          page,
          limit: PAGE_SIZE,
        },
      }),
  })

  const invalidateClients = () => queryClient.invalidateQueries({ queryKey: ['clients'] })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ClientUpdateInput }) =>
      api.patch<ClientResponse>(`/clients/${id}`, payload),
    onSuccess: () => {
      setEditTarget(null)
      setBannerError(null)
      setNotice('Client updated.')
      void invalidateClients()
    },
  })

  const archiveMutation = useMutation({
    mutationFn: (id: string) => api.post<ClientResponse>(`/clients/${id}/archive`, {}),
    onSuccess: () => {
      setArchiveTarget(null)
      setBannerError(null)
      setNotice('Client archived.')
      void invalidateClients()
    },
    // 409 CLIENT_ARCHIVED (race) etc. must surface — close the dialog so the
    // banner is readable instead of hidden behind the scrim.
    onError: (caught) => {
      setArchiveTarget(null)
      setBannerError({ title: serverErrorTitle(caught), detail: serverErrorDetail(caught) })
    },
  })

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => api.post<ClientResponse>(`/clients/${id}/deactivate`, {}),
    onSuccess: () => {
      setDeactivateTarget(null)
      setBannerError(null)
      setNotice('Client deactivated.')
      void invalidateClients()
    },
    onError: (caught) => {
      setDeactivateTarget(null)
      setBannerError({ title: serverErrorTitle(caught), detail: serverErrorDetail(caught) })
    },
  })

  const handleUpdateSubmit: ClientFormProps['onSubmit'] = async (values, form) => {
    if (!editTarget) return
    setBannerError(null)
    try {
      await updateMutation.mutateAsync({
        id: editTarget.id,
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

  const hasFilters = debouncedSearch.length > 0 || status !== ''
  const meta = listQuery.data?.meta
  const total = meta?.total ?? 0
  const metaPage = meta?.page ?? 1
  const metaLimit = meta?.limit ?? 1
  const start = total === 0 ? 0 : (metaPage - 1) * metaLimit + 1
  const end = Math.min(metaPage * metaLimit, total)

  const clearFilters = () => {
    setSearch('')
    setStatus('')
  }

  const renderActions = (client: ClientResponse) => {
    if (!isAdmin || client.status === 'ARCHIVED') return null
    return (
      <div className="data-table__actions">
        <Button size="sm" variant="secondary" onClick={() => setEditTarget(client)}>
          Edit
        </Button>
        {client.status === 'ACTIVE' && (
          <Button size="sm" variant="ghost" onClick={() => setDeactivateTarget(client)}>
            Deactivate
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => setArchiveTarget(client)}>
          Archive
        </Button>
      </div>
    )
  }

  const renderClientName = (client: ClientResponse) => (
    <div>
      <Link to={`/clients/${client.id}`} className="data-table__primary">
        {client.companyName}
      </Link>
      <div className="data-table__secondary">{client.industry}</div>
    </div>
  )

  return (
    <>
      <header className="page-header">
        <h1 className="page-header__title">Clients</h1>
        <div className="page-header__actions">
          <Button size="md" leftIcon={<IconPlus />} onClick={() => navigate('/clients/new')}>
            New client
          </Button>
        </div>
      </header>

      {notice && (
        <Alert variant="success" role="status" title={notice} className="alert--page" />
      )}
      {bannerError && (
        <Alert variant="error" title={bannerError.title} className="alert--page">
          {bannerError.detail}
        </Alert>
      )}

      <div className="toolbar">
        <div className="toolbar__search">
          <Input
            label="Search clients"
            hideLabel
            type="search"
            placeholder="Search by company or contact"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            leftIcon={<IconSearch />}
          />
        </div>
        <Select
          label="Status filter"
          hideLabel
          aria-label="Filter clients by status"
          value={status}
          onChange={(event) => setStatus(event.target.value as '' | ClientStatus)}
          options={[
            ...STATUS_FILTERS,
            ...(isAdmin ? [{ value: 'ARCHIVED' as const, label: 'Archived' }] : []),
          ]}
        />
        <p className="toolbar__result" role="status">
          {listQuery.isSuccess
            ? total === 0
              ? 'No clients match your search.'
              : `Showing ${start}–${end} of ${total} clients`
            : ''}
        </p>
      </div>

      {listQuery.isPending && (
        <div className="skeleton-row" role="status" aria-label="Loading clients">
          <Skeleton />
          <Skeleton />
          <Skeleton />
          <Skeleton />
          <Skeleton />
        </div>
      )}

      {listQuery.isError && (
        <ErrorState
          title="Could not load clients"
          message={listQuery.error instanceof Error ? listQuery.error.message : undefined}
          onRetry={() => void listQuery.refetch()}
        />
      )}

      {listQuery.isSuccess && total === 0 && (
        hasFilters ? (
          <EmptyState
            title="No clients match your filters"
            description="Try a different search term or status."
            action={
              <Button variant="secondary" onClick={clearFilters}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <EmptyState
            title="No clients yet"
            description="Create your first client to start tracking work."
            action={
              <Button leftIcon={<IconPlus />} onClick={() => navigate('/clients/new')}>
                New client
              </Button>
            }
          />
        )
      )}

      {listQuery.isSuccess && total > 0 && (
        <>
          {/* Desktop table (≥768px) */}
          <div className="table-wrap table-responsive">
            <table className="data-table">
              <caption className="sr-only">Clients</caption>
              <thead>
                <tr>
                  <th scope="col">Client</th>
                  <th scope="col">Primary contact</th>
                  <th scope="col">Status</th>
                  <th scope="col">Updated</th>
                  {isAdmin && (
                    <th scope="col" className="data-table__actions">
                      <span className="sr-only">Actions</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {listQuery.data.data.map((client) => (
                  <tr key={client.id}>
                    <td>{renderClientName(client)}</td>
                    <td>
                      <div className="data-table__primary">{client.contactName}</div>
                      <div className="data-table__secondary">{client.contactEmail}</div>
                    </td>
                    <td>
                      <ClientStatusBadge status={client.status} />
                    </td>
                    <td>{formatRelativeDate(client.updatedAt)}</td>
                    {isAdmin && <td>{renderActions(client)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile stacked cards (<768px) */}
          <div className="data-cards">
            {listQuery.data.data.map((client) => (
              <div key={client.id} className="data-card">
                <div className="data-card__row">
                  {renderClientName(client)}
                  <ClientStatusBadge status={client.status} />
                </div>
                <div>
                  <div className="data-table__primary">{client.contactName}</div>
                  <div className="data-table__secondary">{client.contactEmail}</div>
                </div>
                <div className="data-card__row">
                  <span className="data-card__label">Updated</span>
                  <span>{formatRelativeDate(client.updatedAt)}</span>
                </div>
                {isAdmin && client.status !== 'ARCHIVED' && (
                  <div className="data-card__actions">{renderActions(client)}</div>
                )}
              </div>
            ))}
          </div>

          {total > PAGE_SIZE && (
            <nav className="pagination" aria-label="Clients pagination">
              <p className="pagination__info">
                Page {metaPage} of {Math.ceil(total / metaLimit)}
              </p>
              <div className="pagination__controls">
                <Button
                  variant="secondary"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  Previous
                </Button>
                <Button
                  variant="secondary"
                  disabled={page >= Math.ceil(total / metaLimit)}
                  onClick={() => setPage((current) => current + 1)}
                >
                  Next
                </Button>
              </div>
            </nav>
          )}
        </>
      )}

      {/* Edit drawer (CLI-FE-004) — name the client in the label (a11y) */}
      <Drawer
        open={editTarget !== null}
        onClose={() => setEditTarget(null)}
        title={editTarget ? `Edit ${editTarget.companyName}` : 'Edit client'}
        width={480}
      >
        {editTarget && (
          <ClientForm
            values={{
              companyName: editTarget.companyName,
              industry: editTarget.industry,
              contactName: editTarget.contactName,
              contactEmail: editTarget.contactEmail,
              phone: editTarget.phone ?? '',
              notes: editTarget.notes ?? '',
            }}
            submitLabel="Save changes"
            isSubmitting={updateMutation.isPending}
            error={bannerError}
            onSubmit={handleUpdateSubmit}
          />
        )}
      </Drawer>

      {/* Archive confirm */}
      <ConfirmDialog
        open={archiveTarget !== null}
        onClose={() => setArchiveTarget(null)}
        title={archiveTarget ? `Archive ${archiveTarget.companyName}?` : 'Archive client?'}
        description="No new tasks can be linked to an archived client."
        confirmLabel="Archive"
        danger
        isLoading={archiveMutation.isPending}
        onConfirm={() => {
          if (archiveTarget) void archiveMutation.mutate(archiveTarget.id)
        }}
      />

      {/* Deactivate confirm */}
      <ConfirmDialog
        open={deactivateTarget !== null}
        onClose={() => setDeactivateTarget(null)}
        title={deactivateTarget ? `Deactivate ${deactivateTarget.companyName}?` : 'Deactivate client?'}
        description="Existing tasks stay linked; it won't accept new activity."
        confirmLabel="Deactivate"
        danger
        isLoading={deactivateMutation.isPending}
        onConfirm={() => {
          if (deactivateTarget) void deactivateMutation.mutate(deactivateTarget.id)
        }}
      />
    </>
  )
}
