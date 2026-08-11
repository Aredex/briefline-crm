/*
 * ClientCreate — CLI-FE-002. Any active user may create a client (BR-006).
 * Zod validation, server field errors mapped per-field (AP-48), unmapped
 * errors as a banner. On success the page navigates to the new client's
 * detail, which announces "Client created." via location state.
 */
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import type { ClientCreateInput, ClientResponse } from '../api/types'
import { applyFieldErrors, serverErrorDetail, serverErrorTitle, type BannerError } from '../lib/api-errors'
import { IconArrowLeft } from '../components/ui/icons'
import { ClientForm, type ClientFormProps } from '../components/clients/ClientForm'

export function ClientCreate() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [bannerError, setBannerError] = useState<BannerError | null>(null)

  const createMutation = useMutation({
    mutationFn: (payload: ClientCreateInput) => api.post<ClientResponse>('/clients', payload),
    onSuccess: (client) => {
      void queryClient.invalidateQueries({ queryKey: ['clients'] })
      navigate(`/clients/${client.id}`, { state: { created: true } })
    },
  })

  const handleSubmit: ClientFormProps['onSubmit'] = async (values, form) => {
    setBannerError(null)
    try {
      await createMutation.mutateAsync({
        companyName: values.companyName,
        industry: values.industry || undefined,
        contactName: values.contactName,
        contactEmail: values.contactEmail,
        phone: values.phone ? values.phone : null,
        notes: values.notes ? values.notes : null,
      })
    } catch (caught) {
      if (!applyFieldErrors(form, caught)) {
        setBannerError({ title: serverErrorTitle(caught), detail: serverErrorDetail(caught) })
      }
    }
  }

  return (
    <>
      <Link to="/clients" className="page-header__back">
        <IconArrowLeft /> Back to clients
      </Link>
      <header className="page-header">
        <h1 className="page-header__title">New client</h1>
      </header>

      <div className="card form-card">
        <div className="card__body">
          <ClientForm
            submitLabel="Create client"
            isSubmitting={createMutation.isPending}
            error={bannerError}
            onSubmit={handleSubmit}
          />
        </div>
      </div>
    </>
  )
}
