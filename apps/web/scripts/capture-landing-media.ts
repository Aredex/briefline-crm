/*
 * capture-landing-media.ts (A5, plan §1 — landing-audit-plan.md)
 *
 * Reproducible media pipeline for the public landing page. Replaces manual
 * screenshots (H6: the old apps/web/public/hero-board.png was a single
 * 374 KiB PNG, no srcset, already over the §19 budget) with real captures of
 * the working application, converted to AVIF/WebP at 1x/2x.
 *
 * PREREQUISITES — this script does NOT boot the stack itself. Start it first:
 *
 *   1. Postgres:     docker compose -f docker/compose.yml up -d
 *   2. Migrate+seed: pnpm --filter @briefline/api prisma:deploy
 *                     pnpm --filter @briefline/api prisma:reset
 *   3. API:           pnpm --filter @briefline/api start   (or `nest start --watch`)
 *   4. Web:           pnpm --filter @briefline/web dev
 *
 * Rationale for not orchestrating boot here (unlike playwright.config.ts's
 * webServer[]): this script is a one-off content pipeline run by a human
 * before a release, not a CI test suite. Reusing whatever dev/e2e stack is
 * already running (and letting the operator choose ports, review the seed,
 * etc.) is simpler than duplicating start-api-for-e2e.sh's Node 24 build
 * workaround here. Override the URLs with WEB_URL / API_URL if your stack
 * isn't on the defaults below.
 *
 * Scenarios captured (audit §7 hero, §10 product explorer, §19 budget):
 *   - board-overview   Task board, several columns + cards (hero, "Coordinate delivery")
 *   - task-history      Task detail with change history ("Keep accountability", `Audited`)
 *   - client-detail      Client detail + related tasks ("Plan work", "01 CLIENT")
 *   - backlog-view       Unassigned backlog table ("02 BACKLOG")
 *   - focus-state        Visible focus ring on an interactive element (Quality a11y evidence)
 *   - move-to-menu       "Move to…" menu open (accessible alternative to drag-and-drop, §10/§13)
 *
 * Skipped: a "409 conflict" scenario (mentioned in the audit as a possible
 * evidence shot). There's no single-page way to force a stale-version PATCH
 * without a second concurrent session mutating the same task mid-capture,
 * and building that harness isn't worth it for one illustrative screenshot.
 * Left out; noted in the T2.1/T2.2 report instead of faking the UI.
 *
 * Output: PNG originals go to a temp dir (deleted unless KEEP_PNG=1), then
 * each is resized/encoded to AVIF + WebP at 1x/2x into apps/web/public/media/.
 */
import { chromium, type Page } from '@playwright/test'
import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import sharp from 'sharp'

const WEB_URL = process.env.WEB_URL ?? 'http://localhost:5173'
const ADMIN_EMAIL = process.env.DEMO_ADMIN_EMAIL ?? 'admin@briefline.demo'
const ADMIN_PASSWORD = process.env.DEMO_PASSWORD ?? 'briefline-demo-2026'

const MEDIA_DIR = path.resolve(import.meta.dirname, '../public/media')
const KEEP_PNG = process.env.KEEP_PNG === '1'

// §19 budget: hero ≤250 KiB, secondary ≤180 KiB — per encoded file (per format, per density).
const KIB = 1024
const BUDGETS: Record<string, number> = {
  'board-overview': 250 * KIB,
  'task-history': 180 * KIB,
  'client-detail': 180 * KIB,
  'backlog-view': 180 * KIB,
  'focus-state': 180 * KIB,
  'move-to-menu': 180 * KIB,
}

// Base (1x) capture width; 2x doubles it. Height is whatever the element is.
const BASE_WIDTH = 1280

