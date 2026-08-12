/*
 * ContactList — CONT-FE-001. Search (debounced 300ms) + client filter +
 * isPrimary filter over the paginated contacts table (≥768px table / stacked
 * cards below), skeleton/empty/filtered-empty/error states. Reads are
 * team-wide (CONT-002); create is admin-only (CONT-001) — members see a
 * read-only list.
 */
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import type { ClientResponse, ContactResponse, Paginated } from '../api/types'
import { useAuth } from '../providers/AuthProvider'
import { formatRelativeDate } from '../lib/format'
import { Button } from '../components/ui/Button'
import { Drawer } from '../components/ui/Drawer'
import { EmptyState } from '../components/ui/EmptyState'
import { ErrorState } from '../components/ui/ErrorState'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { Skeleton } from '../components/ui/Skeleton'
import { IconPlus, IconSearch } from '../components/ui/icons'
import { PrimaryBadge } from '../components/contacts/PrimaryBadge'

const PAGE_SIZE = 10

const PRIMARY_FILTERS: { value: '' | 'true' | 'false'; label: string }[] = [
  { value: '', label: 'All contacts' },
  { value: 'true', label: 'Primary only' },
  { value: 'false', label: 'Non-primary' },
]

export function ContactList() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'ADMIN'
  const navigate = useNavigate()

  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [clientId, setClientId] = useState('')
  const [isPrimary, setIsPrimary] = useState<'' | 'true' | 'false'>('')
  const [page, setPage] = useState(1)
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null)

  const contactDetailQuery = useQuery({
    queryKey: ['contacts', selectedContactId],
    queryFn: () => api.get<ContactResponse>(`/contacts/${selectedContactId!}`),
    enabled: selectedContactId !== null,
  })
  const contactDetail = contactDetailQuery.data

  // Debounce the search input (300ms) and reset pagination on any filter change.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, clientId, isPrimary])

  const listQuery = useQuery({
    queryKey: ['contacts', { q: debouncedSearch, clientId, isPrimary, page }],
    queryFn: () =>
      api.get<Paginated<ContactResponse>>('/contacts', {
        params: {
          q: debouncedSearch || undefined,
          clientId: clientId || undefined,
          isPrimary: isPrimary === '' ? undefined : isPrimary === 'true',
          page,
          limit: PAGE_SIZE,
        },
      }),
  })

  // Client filter options — team-wide read (CONT-002), same list as /clients.
  const clientsQuery = useQuery({
    queryKey: ['clients', 'select-options'],
    queryFn: () => api.get<Paginated<ClientResponse>>('/clients', { params: { limit: 100 } }),
  })
  const clientOptions = (clientsQuery.data?.data ?? []).map((client) => ({
    value: client.id,
    label: client.companyName,
  }))

  const hasFilters = debouncedSearch.length > 0 || clientId !== '' || isPrimary !== ''
  const meta = listQuery.data?.meta
  const total = meta?.total ?? 0
  const metaPage = meta?.page ?? 1
  const metaLimit = meta?.limit ?? 1
  const start = total === 0 ? 0 : (metaPage - 1) * metaLimit + 1
  const end = Math.min(metaPage * metaLimit, total)

  const clearFilters = () => {
    setSearch('')
    setClientId('')
    setIsPrimary('')
  }

  const renderContactName = (contact: ContactResponse) => (
    <div>
      <Link to={`/contacts/${contact.id}`} className="data-table__primary">
        {contact.firstName} {contact.lastName}
      </Link>
    </div>
  )

  return (
    <>
      <header className="page-header">
        <h1 className="page-header__title">Contacts</h1>
        {isAdmin && (
          <div className="page-header__actions">
            <Button size="md" leftIcon={<IconPlus />} onClick={() => navigate('/contacts/new')}>
              New contact
            </Button>
          </div>
        )}
      </header>

      <div className="toolbar">
        <div className="toolbar__search">
          <Input
            label="Search contacts"
            hideLabel
            type="search"
            placeholder="Search by name or email"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            leftIcon={<IconSearch />}
          />
        </div>
        <Select
          label="Client filter"
          hideLabel
          aria-label="Filter contacts by client"
          value={clientId}
          onChange={(event) => setClientId(event.target.value)}
          options={clientOptions}
          placeholder="All clients"
        />
        <Select
          label="Primary filter"
          hideLabel
          aria-label="Filter contacts by primary status"
          value={isPrimary}
          onChange={(event) => setIsPrimary(event.target.value as '' | 'true' | 'false')}
          options={PRIMARY_FILTERS}
        />
        <p className="toolbar__result" role="status">
          {listQuery.isSuccess
            ? total === 0
              ? 'No contacts match your search.'
              : `Showing ${start}–${end} of ${total} contacts`
            : ''}
        </p>
      </div>

      {listQuery.isPending && (
        <div className="skeleton-row" role="status" aria-label="Loading contacts">
          <Skeleton />
          <Skeleton />
          <Skeleton />
          <Skeleton />
          <Skeleton />
        </div>
      )}

      {listQuery.isError && (
        <ErrorState
          title="Could not load contacts"
          message={listQuery.error instanceof Error ? listQuery.error.message : undefined}
          onRetry={() => void listQuery.refetch()}
        />
      )}

      {listQuery.isSuccess && total === 0 && (
        hasFilters ? (
          <EmptyState
            title="No contacts match your filters"
            description="Try a different search term or filter."
            action={
              <Button variant="secondary" onClick={clearFilters}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <EmptyState
            title="No contacts yet"
            description="Add your first contact to start tracking relationships."
            action={
              isAdmin ? (
                <Button leftIcon={<IconPlus />} onClick={() => navigate('/contacts/new')}>
                  New contact
                </Button>
              ) : undefined
            }
          />
        )
      )}

      {listQuery.isSuccess && total > 0 && (
        <>
          {/* Desktop table (≥768px) */}
          <div className="table-wrap table-responsive">
            <table className="data-table">
              <caption className="sr-only">Contacts</caption>
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Email</th>
                  <th scope="col">Phone</th>
                  <th scope="col">Role</th>
                  <th scope="col">Client</th>
                  <th scope="col">Primary</th>
                </tr>
              </thead>
              <tbody>
                {listQuery.data.data.map((contact) => (
                  <tr key={contact.id} className="data-table__row--clickable" onClick={(e) => {
                    if ((e.target as HTMLElement).closest('button, a')) return
                    setSelectedContactId(contact.id)
                  }}>
                    <td>{renderContactName(contact)}</td>
                    <td>{contact.email ?? '—'}</td>
                    <td>{contact.phone ?? '—'}</td>
                    <td>{contact.role ?? '—'}</td>
                    <td>{contact.client.companyName}</td>
                    <td>{contact.isPrimary && <PrimaryBadge />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile stacked cards (<768px) */}
          <div className="data-cards">
            {listQuery.data.data.map((contact) => (
              <div key={contact.id} className="data-card">
                <div className="data-card__row">
                  {renderContactName(contact)}
                  {contact.isPrimary && <PrimaryBadge />}
                </div>
                <div className="data-table__secondary">{contact.email ?? '—'}</div>
                <div className="data-card__row">
                  <span className="data-card__label">Phone</span>
                  <span>{contact.phone ?? '—'}</span>
                </div>
                <div className="data-card__row">
                  <span className="data-card__label">Client</span>
                  <span>{contact.client.companyName}</span>
                </div>
                <div className="data-card__row">
                  <span className="data-card__label">Role</span>
                  <span>{contact.role ?? '—'}</span>
                </div>
              </div>
            ))}
          </div>

          {total > PAGE_SIZE && (
            <nav className="pagination" aria-label="Contacts pagination">
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

      {/* Contact detail drawer */}
      <Drawer
        open={selectedContactId !== null}
        onClose={() => setSelectedContactId(null)}
        title={contactDetail ? `${contactDetail.firstName} ${contactDetail.lastName}` : 'Contact details'}
        width={480}
      >
        {contactDetailQuery.isPending && (
          <div className="skeleton-row"><Skeleton /><Skeleton /><Skeleton /></div>
        )}
        {contactDetail && (
          <div className="detail-grid">
            <div className="detail-meta">
              <div className="detail-meta__item">
                <span className="detail-meta__label">Name</span>
                <span className="detail-meta__value">{contactDetail.firstName} {contactDetail.lastName}</span>
              </div>
              <div className="detail-meta__item">
                <span className="detail-meta__label">Role</span>
                <span className="detail-meta__value">{contactDetail.role ?? '—'}</span>
              </div>
              {contactDetail.email && (
                <div className="detail-meta__item">
                  <span className="detail-meta__label">Email</span>
                  <span className="detail-meta__value">
                    <a href={`mailto:${contactDetail.email}`}>{contactDetail.email}</a>
                  </span>
                </div>
              )}
              {contactDetail.phone && (
                <div className="detail-meta__item">
                  <span className="detail-meta__label">Phone</span>
                  <span className="detail-meta__value">{contactDetail.phone}</span>
                </div>
              )}
              <div className="detail-meta__item">
                <span className="detail-meta__label">Client</span>
                <span className="detail-meta__value">{contactDetail.client.companyName}</span>
              </div>
              <div className="detail-meta__item">
                <span className="detail-meta__label">Primary</span>
                <span className="detail-meta__value">{contactDetail.isPrimary ? 'Yes' : 'No'}</span>
              </div>
              <div className="detail-meta__item">
                <span className="detail-meta__label">Created</span>
                <span className="detail-meta__value">{formatRelativeDate(contactDetail.createdAt)}</span>
              </div>
            </div>
          </div>
        )}
      </Drawer>
    </>
  )
}
