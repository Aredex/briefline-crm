/*
 * ContactEdit — CONT-FE-002. Admin only (CONT-001, route loader). Loads the
 * existing contact to prefill the form; clientId is immutable on edit
 * (CONT-API-004), so the form renders without the client select. On success
 * the page returns to the detail, which announces "Contact updated." via
 * location state.
 */
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../api/client'
import type { ContactResponse, ContactUpdateInput } from '../api/types'
import { applyFieldErrors, serverErrorDetail, serverErrorTitle, type BannerError } from '../lib/api-errors'
import { ErrorState } from '../components/ui/ErrorState'
import { Skeleton } from '../components/ui/Skeleton'
import { IconArrowLeft } from '../components/ui/icons'
import { ContactForm, type ContactFormProps } from '../components/contacts/ContactForm'

export function ContactEdit() {
  const { contactId } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [bannerError, setBannerError] = useState<BannerError | null>(null)

  const query = useQuery({
    queryKey: ['contacts', contactId],
    queryFn: () => api.get<ContactResponse>(`/contacts/${contactId}`),
    enabled: Boolean(contactId),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ContactUpdateInput }) =>
      api.patch<ContactResponse>(`/contacts/${id}`, payload),
    onSuccess: (contact) => {
      void queryClient.invalidateQueries({ queryKey: ['contacts'] })
      navigate(`/contacts/${contact.id}`, { state: { updated: true } })
    },
  })

  const handleSubmit: ContactFormProps['onSubmit'] = async (values, form) => {
    const contact = query.data
    if (!contact) return
    setBannerError(null)
    try {
      await updateMutation.mutateAsync({
        id: contact.id,
        payload: {
          firstName: values.firstName,
          lastName: values.lastName,
          email: values.email.trim() || undefined,
          phone: values.phone.trim() || undefined,
          role: values.role.trim() || undefined,
        },
      })
    } catch (caught) {
      if (!applyFieldErrors(form, caught)) {
        setBannerError({ title: serverErrorTitle(caught), detail: serverErrorDetail(caught) })
      }
    }
  }

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

  const contact = query.data
  if (!contact) return null

  return (
    <>
      <Link to="/contacts" className="page-header__back">
        <IconArrowLeft /> Back to contacts
      </Link>
      <header className="page-header">
        <h1 className="page-header__title">Edit contact</h1>
      </header>

      <div className="card form-card">
        <div className="card__body">
          <ContactForm
            mode="edit"
            values={{
              clientId: contact.client.id,
              firstName: contact.firstName,
              lastName: contact.lastName,
              email: contact.email ?? '',
              phone: contact.phone ?? '',
              role: contact.role ?? '',
            }}
            submitLabel="Save changes"
            isSubmitting={updateMutation.isPending}
            error={bannerError}
            onSubmit={handleSubmit}
          />
        </div>
      </div>
    </>
  )
}