async function login(page: Page) {
  await page.goto(`${WEB_URL}/login`)
  await page.getByLabel(/email/i).fill(ADMIN_EMAIL)
  await page.getByLabel(/password/i).fill(ADMIN_PASSWORD)
  await page.getByRole('button', { name: /sign in|log in/i }).click()
  await page.waitForURL(/\/(dashboard|tasks)/, { timeout: 15_000 })
}

async function main() {
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'briefline-landing-media-'))
  await mkdir(MEDIA_DIR, { recursive: true })
  console.log(`[capture] PNG staging dir: ${tmpDir}`)

  const browser = await chromium.launch()
  // deviceScaleFactor: 2 — the PNG comes out at true 2x physical pixels
  // (CSS width * 2). encodeVariants() downsamples for the 1x output and
  // uses the full-resolution capture for 2x, instead of upscaling a 1x
  // screenshot (which would fake retina sharpness with interpolated pixels).
  // Tall viewport avoids Playwright's scroll-and-stitch path for elements
  // taller than the viewport, which produced ghosting artifacts (the
  // previous route's DOM bleeding into the composite) on /tasks/:taskId.
  const context = await browser.newContext({
    viewport: { width: BASE_WIDTH, height: 2200 },
    deviceScaleFactor: 2,
  })
  const page = await context.newPage()

  const pngPaths: Record<string, string> = {}
  const capture = async (name: keyof typeof BUDGETS, selector: string) => {
    const el = page.locator(selector).first()
    await el.waitFor({ state: 'visible', timeout: 15_000 })
    const file = path.join(tmpDir, `${name}.png`)
    await el.screenshot({ path: file })
    // Trim trailing whitespace: several detail pages (e.g. ClientDetail's
    // <main>) don't wrap content in a height-fitted container, so the raw
    // element screenshot includes a lot of empty space below the fold at
    // the tall capture viewport. sharp's trim() removes uniform-color
    // borders without touching the actual content.
    await sharp(file).trim({ background: '#ffffff', threshold: 8 }).toFile(`${file}.trimmed.png`)
    await rm(file)
    await rename(`${file}.trimmed.png`, file)
    pngPaths[name] = file
    console.log(`[capture] ${name} <- ${selector}`)
  }

  try {
    await login(page)

    // ---- board-overview: task board with columns + cards ----
    await page.goto(`${WEB_URL}/tasks`)
    await page.waitForSelector('.task-board__columns')
    await capture('board-overview', '.task-board__columns')

    // ---- backlog-view: the unassigned backlog table ----
    await capture('backlog-view', '.task-backlog')

    // ---- move-to-menu: open the accessible alternative to drag-and-drop ----
    const backlogRow = page.locator('.task-backlog__table').locator('.move-menu__trigger').first()
    await backlogRow.click()
    await page.waitForSelector('.move-menu__dropdown', { state: 'visible' })
    await capture('move-to-menu', '.move-menu')
    await page.keyboard.press('Escape') // close before navigating on

    // ---- focus-state: visible focus ring on an interactive element ----
    // Use a link that is NOT the active route ("Tasks" already carries an
    // .is-active tint that would make the focus ring ambiguous in a static
    // screenshot). Programmatic .focus() still triggers :focus-visible in
    // Chromium absent contrary pointer evidence, so the real 2px brand ring
    // from global.css renders exactly as it would after a real Tab press.
    await page.getByRole('link', { name: 'Clients', exact: true }).focus()
    await capture('focus-state', '.app-shell__header')

    // ---- task-history: task detail page with change history ----
    // Follow a real task link out of the backlog table into /tasks/:taskId.
    const taskLink = page.locator('.task-backlog__table a[href^="/tasks/"]').first()
    await taskLink.click()
    await page.waitForURL(/\/tasks\/[^/]+$/)
    await page.waitForSelector('section[aria-label="History"]')
    // Give the history query a moment to resolve past its loading skeleton
    // (TaskHistory.tsx renders ol.task-history on success, EmptyState on none).
    await page.waitForSelector(
      'section[aria-label="History"] ol.task-history, section[aria-label="History"] .empty-state',
      { timeout: 15_000 },
    )
    await capture('task-history', '.task-detail')

    // ---- client-detail: client with related tasks ----
    await page.goto(`${WEB_URL}/clients`)
    await page.waitForSelector('a.data-table__primary')
    await page.locator('a.data-table__primary').first().click()
    await page.waitForURL(/\/clients\/[^/]+$/)
    await page.waitForSelector('.data-table, .detail-list, main')
    await capture('client-detail', 'main')
  } finally {
    await browser.close()
  }

  // ---- Encode: AVIF + WebP at 1x/2x, enforcing the §19 budget per file ----
  for (const [name, budget] of Object.entries(BUDGETS)) {
    const src = pngPaths[name]
    if (!src) {
      console.warn(`[capture] SKIPPED encode for "${name}" — no PNG captured`)
      continue
    }
    await encodeVariants(name, src, budget)
  }

  if (!KEEP_PNG) {
    await rm(tmpDir, { recursive: true, force: true })
  } else {
    console.log(`[capture] KEEP_PNG=1 — originals left at ${tmpDir}`)
  }

  console.log('[capture] done.')
}

