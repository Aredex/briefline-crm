/*
 * LandingLightbox — accessible enlarged view for product screenshots (T2.6).
 *
 * Built directly on @radix-ui/react-dialog (already a dependency, unused
 * elsewhere in the app today) rather than the app's `ui/Drawer.tsx`: Drawer
 * is deliberately non-modal (AP-14 — the page behind stays interactive,
 * `role="complementary"`, no `aria-modal`), which is the wrong contract for
 * a screenshot lightbox that should trap focus and mark the background
 * inert. Radix's Dialog.Content already sets `aria-modal="true"`, traps
 * focus, moves initial focus into the panel, closes on Escape, and restores
 * focus to the trigger on close — exactly what T2.6 asks for — without
 * pulling in any `ui.css` styling (plan A2: landing keeps its own CSS).
 * Styled here with landing-prefixed classes only.
 */
import * as Dialog from '@radix-ui/react-dialog'
import type { ReactNode } from 'react'
import { IconX } from '../ui/icons'

export interface LandingLightboxProps {
  caption: string
  onClose: () => void
  children: ReactNode
}

export function LandingLightbox({ caption, onClose, children }: LandingLightboxProps) {
  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="landing-lightbox__overlay" />
        <Dialog.Content className="landing-lightbox__content">
          <Dialog.Close asChild>
            <button type="button" className="landing-lightbox__close" aria-label="Close enlarged screenshot">
              <IconX />
            </button>
          </Dialog.Close>
          <div className="landing-lightbox__media">{children}</div>
          <Dialog.Title className="landing-lightbox__caption">{caption}</Dialog.Title>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
