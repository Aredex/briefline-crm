/*
 * Dialog — modal with aria-modal="true", focus trap, Esc to close, and focus
 * restore to the trigger. Rendered through a portal so stacking and overlay
 * behavior work above any stacking context.
 */
import { createPortal } from 'react-dom'
import { useEffect, useRef, type ReactNode } from 'react'
import { IconX } from './icons'

export interface DialogProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  /** Text for the labelled-by description slot, if any. */
  descriptionId?: string
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

export function Dialog({ open, onClose, title, children, footer, descriptionId }: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useRef(`dialog-title-${Math.random().toString(36).slice(2, 8)}`)

  useEffect(() => {
    if (!open) return
    const trigger = document.activeElement as HTMLElement | null

    // Move focus into the dialog.
    const panel = panelRef.current
    if (panel) {
      const first = panel.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
      ;(first ?? panel).focus()
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab' || !panel) return

      // Focus trap: cycle within the dialog.
      const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (!first || !last) return
      const active = document.activeElement as HTMLElement | null

      if (event.shiftKey) {
        if (active === first || !panel.contains(active)) {
          event.preventDefault()
          last.focus()
        }
      } else if (active === last || !panel.contains(active)) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      trigger?.focus()
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="dialog">
      <div className="dialog__scrim" aria-hidden="true" />
      <div
        ref={panelRef}
        className="dialog__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId.current}
        aria-describedby={descriptionId}
      >
        <header className="dialog__header">
          <h2 id={titleId.current} className="dialog__title">
            {title}
          </h2>
          <button
            type="button"
            className="btn btn--ghost btn--sm btn--icon-only"
            onClick={onClose}
            aria-label={`Close ${title}`}
          >
            <IconX />
          </button>
        </header>
        <div className="dialog__body">{children}</div>
        {footer && <footer className="dialog__footer">{footer}</footer>}
      </div>
    </div>,
    document.body,
  )
}