async function encodeVariants(name: string, srcPngPath: string, budgetBytes: number) {
  const image = sharp(srcPngPath)
  const meta = await image.metadata()
  // The source PNG was captured at deviceScaleFactor: 2, so its physical
  // width already equals CSS width * 2 — that IS the 2x asset. The 1x asset
  // is a genuine downsample (not an upscale of a lower-res capture).
  const naturalWidth2x = meta.width ?? BASE_WIDTH * 2

  for (const density of [1, 2] as const) {
    const targetWidth = density === 2 ? naturalWidth2x : Math.round(naturalWidth2x / 2)

    // AVIF — try a descending quality ladder until under budget.
    await encodeUnderBudget({
      label: `${name}@${density}x.avif`,
      outPath: path.join(MEDIA_DIR, `${name}${density === 2 ? '@2x' : ''}.avif`),
      budgetBytes,
      qualities: [55, 45, 38, 32, 26],
      encode: (quality) =>
        sharp(srcPngPath).resize({ width: targetWidth }).avif({ quality, effort: 4 }).toBuffer(),
    })

    // WebP — same ladder, WebP's own quality scale.
    await encodeUnderBudget({
      label: `${name}@${density}x.webp`,
      outPath: path.join(MEDIA_DIR, `${name}${density === 2 ? '@2x' : ''}.webp`),
      budgetBytes,
      qualities: [70, 60, 50, 42, 35],
      encode: (quality) =>
        sharp(srcPngPath).resize({ width: targetWidth }).webp({ quality }).toBuffer(),
    })
  }
}

async function encodeUnderBudget(opts: {
  label: string
  outPath: string
  budgetBytes: number
  qualities: number[]
  encode: (quality: number) => Promise<Buffer>
}) {
  let last: Buffer | null = null
  for (const quality of opts.qualities) {
    const buffer = await opts.encode(quality)
    last = buffer
    if (buffer.byteLength <= opts.budgetBytes) {
      await writeFile(opts.outPath, buffer)
      console.log(
        `[encode] ${opts.label}: ${(buffer.byteLength / 1024).toFixed(1)} KiB @ q${quality} (budget ${(opts.budgetBytes / 1024).toFixed(0)} KiB)`,
      )
      return
    }
  }
  // Every quality step exceeded budget — write the smallest attempt anyway and warn loudly.
  if (last) {
    await writeFile(opts.outPath, last)
    console.warn(
      `[encode] ${opts.label}: ${(last.byteLength / 1024).toFixed(1)} KiB EXCEEDS budget ${(opts.budgetBytes / 1024).toFixed(0)} KiB even at lowest quality — revisit the source capture (crop tighter, reduce content density)`,
    )
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
