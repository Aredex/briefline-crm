/*
 * F0/T0.4 landing baseline — public landing page (/) renders all 9 sections
 * with the correct DOM shape (headings, tabs, permissions table, footer
 * landmark) after the T0.3 extraction into per-section components. Guards
 * against visual regressions in the upcoming F1+ passes.
 */
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import { screen, within } from '@testing-library/react'
import { server } from '../src/mocks/server'
import { loginAs, renderApp, findByHeading } from './test-utils'

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  loginAs(null)
})
afterAll(() => server.close())

describe('Landing', () => {
  it('renders the hero and all 9 sections', async () => {
    loginAs(null)
    renderApp({ initialPath: '/' })

    expect(await findByHeading('Client work, clearly owned.')).toBeInTheDocument()
    expect(await findByHeading('When client work lives everywhere')).toBeInTheDocument()
    expect(await findByHeading('From client brief to accountable delivery')).toBeInTheDocument()
    expect(await findByHeading('Explore the product')).toBeInTheDocument()
    expect(await findByHeading('Permissions that mean something')).toBeInTheDocument()
    expect(await findByHeading('Engineering')).toBeInTheDocument()
    expect(await findByHeading('Quality and accessibility')).toBeInTheDocument()
    expect(await findByHeading('About this case study')).toBeInTheDocument()
    expect(
      await findByHeading('See how Briefline turns client context into accountable work.'),
    ).toBeInTheDocument()
  })

  it('renders the product explorer tabs with correct roles and initial selection', async () => {
    loginAs(null)
    renderApp({ initialPath: '/' })

    await findByHeading('Explore the product')

    const tablist = screen.getByRole('tablist', { name: 'Product previews' })
    expect(tablist).toBeInTheDocument()

    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(3)
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
    expect(tabs[1]).toHaveAttribute('aria-selected', 'false')
    expect(tabs[2]).toHaveAttribute('aria-selected', 'false')
  })

  it('renders the permissions table with a caption and scoped column headers', async () => {
    loginAs(null)
    renderApp({ initialPath: '/' })

    const heading = await findByHeading('Permissions that mean something')
    expect(heading).toBeInTheDocument()
    // T3.2 gave Quality its own <table> on the same page (F3) — scope the
    // query to the Permissions section so this only asserts its own table.
    const section = heading!.closest('section') as HTMLElement
    const withinSection = within(section)

    expect(
      withinSection.getByText('Capability matrix for Administrator and Member roles'),
    ).toBeInTheDocument()

    const columnHeaders = withinSection.getAllByRole('columnheader')
    expect(columnHeaders).toHaveLength(3)
    columnHeaders.forEach((header) => {
      expect(header).toHaveAttribute('scope', 'col')
    })
  })

  it('renders a single footer landmark', async () => {
    loginAs(null)
    renderApp({ initialPath: '/' })

    await findByHeading('Client work, clearly owned.')

    expect(screen.getByRole('contentinfo')).toBeInTheDocument()
  })

  /*
   * F3/UT-5 — the landing now calls useHashScrollOnLoad on mount. jsdom has
   * neither `Element#scrollIntoView` nor `document.fonts`, so a missing guard
   * in the hook would surface here as a crash on any deep-linked render
   * rather than as a scroll bug. Also pins the composite `?tab=` hash to the
   * tab it selects, now that ProductExplorer no longer owns the scroll.
   */
  it('mounts with a deep-link hash without throwing, and selects the deep-linked tab', async () => {
    loginAs(null)

    const errors: unknown[] = []
    const onError = (event: ErrorEvent) => errors.push(event.error ?? event.message)
    window.addEventListener('error', onError)

    try {
      renderApp({ initialPath: '/#explore-product?tab=accountability' })

      await findByHeading('Explore the product')
      expect(await findByHeading('Permissions and history')).toBeInTheDocument()

      const tabs = screen.getAllByRole('tab')
      expect(tabs.map((tab) => tab.getAttribute('aria-selected'))).toEqual([
        'false',
        'false',
        'true',
      ])

      // Drain the frame the hook schedules its scroll in.
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      })
    } finally {
      window.removeEventListener('error', onError)
      window.history.replaceState(null, '', '/')
    }

    expect(errors).toEqual([])
  })

  it('renders no placeholder links (F3/T3.5 gate: D1 hides the unpublished GitHub URL)', async () => {
    loginAs(null)
    renderApp({ initialPath: '/' })

    await findByHeading('Client work, clearly owned.')

    const hrefs = screen
      .getAllByRole('link')
      .map((link) => link.getAttribute('href'))
      .filter((href): href is string => href !== null)

    expect(hrefs.length).toBeGreaterThan(0)
    for (const href of hrefs) {
      expect(href).not.toMatch(/username\//)
      expect(href).not.toBe('#')
    }
  })
})
