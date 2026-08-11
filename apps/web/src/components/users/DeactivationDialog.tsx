/*
 * DeactivationDialog — USR-FE-002. Loads the deactivation impact
 * (GET /users/:id/deactivation-impact) when opened:
 *  - requiresReassignment → list the active assigned tasks, one ACTIVE
 *    assignee select each (defaults to the first ACTIVE user, target
 *    excluded); submit sends POST /users/:id/deactivate with reassignments.
 *  - no active work → simple confirm copy.
 *  - last active administrator → inline error + disabled confirm (BR-003);
 *    a server-side race surfaces the same way (409 LAST_ADMIN).
 * Persistent errors are banners inside the modal, never toast-only.
 */
import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../api/client'
import type { DeactivationImpact, Reassignment, UserResponse } from '../../api/types'
import { serverErrorDetail, serverErrorTitle, type BannerError } from '../../lib/api-errors'
import { Alert } from '../ui/Alert'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { Select } from '../ui/Select'

export interface DeactivationDialogProps {
  user: UserResponse | null
  open: boolean
  onClose: () => void
  /** Called after a successful deactivation (parent closes + announces). */
  onDeactivated: (user: UserResponse) => void
}

export function DeactivationDialog({ user, open, onClose, onDeactivated }: DeactivationDialogProps) {
  const queryClient = useQueryClient()

  const impactQuery = useQuery({
    queryKey: ['users', user?.id, 'deactivation-impact'],
    queryFn: () => api.get<DeactivationImpact>(`/users/${user?.id}/deactivation-impact`),
    enabled: open && Boolean(user),
  })

  // Reassignment candidates: all ACTIVE users (BR-004), target excluded.
  const activeUsersQuery = useQuery({
    queryKey: ['users', { status: 'ACTIVE', limit: 50 }],
    queryFn: () =>
      api.get<{ data: UserResponse[]; meta: { page: number; limit: number; total: number } }>(
        '/users',
        { params: { status: 'ACTIVE', limit: 50 } },
      ),
    enabled: open && Boolean(user),
  })

  const candidates = useMemo(
    () => (activeUsersQuery.data?.data ?? []).filter((candidate) => candidate.id !== user?.id),
    [activeUsersQuery.data, user?.id],
  )

  const [reassignments, setReassignments] = useState<Reassignment[]>([])
  const [bannerError, setBannerError] = useState<BannerError | null>(null)

  // Reset local state each time the dialog opens for a different user.
  useEffect(() => {
    if (!open || !user) return
    setBannerError(null)
  }, [open, user])

  const impact = impactQuery.data

  // Prefill reassignments once the impact + candidates are known.
  useEffect(() => {
    if (!open || !impact || candidates.length === 0) return
    const tasks = impact.assignedTasks
    const fallbackAssignee = candidates[0]
    if (!fallbackAssignee) return
    setReassignments((current) => {
      if (current.length > 0) return current
      return tasks.map((task) => ({
        taskId: task.id,
        assigneeId: fallbackAssignee.id,
      }))
    })
  }, [open, impact, candidates])

  const isLastAdmin =
    user != null &&
    user.role === 'ADMIN' &&
    user.status === 'ACTIVE' &&
    !activeUsersQuery.data?.data.some(
      (other) => other.id !== user.id && other.role === 'ADMIN' && other.status === 'ACTIVE',
    )

  const deactivateMutation = useMutation({
    mutationFn: (payload: { reassignments: Reassignment[] }) =>
      api.post<UserResponse>(`/users/${user?.id}/deactivate`, payload),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: ['users'] })
      onDeactivated(updated)
    },
  })

  const handleConfirm = async () => {
    if (!user) return
    setBannerError(null)
    try {
      await deactivateMutation.mutateAsync({ reassignments })
    } catch (caught) {
      setBannerError({ title: serverErrorTitle(caught), detail: serverErrorDetail(caught) })
    }
  }

  const setAssignee = (taskId: string, assigneeId: string) => {
    setReassignments((current) =>
      current.map((entry) => (entry.taskId === taskId ? { ...entry, assigneeId } : entry)),
    )
  }

  const missingAssignee = reassignments.some((entry) => !entry.assigneeId)

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={user ? `Deactivate ${user.name}?` : 'Deactivate user?'}
      descriptionId="deactivation-impact-desc"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={deactivateMutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => void handleConfirm()}
            disabled={isLastAdmin || missingAssignee || impactQuery.isPending || !impact}
            isLoading={deactivateMutation.isPending}
          >
            {deactivateMutation.isPending
              ? 'Working…'
              : impact?.requiresReassignment
                ? 'Deactivate & reassign'
                : 'Deactivate'}
          </Button>
        </>
      }
    >
      <div className="dialog-form">
        <p id="deactivation-impact-desc" className="confirm-copy">
          {user?.name} will no longer be able to sign in. Active tasks they created stay in the
          project; assigned work must be reassigned.
        </p>

        {bannerError && (
          <Alert variant="error" title={bannerError.title}>
            {bannerError.detail}
          </Alert>
        )}

        {isLastAdmin && (
          <Alert variant="error" title="You can't deactivate the last active administrator.">
            This user is the only active administrator. Promote another user before deactivating.
          </Alert>
        )}

        {impactQuery.isPending && <p className="confirm-copy">Checking for active work…</p>}

        {impact && !impact.requiresReassignment && (
          <Alert variant="info" title="No active tasks will be affected.">
            This user has no active assigned tasks, so nothing needs to be reassigned.
          </Alert>
        )}

        {impact?.requiresReassignment && (
          <>
            <Alert variant="warning" title="Active tasks need reassignment">
              Assign each task below to an active user before deactivating {user?.name}.
            </Alert>
            <ul className="impact-list">
              {impact.assignedTasks.map((task) => {
                const current = reassignments.find((entry) => entry.taskId === task.id)
                return (
                  <li key={task.id} className="impact-task">
                    <span className="impact-task__title">{task.title}</span>
                    <Select
                      label={`Reassign "${task.title}" to`}
                      hideLabel
                      value={current?.assigneeId ?? ''}
                      onChange={(event) => setAssignee(task.id, event.target.value)}
                      options={candidates.map((candidate) => ({
                        value: candidate.id,
                        label: candidate.name,
                      }))}
                    />
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </div>
    </Dialog>
  )
}
