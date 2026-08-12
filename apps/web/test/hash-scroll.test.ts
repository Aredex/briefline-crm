/*
 * F3/UT-1..UT-4 — unit spec for the landing's cold-load hash scroll
 * (src/components/landing/useHashScrollOnLoad.ts).
 *
 * These tests state the contract the hook must satisfy, independently of the
 * current implementation: the hash → element-id resolution (including the
 * composite `#explore-product?tab=<key>` form that replaced the ad-hoc patch
 * inside ProductExplorer), and the hook's two hard guards — never fight an
 * existing scroll position, and never crash where `scrollIntoView` is absent
 * (jsdom, and the same defence that protects any non-visual runtime).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import {
  resolveHashTargetId,
  useHashScrollOnLoad,
} from '../src/components/landing/useHashScrollOnLoad'

describe('resolveHashTargetId', () => {
  it('returns null for an empty hash', () => {
    expect(resolveHashTargetId('')).toBeNull()
  })

  it('returns null for a bare "#" (a hash with no fragment)', () => {
    expect(resolveHashTargetId('#')).toBeNull()
  })

  it('returns the plain element id for a simple hash', () => {
    expect(resolveHashTargetId('#product')).toBe('product')
  })

  it('cuts the query string off a composite tab deep link', () => {
    // The case that motivated deleting the ad-hoc scroll effect in
    // ProductExplorer: `#explore-product?tab=coordinate` never matches an
    // element id, so the browser never scrolls to it on its own.
    expect(resolveHashTargetId('#explore-product?tab=coordinate')).toBe('explore-product')
  })

  it('cuts the query string even when it carries several params', () => {
    expect(resolveHashTargetId('#explore-product?tab=accountability&x=1')).toBe('explore-product')
  })

  it('returns null when the fragment is only a query string', () => {
    expect(resolveHashTargetId('#?tab=coordinate')).toBeNull()
  })

  it('percent-decodes the fragment', () => {
    expect(resolveHashTargetId('#case%2Dstudy')).toBe('case-study')
  })

  it('returns null instead of throwing on a malformed percent escape', () => {
    // decodeURIComponent throws URIError here; a bad URL must never take the
    // page down on mount.
    expect(() => resolveHashTargetId('#case%2')).not.toThrow()
    expect(resolveHashTargetId('#case%2')).toBeNull()
    expect(resolveHashTargetId('#%E0%A4%A')).toBeNull()
  })
})

describe('useHashScrollOnLoad', () => {
  let scrollIntoView: ReturnType<typeof vi.fn>
  const originalScrollIntoView = Object.getOwnPropertyDescriptor(
    Element.prototype,
    'scrollIntoView',
  )

  function setHash(hash: string) {
    window.history.replaceState(null, '', `/${hash}`)
  }

  function setScrollY(value: number) {
    Object.defineProperty(window, 'scrollY', { value, writable: true, configurable: true })
  }

  function mountTarget(id: string): HTMLElement {
    const el = document.createElement('section')
    el.id = id
    document.body.appendChild(el)
    return el
  }

  const originalFonts = Object.getOwnPropertyDescriptor(document, 'fonts')

  /**
   * Minimal stand-in for `document.fonts` (absent in jsdom, so the hook's
   * font-swap correction pass is otherwise unreachable here). `ready` is a
   * thenable whose resolution the test drives, and whose `then` is a spy so a
   * test can assert the hook really subscribed — without that premise these
   * tests would pass vacuously if the correction block were deleted.
   */
  function stubFontsReady() {
    let resolveReady!: () => void
    const ready = new Promise<void>((resolve) => {
      resolveReady = resolve
    })
    const then = vi.fn((onFulfilled: () => void) => ready.then(onFulfilled))

    Object.defineProperty(document, 'fonts', {
      value: { ready: { then } },
      writable: true,
      configurable: true,
    })

    return {
      then,
      /** Resolve `fonts.ready` and drain the microtasks it queues. */
      async settle() {
        resolveReady()
        await ready
        await Promise.resolve()
      },
    }
  }

  /** Replaces rAF with a manual queue, so the hook's frame fires exactly when
   *  the test says it does. Undone by `vi.unstubAllGlobals` in afterEach. */
  function stubManualFrames() {
    const frames: Array<() => void> = []
    vi.stubGlobal('requestAnimationFrame', (cb: () => void) => frames.push(cb))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    return {
      runNextFrame() {
        const frame = frames.shift()
        if (!frame) throw new Error('premise failed: the hook never requested a frame')
        frame()
      },
    }
  }

  beforeEach(() => {
    scrollIntoView = vi.fn()
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      value: scrollIntoView,
      writable: true,
      configurable: true,
    })
    setScrollY(0)
    setHash('')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    if (originalFonts) {
      Object.defineProperty(document, 'fonts', originalFonts)
    } else {
      delete (document as { fonts?: unknown }).fonts
    }
    if (originalScrollIntoView) {
      Object.defineProperty(Element.prototype, 'scrollIntoView', originalScrollIntoView)
    } else {
      delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView
    }
    document.body.innerHTML = ''
    setHash('')
    setScrollY(0)
  })

  it('scrolls the element named by the hash into view, without animation', async () => {
    const target = mountTarget('product')
    setHash('#product')

    renderHook(() => useHashScrollOnLoad())

    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled())
    expect(scrollIntoView.mock.instances[0]).toBe(target)
    // `instant` is load-bearing: global.css sets `scroll-behavior: smooth`,
    // so `auto` would animate a multi-thousand-pixel cold-load jump.
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'instant' })
  })

  it('scrolls to the section of a composite `?tab=` deep link', async () => {
    const target = mountTarget('explore-product')
    setHash('#explore-product?tab=accountability')

    renderHook(() => useHashScrollOnLoad())

    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled())
    expect(scrollIntoView.mock.instances[0]).toBe(target)
  })

  it('does nothing when there is no hash', async () => {
    mountTarget('product')
    setHash('')

    renderHook(() => useHashScrollOnLoad())

    await flushFrames()
    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it('does nothing when the hash names an element that is not in the document', async () => {
    setHash('#nowhere')

    renderHook(() => useHashScrollOnLoad())

    await flushFrames()
    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it('never fights a scroll position the browser or the user already set', async () => {
    mountTarget('product')
    setHash('#product')
    setScrollY(420)
    expect(window.scrollY).toBe(420) // premise: the guard is really under test

    renderHook(() => useHashScrollOnLoad())

    await flushFrames()
    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it('does not scroll after unmount (a fast navigation away must not move the next page)', async () => {
    mountTarget('product')
    setHash('#product')

    const { unmount } = renderHook(() => useHashScrollOnLoad())
    unmount()

    await flushFrames()
    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it('does not run the font-swap correction when unmounted while fonts are still loading', async () => {
    mountTarget('product')
    setHash('#product')
    const frames = stubManualFrames()
    const fonts = stubFontsReady()

    const { unmount } = renderHook(() => useHashScrollOnLoad())
    frames.runNextFrame()

    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    // premise: the correction pass really is pending on our stubbed promise
    expect(fonts.then).toHaveBeenCalledTimes(1)

    unmount()
    await fonts.settle()

    // The hook navigated away mid-flight: the late correction must not move
    // whatever page is on screen now.
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
  })

  it('does not run the font-swap correction when the user has scrolled since the initial jump', async () => {
    mountTarget('product')
    setHash('#product')
    const frames = stubManualFrames()
    const fonts = stubFontsReady()

    renderHook(() => useHashScrollOnLoad())
    frames.runNextFrame()

    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(fonts.then).toHaveBeenCalledTimes(1)

    // The user scrolled away while the fonts were still swapping.
    setScrollY(900)
    await fonts.settle()

    // Correcting now would yank the page out from under them.
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
  })

  it('does not throw in a runtime without Element#scrollIntoView (jsdom)', async () => {
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView
    const target = mountTarget('product')
    setHash('#product')
    // premise: without this, the test would pass even if the guard were gone
    expect(typeof target.scrollIntoView).toBe('undefined')

    const errors: unknown[] = []
    const onError = (event: ErrorEvent) => errors.push(event.error ?? event.message)
    window.addEventListener('error', onError)

    expect(() => renderHook(() => useHashScrollOnLoad())).not.toThrow()
    await flushFrames()

    window.removeEventListener('error', onError)
    expect(errors).toEqual([])
  })
})

/** Let two animation frames + a microtask drain, so the hook's rAF callback
 *  (and any promise it chains) has certainly run. */
async function flushFrames(): Promise<void> {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })
  await Promise.resolve()
}
