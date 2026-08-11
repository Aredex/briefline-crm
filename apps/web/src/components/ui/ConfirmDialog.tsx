/*
 * ConfirmDialog — destructive/decision confirmation wrapper over Dialog:
 * description copy + Cancel/Confirm footer. Used by archive, deactivate,
 * and role demotion flows (CLI-FE-004, USR-FE-002).
 */
import { Button } from './Button'
import { Dialog } from './Dialog'

export interface ConfirmDialogProps {
  open: boolean
  title: string
  description?: React.ReactNode
  confirmLabel: string
  /** Danger styling + role="alert" on the description (destructive action). */
  danger?: boolean
  isLoading?: boolean
  onConfirm: () => void
  onClose: () => void
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  danger = false,
  isLoading = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} isLoading={isLoading}>
            {isLoading ? 'Working…' : confirmLabel}
          </Button>
        </>
      }
    >
      {description && <p className="confirm-copy">{description}</p>}
    </Dialog>
  )
}
