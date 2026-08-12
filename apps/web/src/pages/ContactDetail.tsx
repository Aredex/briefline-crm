/*
 * ContactDetail — CONT-FE-003. Header card (full name + role + Primary badge)
 * and a details card with every contact field. Reads are team-wide (CONT-002);
 * admins get Edit / Set as Primary (CONT-001) / Delete. A fresh create or edit
 * announces "Contact created." / "Contact updated." via location state.
 */
import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../api/client'
import type { ContactResponse } from '../api/types'
import { useAuth } from '../providers/AuthProvider'
import { serverErrorDetail, serverErrorTitle, type BannerError } from '../lib/api-errors'
import { formatAbsoluteDate, formatRelativeDate } from '../lib/format'
import { Alert } from '../components/ui/Alert'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { ErrorState } from '../components/ui/ErrorState'
import { Skeleton } from '../components/ui/Skeleton'
import { IconArrowLeft, IconEdit } from '../components/ui/icons'
import { PrimaryBadge } from '../components/contacts/PrimaryBadge'

export function ContactDetail() {
  const { contactId } = useParams()
  const { user } = useAuth()
  const isAdmin = user?.role === 'ADMIN'
  const queryClient = useQueryClient()
  const location = useLocation()
  const navigate = useNavigate()
  const locationState = (location.state as { created?: boolean; updated?: boolean } | null) ?? null

  const [deleteOpen, setDeleteOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(
    locationState?.created ? 'Contact created.' : locationState?.updated ? 'Contact updated.' : null,
  )
  const [bannerError, setBannerError] = useState<BannerError | null>(null)

  const query = useQuery({
    queryKey: ['contacts', contactId],
    queryFn: () => api.get<ContactResponse>(`/contacts/${contactId}`),
    enabled: Boolean(contactId),
  })

  const contact = query.data
  const fullName = contact ? `${contact.firstName} ${contact.lastName}` : ''

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['contacts'] })
    void queryClient.invalidateQueries({ queryKey: ['contacts', contactId] })
  }

  const primaryMutation = useMutation({
    mutationFn: (id: string) => api.post<ContactResponse>(`/contacts/${id}/primary`, {}),
    onSuccess: () => {
      setBannerError(null)
      setNotice('Primary contact updated.')
      invalidate()
    },
    onError: (caught) => {
      setBannerError({ title: serverErrorTitle(caught), detail: serverErrorDetail(caught) })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete<ContactResponse>(`/contacts/${id}`),
    onSuccess: () => {
      setDeleteOpen(false)
      void queryClient.invalidateQueries({ queryKey: ['contacts'] })
      navigate('/contacts', { replace: true })
    },
    // Surface races (e.g. already deleted → 404) on the page instead of behind
    // the scrim, so the banner stays readable.
    onError: (caught) => {
      setDeleteOpen(false)
      setBannerError({ title: serverErrorTitle(caught), detail: serverErrorDetail(caught) })
    },
  })

  if (query.isPending) {
    return (
      <div className="skeleton-row" role="status" aria-label="Loading contact">
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
        title={notFound ? 'Contact not found' : 'Could not load contact'}
        message={notFound ? 'The requested contact does not exist or is not visible to you.' : error.message}
        onRetry={notFound ? undefined : () => void query.refetch()}
      />
    )
  }

  if (!contact) return null

  return (
    <>
      <Link to="/contacts" className="page-header__back">
        <IconArrowLeft /> Back to contacts
      </Link>

      <div className="detail-header">
        <div className="detail-header__left">
          <h1 className="detail-header__title">{fullName}</h1>
          <div className="detail-header__badges">
            {contact.role && <span className="detail-header__subtitle">{contact.role}</span>}
            {contact.isPrimary && <PrimaryBadge />}
          </div>
        </div>
        {isAdmin && (
          <div className="page-header__actions">
            <Button variant="secondary" onClick={() => navigate(`/contacts/${contact.id}/edit`)} aria-label="Edit contact">
              <IconEdit />
            </Button>
            {!contact.isPrimary && (
              <Button
                variant="secondary"
                isLoading={primaryMutation.isPending}
                onClick={() => void primaryMutation.mutate(contact.id)}
              >
                Set as Primary
              </Button>
            )}
            <Button variant="ghost" onClick={() => setDeleteOpen(true)}>
              Delete
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

      <div className="detail-grid">
        <Card header={<h2 className="card__title">Contact details</h2>}>
          <ul className="detail-list">
            <li>
              <div className="detail-list__label">First name</div>
              <div className="detail-list__value">{contact.firstName}</div>
            </li>
            <li>
              <div className="detail-list__label">Last name</div>
              <div className="detail-list__value">{contact.lastName}</div>
            </li>
            <li>
              <div className="detail-list__label">Email</div>
              <div className="detail-list__value">
                {contact.email ? <a href={`mailto:${contact.email}`}>{contact.email}</a> : '—'}
              </div>
            </li>
            <li>
              <div className="detail-list__label">Phone</div>
              <div className="detail-list__value">{contact.phone ?? '—'}</div>
            </li>
            <li>
              <div className="detail-list__label">Role</div>
              <div className="detail-list__value">{contact.role ?? '—'}</div>
            </li>
            <li>
              <div className="detail-list__label">Client</div>
              <div className="detail-list__value">
                <Link to={`/clients/${contact.client.id}`}>{contact.client.companyName}</Link>
              </div>
            </li>
            <li>
              <div className="detail-list__label">Primary contact</div>
              <div className="detail-list__value">{contact.isPrimary ? <PrimaryBadge /> : '—'}</div>
            </li>
            <li>
              <div className="detail-list__label">Created</div>
              <div className="detail-list__value">{formatAbsoluteDate(contact.createdAt)}</div>
            </li>
            <li>
              <div className="detail-list__label">Updated</div>
              <div className="detail-list__value">{formatRelativeDate(contact.updatedAt)}</div>
            </li>
          </ul>
        </Card>
      </div>

      {/* Delete confirm */}
      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title={`Delete ${fullName}?`}
        description="This permanently removes the contact. This action cannot be undone."
        confirmLabel="Delete"
        danger
        isLoading={deleteMutation.isPending}
        onConfirm={() => void deleteMutation.mutate(contact.id)}
      />
    </>
  )
}
