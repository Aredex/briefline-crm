/*
 * ContactForm — shared create/edit form (CONT-FE-001/002). Owns the RHF + zod
 * schema; the caller wires the mutation, maps server field errors with
 * applyFieldErrors(form, error), and renders the banner for unmapped errors.
 *
 * mode="create" renders the client select; on edit the select is hidden
 * because clientId is immutable (CONT-API-004). isPrimary is NOT a form field:
 * the create/update DTOs reject it — the primary transition has its own
 * endpoint (POST /contacts/:id/primary, CONT-001).
 */
import { useEffect, useMemo } from 'react'
import { useForm, type UseFormReturn } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import type { BannerError } from '../../lib/api-errors'
import type { ClientRef } from '../../api/types'
import { Alert } from '../ui/Alert'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { Form } from '../forms/Form'
import { FormField } from '../forms/FormField'

const contactSchema = z.object({
  clientId: z.string().min(1, 'Select a client.'),
  firstName: z
    .string()
    .trim()
    .min(1, 'First name is required.')
    .max(100, 'Use 100 characters or fewer.'),
  lastName: z
    .string()
    .trim()
    .min(1, 'Last name is required.')
    .max(100, 'Use 100 characters or fewer.'),
  // Email is optional (backend DTO) — empty string passes, anything else
  // must look like an address.
  email: z
    .string()
    .trim()
    .max(254, 'Use 254 characters or fewer.')
    .refine((value) => value === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), 'Enter a valid email address.'),
  phone: z.string().trim().max(32, 'Use 32 characters or fewer.'),
  role: z.string().trim().max(80, 'Use 80 characters or fewer.'),
})

export type ContactFormValues = z.infer<typeof contactSchema>

export interface ContactFormProps {
  mode: 'create' | 'edit'
  /** Client options for the create select (create mode only). */
  clients?: ClientRef[]
  /** Prefill for edit. When it changes, the form resets. */
  values?: Partial<ContactFormValues>
  submitLabel: string
  isSubmitting?: boolean
  /** Server error NOT mapped to a field (unmapped banner). */
  error?: BannerError | null
  onSubmit: (values: ContactFormValues, form: UseFormReturn<ContactFormValues>) => Promise<void>
}

export function ContactForm({
  mode,
  clients = [],
  values,
  submitLabel,
  isSubmitting = false,
  error,
  onSubmit,
}: ContactFormProps) {
  const form = useForm<ContactFormValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      clientId: '',
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      role: '',
    },
  })

  const valuesKey = useMemo(
    () => JSON.stringify(values ?? {}),
    // values is a memoized object in callers; stringify keeps reset logic simple.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [values?.clientId, values?.firstName, values?.lastName, values?.email, values?.phone, values?.role],
  )

  useEffect(() => {
    if (!values) return
    form.reset({
      clientId: values.clientId ?? '',
      firstName: values.firstName ?? '',
      lastName: values.lastName ?? '',
      email: values.email ?? '',
      phone: values.phone ?? '',
      role: values.role ?? '',
    })
    // Reset only when the edited contact changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valuesKey])

  const clientOptions = clients.map((client) => ({ value: client.id, label: client.companyName }))

  return (
    <Form form={form} onSubmit={(formValues) => onSubmit(formValues, form)} aria-label="Contact form">
      <div className="form-stack">
        {error && (
          <Alert variant="error" title={error.title}>
            {error.detail}
          </Alert>
        )}

        {mode === 'create' && (
          <FormField form={form} name="clientId" label="Client" required>
            {(field) => (
              <Select
                {...field}
                label="Client"
                hideLabel
                placeholder="Select a client"
                options={clientOptions}
              />
            )}
          </FormField>
        )}

        <FormField form={form} name="firstName" label="First name" required>
          {(field) => (
            <Input {...field} type="text" autoComplete="given-name" placeholder="Alex" />
          )}
        </FormField>

        <FormField form={form} name="lastName" label="Last name" required>
          {(field) => (
            <Input {...field} type="text" autoComplete="family-name" placeholder="Rivera" />
          )}
        </FormField>

        <FormField form={form} name="email" label="Email" helpText="Optional">
          {(field) => (
            <Input {...field} type="email" autoComplete="email" inputMode="email" placeholder="alex@company.com" />
          )}
        </FormField>

        <FormField form={form} name="phone" label="Phone" helpText="Optional">
          {(field) => <Input {...field} type="tel" autoComplete="tel" placeholder="+34 600 000 000" />}
        </FormField>

        <FormField form={form} name="role" label="Role" helpText="Optional">
          {(field) => <Input {...field} type="text" autoComplete="organization-title" placeholder="CEO" />}
        </FormField>

        <div className="form-actions">
          <Button type="submit" size="md" isLoading={isSubmitting}>
            {isSubmitting ? 'Saving…' : submitLabel}
          </Button>
        </div>
      </div>
    </Form>
  )
}
