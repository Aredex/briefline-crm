/*
 * Why this hook exists: this app is a client-only SPA with no SSR —
 * `index.html` serves an empty `#root`, so the browser's native "scroll to
 * fragment" step on the initial navigation runs before React has hydrated
 * anything, finds no matching element, and never retries. React Router v7's
 * `<ScrollRestoration>` doesn't cover this gap either: per its docs it only
 * emulates browser scroll restoration on *location changes* (navigation),
 * not on the initial load/hydration. Nothing else in the app owns this
 * responsibility, so a cold load of `/#product` (or any anchor) lands at the
 * top of the page instead of at the target section. This hook is the single
 * owner of that behavior for the landing page, including the composite
 * `#explore-product?tab=<key>` hash used for deep-linking into a product
 * preview tab (the query string means it never matches a plain element id).
 */
import { useEffect } from 'react'

const DEFAULT_HEADER_HEIGHT = 76

/**
 * Pure and exported so it is testable without touching the DOM.
 * Extracts the element id a hash should scroll to, cutting off any query
 * string (e.g. the `?tab=` used by the product explorer deep links).
 */
export function resolveHashTargetId(hash: string): string | null {
  if (hash === '' || hash === '#') return null

  const withoutHash = hash.slice(1)
  const queryIndex = withoutHash.indexOf('?')
  const rawId = queryIndex === -1 ? withoutHash : withoutHash.slice(0, queryIndex)
  if (rawId === '') return null

  try {
    return decodeURIComponent(rawId)
  } catch (error) {
    if (error instanceof URIError) return null
    throw error
  }
}

function readHeaderHeight(): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(
    '--landing-header-height',
  )
  const parsed = parseFloat(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_HEADER_HEIGHT
}

function scrollToElement(el: HTMLElement) {
  if (typeof el.scrollIntoView === 'function') {
    el.scrollIntoView({ block: 'start', behavior: 'instant' })
  }
}

/**
 * Mount-only effect that scrolls the target element (resolved from the
 * current URL hash) into view on a cold load. Never fights a scroll position
 * the browser or the user already established.
 */
export function useHashScrollOnLoad(): void {
  useEffect(() => {
    const id = resolveHashTargetId(window.location.hash)
    if (id === null) return

    // The browser or the user already resolved a scroll position — never
    // compete with that.
    if (window.scrollY > 0) return

    let cancelled = false

    const rafId = requestAnimationFrame(() => {
      if (cancelled) return
      const el = document.getElementById(id)
      if (!el) return

      scrollToElement(el)
      const expectedScrollY = window.scrollY

      // Fonts (IBM Plex Mono in particular) load with `font-display: swap`
      // and are not preloaded, so their swap after mount can reflow
      // eyebrows/labels and shift the target position. Correct once fonts
      // settle, but only if nothing else has moved the page since.
      document.fonts?.ready?.then(() => {
        if (cancelled) return
        if (window.scrollY !== expectedScrollY) return

        const headerHeight = readHeaderHeight()
        const currentTop = el.getBoundingClientRect().top
        if (Math.abs(currentTop - headerHeight) > 2) {
          scrollToElement(el)
        }
      })
    })

    return () => {
      cancelled = true
      cancelAnimationFrame(rafId)
    }
  }, [])
}
