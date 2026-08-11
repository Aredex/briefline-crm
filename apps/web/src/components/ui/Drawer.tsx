/*
 * Drawer — non-modal side panel (task panel pattern). Per AP-14 it must NOT
 * be aria-modal: the page behind stays accessible (and scrollable) while the
 * drawer is open. Focus moves into the panel on open and returns to the
 * trigger on close; Esc and scrim click close it.
 */
import { useEffect, useRef, type ReactNode } from 'react'
import { IconX } from './icons'

export interface DrawerProps {
  open: boolean
  onClose: () => void
  title: string
  side?: 'left' | 'right'
  width?: number
  children: ReactNode
  footer?: ReactNode
}

export function Drawer({ open, onClose, title, side = 'right', width = 420, children, footer }: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<Element | null>(null)

  useEffect(() => {
    if (!open) return
    // Remember what had focus so we can restore it on close (AP-10).
    triggerRef.current = document.activeElement
    panelRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  useEffect(() => {
    if (open) return
    if (triggerRef.current instanceof HTMLElement) triggerRef.current.focus()
  }, [open])

  if (!open) return null

  return (
    <div className={`drawer ${side === 'left' ? 'drawer--left' : 'drawer--right'}`}>
      <div className="drawer__scrim" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        className="drawer__panel"
        style={{ width: `${width}px`, maxWidth: '100vw' }}
        role="complementary"
        aria-label={title}
        tabIndex={-1}
      >
        <header className="drawer__header">
          <h2 className="drawer__title">{title}</h2>
          <button
            type="button"
            className="btn btn--ghost btn--sm btn--icon-only"
            onClick={onClose}
            aria-label={`Close ${title}`}
          >
            <IconX />
          </button>
        </header>
        <div className="drawer__body">{children}</div>
        {footer && <footer className="drawer__footer">{footer}</footer>}
      </div>
    </div>
  )
}
