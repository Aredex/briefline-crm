/*
 * Landing page e2e (T5.6, plan F5) — the first spec to visit `/` directly.
 * Every other e2e spec enters through `/login`; the public landing has never
 * had real-browser coverage. No login, no mutation, no reseed: the landing
 * reads nothing from the database, so it's safe to run in any order/state.
 *
 * Covers audit FUN-004 (anchor navigation), FUN-005/A11Y-LAND-004 (product
 * explorer tabs), FUN-002/T5.2 (demo deep link prefill), and the axe +
 * 320px checks from §18/§19 that jsdom (test/a11y.test.tsx) can't verify
 * against a real layout (color-contrast, actual scroll width, sticky header
 * occlusion).
 */
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

/*
 * Reads what is painted immediately under the sticky header's bottom edge and
 * reports whether it belongs to the given section. This is the pixel-level
 * guard for the header-offset bug: any anchor offset larger than the header
 * height leaves a gap through which the *previous* section shows, so a
 * heading that is merely "below the header" is not enough — the section must
 * own that first row of pixels. Returns the section id on success, and an
 * explanatory string (what was painted there, and how far down the section
 * actually starts) on failure, so a red poll says why.
 */
async function probeUnderHeader(
  page: import('@playwright/test').Page,
  sectionId: string,
): Promise<string> {
  return page.evaluate((id) => {
    const header = document.querySelector('.landing-header')
    if (!header) return 'no .landing-header in the document'
    const headerBottom = header.getBoundingClientRect().bottom
    const x = Math.round(window.innerWidth / 2)
    const y = Math.round(headerBottom + 2)
    const el = document.elementFromPoint(x, y)
    if (!el) return `nothing painted at y=${y}`
    if (el.closest(`#${id}`)) return id

    const section = document.querySelector(`#${id}`)
    const gap = section ? Math.round(section.getBoundingClientRect().top - headerBottom) : NaN
    const painted = `${el.tagName.toLowerCase()}${el.className ? `.${String(el.className).split(' ')[0]}` : ''}`
    return `${painted} at y=${y} (#${id} starts ${gap}px below the header)`
  }, sectionId)
}

