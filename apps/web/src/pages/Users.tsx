/*
 * Users — USR-FE-001/002. Admin only (router gate + API 403). Searchable,
 * paginated table (desktop) / stacked cards (mobile). Create user with a
 * one-time initial password (never redisplayed). Edit name/role with a
 * demotion confirm step; deactivation goes through the impact + reassignment
 * dialog; the last active administrator is protected client-side and by the
 * API (409 LAST_ADMIN).
 */
import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { api } from '../api/client'
import type { Paginated, UserCreateInput, UserResponse, UserUpdateInput } from '../api/types'
import { applyFieldErrors, serverErrorDetail, serverErrorTitle, type BannerError } from '../lib/api-errors'
import { formatRelativeDate } from '../lib/format'
import { Alert } from '../components/ui/Alert'
import { Button } from '../components/ui/Button'
import { Dialog } from '../components/ui/Dialog'
import { EmptyState } from '../components/ui/EmptyState'
import { ErrorState } from '../components/ui/ErrorState'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { Skeleton } from '../components/ui/Skeleton'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { Form } from '../components/forms/Form'
import { FormField } from '../components/forms/FormField'
import { IconPlus, IconSearch } from '../components/ui/icons'
import { RoleBadge, UserStatusBadge } from '../components/users/UserBadges'
import { DeactivationDialog } from '../components/users/DeactivationDialog'

const PAGE_SIZE = 10

const createUserSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(100, 'Use 100 characters or fewer.'),
  email: z
    .string()
    .trim()
    .min(1, 'Email is required.')
    .email('Enter a valid email address.')
    .max(254, 'Use 254 characters or fewer.'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters.')
    .max(72, 'Use 72 characters or fewer.'),
  role: z.enum(['ADMIN', 'MEMBER']),
})

type CreateUserValues = z.infer<typeof createUserSchema>

const editUserSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(100, 'Use 100 characters or fewer.'),
  role: z.enum(['ADMIN', 'MEMBER']),
})

type EditUserValues = z.infer<typeof editUserSchema>

