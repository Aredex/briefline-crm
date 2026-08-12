/*
 * `/api/docs` e2e (plan api-docs-link, F2/T2.2) — verifies in a real browser
 * what F1's CSP research (plan §1.1) only predicted by reading helmet's
 * default directives and the `@nestjs/swagger` HTML template: that Swagger
 * UI renders under the existing CSP with zero custom `contentSecurityPolicy`
 * changes. No login, no seed: `/api/docs` is a public read-only route, same
 * class of spec as landing.spec.ts.
 *
 * Deliberately NOT part of the axe suite (landing.spec.ts): Swagger UI ships
 * its own markup with known, third-party accessibility violations we don't
 * maintain. Running axe against it would put the suite in red for code that
 * isn't ours to fix — do not add this page to an axe pass later.
 */
import { test, expect } from '@playwright/test'

test.describe('/api/docs', () => {
  test('serves a working Swagger UI with zero CSP violations', async ({ page }) => {
    const cspViolations: string[] = []
    const pageErrors: string[] = []

    page.on('console', (msg) => {
      if (msg.type() === 'error' && msg.text().includes('Content Security Policy')) {
        cspViolations.push(msg.text())
      }
    })
    page.on('pageerror', (err) => {
      pageErrors.push(err.message)
    })

    await page.addInitScript(() => {
      ;(window as unknown as { __cspViolations: string[] }).__cspViolations = []
      document.addEventListener('securitypolicyviolation', (e) => {
        ;(window as unknown as { __cspViolations: string[] }).__cspViolations.push(
          `${e.violatedDirective}: ${e.blockedURI}`,
        )
      })
    })

    const response = await page.goto('/api/docs')
    expect(response?.status()).toBe(200)
    expect(response?.headers()['content-type']).toContain('text/html')

    // Swagger UI renders asynchronously — wait for the real spec title, not
    // just the empty `#swagger-ui` shell, to prove the YAML was parsed.
    await expect(page.locator('#swagger-ui .info .title')).toContainText('Briefline CRM API')

    const opblockCount = await page.locator('.opblock').count()
    expect(opblockCount).toBeGreaterThan(10)

    const initScriptViolations = await page.evaluate(
      () => (window as unknown as { __cspViolations: string[] }).__cspViolations,
    )
    expect(initScriptViolations).toEqual([])
    expect(cspViolations).toEqual([])
    expect(pageErrors).toEqual([])
  })

  test('GET /api/docs-json serves the parsed OpenAPI 3.1 document', async ({ request }) => {
    const response = await request.get('/api/docs-json')
    expect(response.status()).toBe(200)

    const body = await response.json()
    expect(body.openapi).toMatch(/^3\.1/)
  })

  test('the docs cache exemption does not leak into /api/v1/* (regression)', async ({ request }) => {
    const response = await request.get('/api/v1/health')
    expect(response.headers()['cache-control']).toBe('no-store')
  })
})
