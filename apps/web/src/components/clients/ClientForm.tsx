/*
 * ClientForm — shared create/edit form (CLI-FE-002/004). Owns the RHF + zod
 * schema; the caller wires the mutation, maps server field errors with
 * applyFieldErrors(form, error), and renders the banner for unmapped errors.
 */
import { useEffect, useMemo } from 'react'
import { useForm, type UseFormReturn } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import type { BannerError } from '../../lib/api-errors'
import { Alert } from '../ui/Alert'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Textarea } from '../ui/Textarea'
import { Form } from '../forms/Form'
import { FormField } from '../forms/FormField'

const clientSchema = z.object({
  companyName: z
    .string()
    .trim()
    .min(1, 'Company name is required.')
    .max(160, 'Use 160 characters or fewer.'),
  industry: z.string().trim().max(80, 'Use 80 characters or fewer.'),
  contactName: z
    .string()
    .trim()
    .min(1, 'Primary contact name is required.')
    .max(100, 'Use 100 characters or fewer.'),
  contactEmail: z
    .string()
    .trim()
    .min(1, 'Primary contact email is required.')
    .email('Enter a valid email address.')
    .max(254, 'Use 254 characters or fewer.'),
  phone: z.string().trim().max(32, 'Use 32 characters or fewer.'),
  notes: z.string().trim().max(2000, 'Use 2000 characters or fewer.'),
})

export type ClientFormValues = z.infer<typeof clientSchema>

export interface ClientFormProps {
  /** Prefill for the edit drawer. When it changes, the form resets. */
  values?: Partial<ClientFormValues>
  submitLabel: string
  isSubmitting?: boolean
  /** Server error NOT mapped to a field (unmapped banner). */
  error?: BannerError | null
  onSubmit: (values: ClientFormValues, form: UseFormReturn<ClientFormValues>) => Promise<void>
}

export function ClientForm({ values, submitLabel, isSubmitting = false, error, onSubmit }: ClientFormProps) {
  const form = useForm<ClientFormValues>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      companyName: '',
      industry: '',
      contactName: '',
      contactEmail: '',
      phone: '',
      notes: '',
    },
  })

  const valuesKey = useMemo(
    () => JSON.stringify(values ?? {}),
    // values is a memoized object in callers; stringify keeps reset logic simple.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [values?.companyName, values?.industry, values?.contactName, values?.contactEmail, values?.phone, values?.notes],
  )

  useEffect(() => {
    if (!values) return
    form.reset({
      companyName: values.companyName ?? '',
      industry: values.industry ?? '',
      contactName: values.contactName ?? '',
      contactEmail: values.contactEmail ?? '',
      phone: values.phone ?? '',
      notes: values.notes ?? '',
    })
    // Reset only when the edited client changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valuesKey])

  return (
    <Form form={form} onSubmit={(formValues) => onSubmit(formValues, form)} aria-label="Client form">
      <div className="form-stack">
        {error && (
          <Alert variant="error" title={error.title}>
            {error.detail}
          </Alert>
        )}

        <FormField form={form} name="companyName" label="Company name" required>
          {(field) => (
            <Input {...field} type="text" autoComplete="organization" placeholder="Acme Inc." />
          )}
        </FormField>

        <FormField form={form} name="industry" label="Industry" helpText="Optional">
          {(field) => <Input {...field} type="text" autoComplete="off" placeholder="SaaS" />}
        </FormField>

        <FormField form={form} name="contactName" label="Primary contact name" required>
          {(field) => (
            <Input {...field} type="text" autoComplete="name" placeholder="Alex Rivera" />
          )}
        </FormField>

        <FormField form={form} name="contactEmail" label="Primary contact email" required>
          {(field) => (
            <Input {...field} type="email" autoComplete="email" inputMode="email" placeholder="alex@company.com" />
          )}
        </FormField>

        <FormField form={form} name="phone" label="Phone" helpText="Optional">
          {(field) => <Input {...field} type="tel" autoComplete="tel" placeholder="+34 600 000 000" />}
        </FormField>

        <FormField form={form} name="notes" label="Notes" helpText="Optional">
          {(field) => <Textarea {...field} rows={4} placeholder="Anything the team should know." />}
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