export function Users() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)
  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<UserResponse | null>(null)
  const [deactivateTarget, setDeactivateTarget] = useState<UserResponse | null>(null)
  const [pendingDemotion, setPendingDemotion] = useState<UserResponse | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [bannerError, setBannerError] = useState<BannerError | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    setPage(1)
  }, [debouncedSearch])

  const usersQuery = useQuery({
    queryKey: ['users', { q: debouncedSearch, page }],
    queryFn: () =>
      api.get<Paginated<UserResponse>>('/users', {
        params: { q: debouncedSearch || undefined, page, limit: PAGE_SIZE },
      }),
  })

  const invalidateUsers = () => queryClient.invalidateQueries({ queryKey: ['users'] })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UserUpdateInput }) =>
      api.patch<UserResponse>(`/users/${id}`, payload),
    onSuccess: (updated) => {
      setEditTarget(null)
      setPendingDemotion(null)
      setBannerError(null)
      setNotice(updated.role === 'ADMIN' ? `${updated.name} updated.` : `${updated.name} demoted to member.`)
      void invalidateUsers()
    },
  })

  const activateMutation = useMutation({
    mutationFn: (id: string) => api.patch<UserResponse>(`/users/${id}`, { status: 'ACTIVE' }),
    onSuccess: (updated) => {
      setBannerError(null)
      setNotice(`${updated.name} activated.`)
      void invalidateUsers()
    },
  })

  // Client-side last-admin heuristic (authoritative check is the API's 409).
  const isLastAdmin = useMemo(() => {
    if (!editTarget) return false
    return (
      editTarget.role === 'ADMIN' &&
      editTarget.status === 'ACTIVE' &&
      !usersQuery.data?.data.some(
        (other) => other.id !== editTarget.id && other.role === 'ADMIN' && other.status === 'ACTIVE',
      )
    )
  }, [editTarget, usersQuery.data])

  const meta = usersQuery.data?.meta
  const total = meta?.total ?? 0
  const metaPage = meta?.page ?? 1
  const metaLimit = meta?.limit ?? 1
  const start = total === 0 ? 0 : (metaPage - 1) * metaLimit + 1
  const end = Math.min(metaPage * metaLimit, total)

  const renderActions = (target: UserResponse) => (
    <div className="data-table__actions">
      <Button size="sm" variant="secondary" onClick={() => setEditTarget(target)}>
        Edit
      </Button>
      {target.status === 'ACTIVE' ? (
        <Button size="sm" variant="ghost" onClick={() => setDeactivateTarget(target)}>
          Deactivate
        </Button>
      ) : (
        <Button
          size="sm"
          variant="ghost"
          isLoading={activateMutation.isPending && activateMutation.variables === target.id}
          onClick={() => void activateMutation.mutate(target.id)}
        >
          Activate
        </Button>
      )}
    </div>
  )

  const handleDemotionConfirm = () => {
    if (!pendingDemotion) return
    void updateMutation.mutate({ id: pendingDemotion.id, payload: { role: 'MEMBER' } })
  }

  return (
    <>
      <header className="page-header">
        <h1 className="page-header__title">Users</h1>
        <div className="page-header__actions">
          <Button size="md" leftIcon={<IconPlus />} onClick={() => setCreateOpen(true)}>
            New user
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
            label="Search users"
            hideLabel
            type="search"
            placeholder="Search by name or email"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            leftIcon={<IconSearch />}
          />
        </div>
        <p className="toolbar__result" role="status">
          {usersQuery.isSuccess
            ? total === 0
              ? 'No users match your search.'
              : `Showing ${start}–${end} of ${total} users`
            : ''}
        </p>
      </div>

      {usersQuery.isPending && (
        <div className="skeleton-row" role="status" aria-label="Loading users">
          <Skeleton />
          <Skeleton />
          <Skeleton />
        </div>
      )}

      {usersQuery.isError && (
        <ErrorState
          title="Could not load users"
          message={usersQuery.error instanceof Error ? usersQuery.error.message : undefined}
          onRetry={() => void usersQuery.refetch()}
        />
      )}

      {usersQuery.isSuccess && total === 0 && (
        <EmptyState
          title={debouncedSearch ? 'No users match your search' : 'No users yet'}
          description={
            debouncedSearch
              ? 'Try a different name or email.'
              : 'Invite your first teammate to get started.'
          }
        />
      )}

      {usersQuery.isSuccess && total > 0 && (
        <>
          <div className="table-wrap table-responsive">
            <table className="data-table">
              <caption className="sr-only">Users</caption>
              <thead>
                <tr>
                  <th scope="col">User</th>
                  <th scope="col">Email</th>
                  <th scope="col">Role</th>
                  <th scope="col">Status</th>
                  <th scope="col">Last login</th>
                  <th scope="col" className="data-table__actions">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {usersQuery.data.data.map((target) => (
                  <tr key={target.id}>
                    <td>
                      <div className="cell-user">
                        <span className="avatar-mini" aria-hidden="true">
                          {target.name
                            .split(' ')
                            .map((part) => part[0])
                            .filter(Boolean)
                            .slice(0, 2)
                            .join('')
                            .toUpperCase()}
                        </span>
                        <span className="data-table__primary">{target.name}</span>
                      </div>
                    </td>
                    <td>{target.email}</td>
                    <td>
                      <RoleBadge role={target.role} />
                    </td>
                    <td>
                      <UserStatusBadge status={target.status} />
                    </td>
                    <td>{formatRelativeDate(target.lastLoginAt)}</td>
                    <td>{renderActions(target)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="data-cards">
            {usersQuery.data.data.map((target) => (
              <div key={target.id} className="data-card">
                <div className="data-card__row">
                  <div className="cell-user">
                    <span className="avatar-mini" aria-hidden="true">
                      {target.name
                        .split(' ')
                        .map((part) => part[0])
                        .filter(Boolean)
                        .slice(0, 2)
                        .join('')
                        .toUpperCase()}
                    </span>
                    <span className="data-table__primary">{target.name}</span>
                  </div>
                  <div className="data-card__badges">
                    <RoleBadge role={target.role} />
                    <UserStatusBadge status={target.status} />
                  </div>
                </div>
                <div className="data-card__row">
                  <span className="data-card__label">Email</span>
                  <span>{target.email}</span>
                </div>
                <div className="data-card__row">
                  <span className="data-card__label">Last login</span>
                  <span>{formatRelativeDate(target.lastLoginAt)}</span>
                </div>
                <div className="data-card__actions">{renderActions(target)}</div>
              </div>
            ))}
          </div>

          {total > PAGE_SIZE && (
            <nav className="pagination" aria-label="Users pagination">
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

      <CreateUserDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(user) => {
          setCreateOpen(false)
          setNotice(`${user.name} created.`)
          void invalidateUsers()
        }}
      />

      <EditUserDialog
        user={editTarget}
        isLastAdmin={isLastAdmin}
        isSubmitting={updateMutation.isPending}
        onClose={() => setEditTarget(null)}
        onDemote={(target) => setPendingDemotion(target)}
        onSaved={(updated) => {
          setEditTarget(null)
          setNotice(`${updated.name} updated.`)
          void invalidateUsers()
        }}
        onError={(error) => setBannerError(error)}
      />

      <ConfirmDialog
        open={pendingDemotion !== null}
        onClose={() => setPendingDemotion(null)}
        title={pendingDemotion ? `Demote ${pendingDemotion.name}?` : 'Demote user?'}
        description="They will lose administrator access immediately."
        confirmLabel="Demote"
        danger
        isLoading={updateMutation.isPending}
        onConfirm={handleDemotionConfirm}
      />

      <DeactivationDialog
        user={deactivateTarget}
        open={deactivateTarget !== null}
        onClose={() => setDeactivateTarget(null)}
        onDeactivated={(updated) => {
          setDeactivateTarget(null)
          setNotice(`${updated.name} deactivated.`)
          void invalidateUsers()
        }}
      />
    </>
  )
}

/* ---------- Create user dialog ---------- */

interface CreateUserDialogProps {
  open: boolean
  onClose: () => void
  onCreated: (user: UserResponse) => void
}

function CreateUserDialog({ open, onClose, onCreated }: CreateUserDialogProps) {
  const queryClient = useQueryClient()
  const [showPassword, setShowPassword] = useState(false)
  const [bannerError, setBannerError] = useState<BannerError | null>(null)

  const form = useForm<CreateUserValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { name: '', email: '', password: '', role: 'MEMBER' },
  })

  const createMutation = useMutation({
    mutationFn: (payload: UserCreateInput) => api.post<UserResponse>('/users', payload),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ['users'] })
      form.reset()
      setShowPassword(false)
      onCreated(created)
    },
  })

  const handleSubmit = async (values: CreateUserValues) => {
    setBannerError(null)
    try {
      await createMutation.mutateAsync({
        name: values.name,
        email: values.email,
        password: values.password,
        role: values.role,
      })
    } catch (caught) {
      if (!applyFieldErrors(form, caught)) {
        setBannerError({ title: serverErrorTitle(caught), detail: serverErrorDetail(caught) })
      }
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New user"
      footer={
        <Button
          type="submit"
          form="create-user-form"
          isLoading={createMutation.isPending}
        >
          {createMutation.isPending ? 'Creating…' : 'Create user'}
        </Button>
      }
    >
      <Form form={form} onSubmit={handleSubmit} aria-label="New user form" className="dialog-form" id="create-user-form">
        {bannerError && (
          <Alert variant="error" title={bannerError.title}>
            {bannerError.detail}
          </Alert>
        )}

        <FormField form={form} name="name" label="Name" required>
          {(field) => <Input {...field} type="text" autoComplete="off" placeholder="Alex Rivera" />}
        </FormField>

        <FormField form={form} name="email" label="Email address" required>
          {(field) => (
            <Input {...field} type="email" autoComplete="off" inputMode="email" placeholder="alex@company.com" />
          )}
        </FormField>

        <FormField
          form={form}
          name="password"
          label="Initial password"
          required
          helpText="Shown once: the user will change it at their first sign-in."
        >
          {(field) => (
            <div className="password-row">
              <Input
                {...field}
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="At least 8 characters"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-pressed={showPassword}
                onClick={() => setShowPassword((visible) => !visible)}
              >
                {showPassword ? 'Hide' : 'Show'}
              </Button>
            </div>
          )}
        </FormField>

        <FormField form={form} name="role" label="Role" required>
          {(field) => (
            <Select
              {...field}
              label="Role"
              hideLabel
              options={[
                { value: 'MEMBER', label: 'Member' },
                { value: 'ADMIN', label: 'Administrator' },
              ]}
            />
          )}
        </FormField>
      </Form>
    </Dialog>
  )
}

/* ---------- Edit user dialog ---------- */

interface EditUserDialogProps {
  user: UserResponse | null
  isLastAdmin: boolean
  isSubmitting: boolean
  onClose: () => void
  onDemote: (user: UserResponse) => void
  onSaved: (user: UserResponse) => void
  onError: (error: BannerError) => void
}

function EditUserDialog({
  user,
  isLastAdmin,
  isSubmitting,
  onClose,
  onDemote,
  onSaved,
  onError,
}: EditUserDialogProps) {
  const queryClient = useQueryClient()
  const [bannerError, setBannerError] = useState<BannerError | null>(null)

  const form = useForm<EditUserValues>({
    resolver: zodResolver(editUserSchema),
    defaultValues: { name: '', role: 'MEMBER' },
  })

  // Keep the form in sync with the user being edited.
  useEffect(() => {
    if (!user) return
    form.reset({ name: user.name, role: user.role })
    setBannerError(null)
  }, [user, form])

  const saveMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UserUpdateInput }) =>
      api.patch<UserResponse>(`/users/${id}`, payload),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: ['users'] })
      onSaved(updated)
    },
  })

  const handleSubmit = async (values: EditUserValues) => {
    if (!user) return
    setBannerError(null)

    // USR-FE-002: demotion requires explicit confirmation.
    if (user.role === 'ADMIN' && values.role === 'MEMBER') {
      onDemote(user)
      return
    }

    try {
      await saveMutation.mutateAsync({ id: user.id, payload: { name: values.name, role: values.role } })
    } catch (caught) {
      if (!applyFieldErrors(form, caught)) {
        const error = { title: serverErrorTitle(caught), detail: serverErrorDetail(caught) }
        setBannerError(error)
        onError(error)
      }
    }
  }

  return (
    <Dialog
      open={user !== null}
      onClose={onClose}
      title={user ? `Edit ${user.name}` : 'Edit user'}
      footer={
        <Button type="submit" form="edit-user-form" isLoading={isSubmitting}>
          {isSubmitting ? 'Saving…' : 'Save changes'}
        </Button>
      }
    >
      <Form form={form} onSubmit={handleSubmit} aria-label="Edit user form" className="dialog-form" id="edit-user-form">
        {bannerError && (
          <Alert variant="error" title={bannerError.title}>
            {bannerError.detail}
          </Alert>
        )}
        {isLastAdmin && (
          <Alert variant="info" title="Last active administrator">
            This user is the only active administrator. Promote another user before demoting them.
          </Alert>
        )}

        <FormField form={form} name="name" label="Name" required>
          {(field) => <Input {...field} type="text" autoComplete="off" />}
        </FormField>

        <FormField form={form} name="role" label="Role" required>
          {(field) => (
            <Select
              {...field}
              label="Role"
              hideLabel
              disabled={isLastAdmin}
              options={[
                { value: 'MEMBER', label: 'Member' },
                { value: 'ADMIN', label: 'Administrator' },
              ]}
            />
          )}
        </FormField>

        <Alert variant="info" title={`Status: ${user?.status === 'ACTIVE' ? 'Active' : 'Inactive'}`}>
          {user?.status === 'ACTIVE'
            ? 'Deactivate this user from the Users list to manage assigned work first.'
            : 'Reactivate this user with the Activate action.'}
        </Alert>
      </Form>
    </Dialog>
  )
}
