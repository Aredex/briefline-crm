/*
 * TaskForm (TASK-FE-005) — shared create/edit form. Fields: title,
 * description, status, priority, assigneeId, clientId, dueDate; blockedReason
 * is visible and required ONLY while status = BLOCKED (BR-010). Zod enforces
 * the business rules client-side (BR-009/BR-010): active statuses require an
 * assignee (assignees are ACTIVE users only — BR-004), BLOCKED requires a
 * reason. expectedVersion is injected by the page on edit — never by this form.
 *
 * The Assignee select is disabled for members (GET /users is admin-only): the
 * gated hint explains why, keeping the form usable without inventing endpoints.
 */
import { useEffect } from 'react'
import { useForm, type UseFormReturn } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import type { ClientRef, TaskPriority, TaskResponse, TaskStatus, UserResponse } from '../../api/types'
import { PRIORITY_LABELS, STATUS_LABELS } from '../ui/Badge'
import { Form } from '../forms/Form'
import { FormField } from '../forms/FormField'
import { Input } from '../ui/Input'
import { Textarea } from '../ui/Textarea'
import { Select } from '../ui/Select'
import { Alert } from '../ui/Alert'
import { Button } from '../ui/Button'
import type { BannerError } from '../../lib/api-errors'

const taskFormSchema = z
  .object({
    title: z.string().trim().min(1, 'Title is required.').max(200, 'Use 200 characters or fewer.'),
    description: z.string().trim().max(2000, 'Use 2000 characters or fewer.').optional(),
    status: z.enum(['BACKLOG', 'PENDING', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED']),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']),
    assigneeId: z.string().optional(),
    clientId: z.string().optional(),
    dueDate: z.string().optional(),
    blockedReason: z.string().trim().max(500, 'Use 500 characters or fewer.').optional(),
  })
  .refine((values) => values.status === 'BACKLOG' || Boolean(values.assigneeId), {
    message: 'Tasks outside the backlog must have an assignee.',
    path: ['assigneeId'],
  })
  .refine((values) => values.status !== 'BLOCKED' || Boolean(values.blockedReason), {
    message: 'Blocked tasks require a reason.',
    path: ['blockedReason'],
  })

/** Output values (trimmed) — must match the zod output so RHF's
 *  TTransformedValues stays consistent with useForm<TaskFormValues>. */
export type TaskFormValues = z.output<typeof taskFormSchema>

const STATUS_OPTIONS = (Object.keys(STATUS_LABELS) as TaskStatus[]).map((status) => ({
  value: status,
  label: STATUS_LABELS[status],
}))

const PRIORITY_OPTIONS = (Object.keys(PRIORITY_LABELS) as TaskPriority[]).map((priority) => ({
  value: priority,
  label: PRIORITY_LABELS[priority],
}))

export interface TaskFormProps {
  mode: 'create' | 'edit'
  /** Present in edit mode — seeds the values and drives the version. */
  task?: TaskResponse
  users: UserResponse[]
  /** Member callers get an empty list + this flag (admin-only endpoint). */
  usersGated: boolean
  clients: ClientRef[]
  isSubmitting: boolean
  serverError: BannerError | null
  /** Focus the Assignee field after mount (BR-009 "Assign someone first" flow). */
  focusAssignee?: boolean
  /** Second argument lets callers map server field errors (AP-48). */
  onSubmit: (
    values: TaskFormValues,
    form: UseFormReturn<TaskFormValues>,
  ) => Promise<void>
}

export function TaskForm({
  mode,
  task,
  users,
  usersGated,
  clients,
  isSubmitting,
  serverError,
  focusAssignee = false,
  onSubmit,
}: TaskFormProps) {
  const form = useForm<TaskFormValues>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: {
      title: task?.title ?? '',
      description: task?.description ?? '',
      status: task?.status ?? 'BACKLOG',
      priority: task?.priority ?? 'MEDIUM',
      assigneeId: task?.assignee?.id ?? '',
      clientId: task?.client?.id ?? '',
      dueDate: task?.dueDate ?? '',
      blockedReason: task?.blockedReason ?? '',
    },
  })

  // Seed the form when the drawer opens for a different task.
  useEffect(() => {
    form.reset({
      title: task?.title ?? '',
      description: task?.description ?? '',
      status: task?.status ?? 'BACKLOG',
      priority: task?.priority ?? 'MEDIUM',
      assigneeId: task?.assignee?.id ?? '',
      clientId: task?.client?.id ?? '',
      dueDate: task?.dueDate ?? '',
      blockedReason: task?.blockedReason ?? '',
    })
    if (focusAssignee && !usersGated) {
      // Let the panel mount first, then land on the field the user must fill.
      const timer = window.setTimeout(() => form.setFocus('assigneeId'), 0)
      return () => window.clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id, mode, focusAssignee, usersGated])

  const { register, formState, watch } = form
  const status = watch('status')
  const isBlocked = status === 'BLOCKED'

  // Selects are self-contained (own label/error) — read RHF errors here.
  const errorOf = (name: keyof TaskFormValues): string | undefined => {
    const error = formState.errors[name]
    return error ? String(error.message ?? 'This field is invalid.') : undefined
  }

  return (
    <Form
      form={form}
      onSubmit={(values) => onSubmit(values, form)}
      aria-label={`${mode === 'create' ? 'Create' : 'Edit'} task form`}
      className="form-stack"
    >
      {serverError && (
        <Alert variant="error" title={serverError.title}>
          {serverError.detail}
        </Alert>
      )}

      <FormField form={form} name="title" label="Title" required>
        {(field) => <Input {...field} type="text" autoComplete="off" />}
      </FormField>

      <FormField form={form} name="description" label="Description">
        {(field) => <Textarea {...field} rows={3} />}
      </FormField>

      <div className="form-stack--row">
        <Select
          label="Status"
          required
          {...register('status')}
          options={STATUS_OPTIONS}
          error={errorOf('status')}
        />

        <Select
          label="Priority"
          required
          {...register('priority')}
          options={PRIORITY_OPTIONS}
          error={errorOf('priority')}
        />
      </div>

      <Select
        label="Assignee"
        required={status !== 'BACKLOG'}
        disabled={usersGated}
        {...register('assigneeId')}
        options={[
          { value: '', label: 'Unassigned' },
          ...users.map((user) => ({ value: user.id, label: user.name })),
        ]}
        error={errorOf('assigneeId')}
        helpText={
          usersGated
            ? 'Only administrators can change assignees.'
            : status === 'BACKLOG'
              ? 'Optional in the backlog.'
              : undefined
        }
      />

      <Select
        label="Client"
        {...register('clientId')}
        options={[
          { value: '', label: 'No client' },
          ...clients.map((client) => ({ value: client.id, label: client.companyName })),
        ]}
        error={errorOf('clientId')}
      />

      <FormField form={form} name="dueDate" label="Due date" helpText="Optional. Interpreted as end-of-day in Europe/Madrid.">
        {(field) => <Input {...field} type="date" />}
      </FormField>

      {isBlocked && (
        <FormField form={form} name="blockedReason" label="Blocked reason" required>
          {(field) => <Textarea {...field} rows={2} />}
        </FormField>
      )}

      <div className="form-actions">
        <Button type="submit" isLoading={isSubmitting}>
          {isSubmitting ? 'Saving…' : mode === 'create' ? 'Create task' : 'Save changes'}
        </Button>
      </div>
    </Form>
  )
}
