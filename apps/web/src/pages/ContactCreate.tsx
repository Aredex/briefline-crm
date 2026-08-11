/*
 * ContactCreate — CONT-FE-001 create. Admin only (CONT-001, route loader).
 * The client select is fed by GET /clients (team-wide read). Zod validation,
 * server field errors mapped per-field (AP-48), unmapped errors as a banner.
 * On success the page navigates to the new contact's detail, which announces
 * "Contact created." via location state.
 */
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import type { ClientResponse, ContactCreateInput, ContactResponse, Paginated } from '../api/types'
import { applyFieldErrors, serverErrorDetail, serverErrorTitle, type BannerError } from '../lib/api-errors'
import { ErrorState } from '../components/ui/ErrorState'
import { Skeleton } from '../components/ui/Skeleton'
import { IconArrowLeft } from '../components/ui/icons'
import { ContactForm, type ContactFormProps } from '../components/contacts/ContactForm'

export function ContactCreate() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [bannerError, setBannerError] = useState<BannerError | null>(null)

  // Client options for the select — the form only renders once they load.
  const clientsQuery = useQuery({
    queryKey: ['clients', 'select-options'],
    queryFn: () => api.get<Paginated<ClientResponse>>('/clients', { params: { limit: 100 } }),
  })

  const createMutation = useMutation({
    mutationFn: (payload: ContactCreateInput) => api.post<ContactResponse>('/contacts', payload),
    onSuccess: (contact) => {
      void queryClient.invalidateQueries({ queryKey: ['contacts'] })
      navigate(`/contacts/${contact.id}`, { state: { created: true } })
    },
  })

  const handleSubmit: ContactFormProps['onSubmit'] = async (values, form) => {
    setBannerError(null)
    try {
      await createMutation.mutateAsync({
        clientId: values.clientId,
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email.trim() || undefined,
        phone: values.phone.trim() || undefined,
        role: values.role.trim() || undefined,
      })
    } catch (caught) {
      if (!applyFieldErrors(form, caught)) {
        setBannerError({ title: serverErrorTitle(caught), detail: serverErrorDetail(caught) })
      }
    }
  }

  return (
    <>
      <Link to="/contacts" className="page-header__back">
        <IconArrowLeft /> Back to contacts
      </Link>
      <header className="page-header">
        <h1 className="page-header__title">New contact</h1>
      </header>

      {clientsQuery.isPending && (
        <div className="skeleton-row" role="status" aria-label="Loading clients">
          <Skeleton />
          <Skeleton />
        </div>
      )}

      {clientsQuery.isError && (
        <ErrorState
          title="Could not load clients"
          message={clientsQuery.error instanceof Error ? clientsQuery.error.message : undefined}
          onRetry={() => void clientsQuery.refetch()}
        />
      )}

      {clientsQuery.isSuccess && (
        <div className="card form-card">
          <div className="card__body">
            <ContactForm
              mode="create"
              clients={clientsQuery.data.data}
              submitLabel="Create contact"
              isSubmitting={createMutation.isPending}
              error={bannerError}
              onSubmit={handleSubmit}
            />
          </div>
        </div>
      )}
    </>
  )
}
