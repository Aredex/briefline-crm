/*
 * Profile — PROF-FE-001. Own profile: name editable, email read-only, role
 * badge read-only (wireframe §2.8). The successful save writes the updated
 * user back to the session store so the shell header reacts immediately.
 */
import { useEffect, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { api } from '../api/client'
import type { UserResponse } from '../api/types'
import { setSession } from '../lib/auth-session'
import { applyFieldErrors, serverErrorDetail, serverErrorTitle, type BannerError } from '../lib/api-errors'
import { Alert } from '../components/ui/Alert'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { ErrorState } from '../components/ui/ErrorState'
import { Skeleton } from '../components/ui/Skeleton'
import { Form } from '../components/forms/Form'
import { FormField } from '../components/forms/FormField'
import { RoleBadge } from '../components/users/UserBadges'

const profileSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(100, 'Use 100 characters or fewer.'),
})

type ProfileValues = z.infer<typeof profileSchema>

export function Profile() {
  const [notice, setNotice] = useState<string | null>(null)
  const [bannerError, setBannerError] = useState<BannerError | null>(null)

  const query = useQuery({
    queryKey: ['profile'],
    queryFn: () => api.get<UserResponse>('/profile'),
  })

  const form = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: '' },
  })

  // Prefill the name once the profile query settles. Mount-time alone is not
  // enough: on first mount the query is still pending, so reset() would only
  // ever write the initial empty default.
  useEffect(() => {
    if (query.isSuccess && query.data) form.reset({ name: query.data.name })
  }, [query.isSuccess, query.data, form])

  const saveMutation = useMutation({
    mutationFn: (payload: ProfileValues) => api.patch<UserResponse>('/profile', payload),
    onSuccess: (updated) => {
      // Keep the module-level session in sync (header avatar/name react).
      setSession(updated)
      setBannerError(null)
      setNotice('Profile updated.')
    },
  })

  const handleSubmit = async (values: ProfileValues) => {
    setNotice(null)
    setBannerError(null)
    try {
      await saveMutation.mutateAsync(values)
    } catch (caught) {
      if (!applyFieldErrors(form, caught)) {
        setBannerError({ title: serverErrorTitle(caught), detail: serverErrorDetail(caught) })
      }
    }
  }

  if (query.isPending) {
    return (
      <div className="skeleton-row" role="status" aria-label="Loading profile">
        <Skeleton />
        <Skeleton />
      </div>
    )
  }

  if (query.isError) {
    return (
      <ErrorState
        title="Could not load your profile"
        message={query.error instanceof Error ? query.error.message : undefined}
        onRetry={() => void query.refetch()}
      />
    )
  }

  const profile = query.data
  if (!profile) return null

  const initials = profile.name
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <>
      <header className="page-header">
        <h1 className="page-header__title">Profile</h1>
      </header>

      {notice && <Alert variant="success" role="status" title={notice} className="alert--page" />}
      {bannerError && (
        <Alert variant="error" title={bannerError.title} className="alert--page">
          {bannerError.detail}
        </Alert>
      )}

      <div className="profile-page">
        <Card>
            <div className="profile-page__head">
              <span className="avatar-large" aria-hidden="true">
                {initials}
              </span>
              <div className="profile-page__identity">
                <span className="profile-page__name">
                  {profile.name} <RoleBadge role={profile.role} />
                </span>
                <span className="profile-page__email">{profile.email}</span>
              </div>
            </div>

            <Form form={form} onSubmit={handleSubmit} aria-label="Edit profile form" className="form-stack">
              <FormField form={form} name="name" label="Name" required>
                {(field) => <Input {...field} type="text" autoComplete="name" />}
              </FormField>

              <div className="field">
                <label htmlFor="profile-email" className="field__label">
                  Email address
                </label>
                <Input
                  id="profile-email"
                  type="email"
                  value={profile.email}
                  disabled
                  readOnly
                  aria-describedby="profile-email-help"
                />
                <p id="profile-email-help" className="field__help">
                  Email address is managed by your administrator.
                </p>
              </div>

              <div className="form-actions">
                <Button type="submit" isLoading={saveMutation.isPending}>
                  {saveMutation.isPending ? 'Saving…' : 'Save changes'}
                </Button>
              </div>
            </Form>
        </Card>
      </div>
    </>
  )
}
