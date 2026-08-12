/*
 * Drawer — non-modal side panel (task panel pattern). Per AP-14 it must NOT
 * be aria-modal: the page behind stays accessible (and scrollable) while the
 * drawer is open. Focus moves into the panel on open and returns to the
 * trigger on close; Esc and scrim click close it.
 *
 * Entry animation: slides in from the right (or left). Exit animation: slides
 * back out before unmount — the component uses an internal "closing" phase so
 * the exit transition can play before the DOM is removed.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
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
  const [closing, setClosing] = useState(false)
  const [visible, setVisible] = useState(false)

  // Track open → visible (entry) and open → closing → !visible (exit).
  useEffect(() => {
    if (open) {
      setVisible(true)
      setClosing(false)
    } else if (visible) {
      // Start exit animation, then unmount.
      setClosing(true)
      const timeout = setTimeout(() => {
        setVisible(false)
        setClosing(false)
      }, 180) // matches --duration-fast + small buffer
      return () => clearTimeout(timeout)
    }
  }, [open, visible])

  useEffect(() => {
    if (!visible || closing) return
    // Remember what had focus so we can restore it on close (AP-10).
    triggerRef.current = document.activeElement
    panelRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [visible, closing, onClose])

  useEffect(() => {
    if (visible) return
    if (triggerRef.current instanceof HTMLElement) triggerRef.current.focus()
  }, [visible])

  if (!visible) return null

  const sideClass = side === 'left' ? 'drawer--left' : 'drawer--right'

  return (
    <div className={`drawer ${sideClass}${closing ? ' drawer--closing' : ''}`}>
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