test.describe('Landing page', () => {
  test('loads with the hero H1 visible', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1, name: 'Client work, clearly owned.' })).toBeVisible()
  })

  test('header nav anchor scrolls the target heading into view, clear of the sticky header', async ({ page }) => {
    await page.goto('/')

    const nav = page.getByRole('navigation', { name: 'Main' })
    await nav.getByRole('link', { name: 'Engineering' }).click()
    await expect(page).toHaveURL(/#engineering$/)

    const heading = page.getByRole('heading', { name: 'Engineering', exact: true })
    await expect(heading).toBeInViewport()

    // A11Y-LAND-003: the sticky header must not cover the heading it just
    // navigated to — the heading's top must sit below the header's bottom edge.
    const headerBox = await page.locator('.landing-header').boundingBox()
    const headingBox = await heading.boundingBox()
    expect(headerBox).not.toBeNull()
    expect(headingBox).not.toBeNull()
    expect(headingBox!.y).toBeGreaterThanOrEqual(headerBox!.y + headerBox!.height - 1)

    // Same pixel probe as the cold-load test below, on the warm path: after a
    // nav click the target section must start flush under the header, with no
    // sliver of the preceding section showing through. Polled because the nav
    // anchor scrolls smoothly (global.css `scroll-behavior: smooth`).
    await expect.poll(() => probeUnderHeader(page, 'engineering')).toBe('engineering')
  })

  test('"Case study" nav link lands on the case study section, not Engineering (T5.4 anchor fix)', async ({ page }) => {
    await page.goto('/')

    const nav = page.getByRole('navigation', { name: 'Main' })
    await nav.getByRole('link', { name: 'Case study' }).click()
    await expect(page).toHaveURL(/#case-study$/)
    await expect(page.getByRole('heading', { name: 'About this case study' })).toBeInViewport()
  })

  test('"Product" nav link lands on the real product explorer, not Problem/Solution (H5)', async ({ page }) => {
    await page.goto('/')

    const nav = page.getByRole('navigation', { name: 'Main' })
    await nav.getByRole('link', { name: 'Product' }).click()
    await expect(page).toHaveURL(/#product$/)
    await expect(page.getByRole('heading', { name: 'Explore the product' })).toBeInViewport()
  })

  /*
   * Cold-load deep links (plan F3/E2E-1..4). The browser's native
   * scroll-to-fragment runs against an empty `#root`, so these only pass
   * because useHashScrollOnLoad owns the scroll after React mounts. Every
   * position assertion is retried (expect.poll / toBeInViewport): `goto`
   * resolves on `load`, and the scroll happens a frame later.
   */
  test('cold load of /#product scrolls to the product explorer', async ({ page }) => {
    await page.goto('/#product')

    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(1000)
    await expect(page.getByRole('heading', { name: 'Explore the product' })).toBeInViewport()
  })

  test('cold load of /#case-study scrolls to the case study section', async ({ page }) => {
    // A second, further anchor: proves the fix is not specific to #product.
    await page.goto('/#case-study')

    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(1000)
    await expect(page.getByRole('heading', { name: 'About this case study' })).toBeInViewport()
  })

  test('cold load of /#problem lands flush under the sticky header, with no sliver of the hero', async ({ page }) => {
    await page.goto('/#problem')

    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
    await expect(page.getByRole('heading', { name: 'When client work lives everywhere' })).toBeInViewport()

    // The regression guard for the header-offset bug: the pixels right below
    // the header must belong to #problem, not to the hero above it.
    await expect.poll(() => probeUnderHeader(page, 'problem')).toBe('problem')
  })

  test('cold load of /#explore-product?tab=accountability selects the tab and scrolls', async ({ page }) => {
    // The composite hash never matches an element id, so nothing scrolls here
    // unless the hook strips the query — the case the deleted ProductExplorer
    // effect used to patch on its own.
    await page.goto('/#explore-product?tab=accountability')

    const tablist = page.getByRole('tablist', { name: 'Product previews' })
    await expect(tablist.getByRole('tab', { name: 'Keep accountability' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await expect(tablist.getByRole('tab', { name: 'Plan work' })).toHaveAttribute(
      'aria-selected',
      'false',
    )
    await expect(page.getByRole('heading', { name: 'Permissions and history' })).toBeInViewport()
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(1000)
  })

  test('product explorer: switching tabs changes the active panel and updates the URL hash', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('heading', { name: 'Explore the product' }).scrollIntoViewIfNeeded()

    const tablist = page.getByRole('tablist', { name: 'Product previews' })
    const planTab = tablist.getByRole('tab', { name: 'Plan work' })
    const coordinateTab = tablist.getByRole('tab', { name: 'Coordinate delivery' })

    await expect(planTab).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('heading', { name: 'Client context and backlog' })).toBeVisible()

    await coordinateTab.click()

    await expect(coordinateTab).toHaveAttribute('aria-selected', 'true')
    await expect(planTab).toHaveAttribute('aria-selected', 'false')
    await expect(page.getByRole('heading', { name: 'Track and move work' })).toBeVisible()
    await expect(page).toHaveURL(/#explore-product\?tab=coordinate$/)
  })

  test('final CTA demo deep link navigates to /login with the admin account prefilled', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: 'Open administrator demo' }).click()

    await expect(page).toHaveURL(/\/login\?demo=admin$/)
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
    await expect(page.getByLabel('Email address')).toHaveValue('admin@briefline.demo')
    await expect(page.getByLabel('Password')).toHaveValue('briefline-demo-2026')
  })

  test('has no serious or critical axe violations', async ({ page }) => {
    // The workflow section's T4.4 reveal motion starts steps at opacity:0
    // and fades them in via IntersectionObserver; scanning mid-transition
    // makes axe read a transient blended color as a contrast failure that
    // doesn't exist in the steady state. `reduced-motion` is the app's own
    // documented escape hatch (Landing.css: forces opacity:1, no
    // transition) and is also the correct state to audit — AT users often
    // browse with it on.
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    await page.getByRole('heading', { name: 'Client work, clearly owned.' }).waitFor()

    const results = await new AxeBuilder({ page }).include('body').analyze()
    const serious = results.violations.filter(
      (violation) => violation.impact === 'serious' || violation.impact === 'critical',
    )
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([])
  })

  test('renders at 320px without horizontal scroll', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 })
    await page.goto('/')
    await page.getByRole('heading', { name: 'Client work, clearly owned.' }).waitFor()

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
  })
})
