/*
 * Dev-only MSW bootstrap — imported dynamically from main.tsx guarded by
 * import.meta.env.DEV && VITE_ENABLE_MOCKS === 'true', so this module never
 * lands in the production bundle (guard INT-001).
 *
 * Requires the worker script: `pnpm --filter @briefline/web exec msw init public`
 * (run once after installing dependencies).
 */
export async function enableMocking() {
  const { setupWorker } = await import('msw/browser')
  const { handlers } = await import('./handlers')
  const worker = setupWorker(...handlers)
  await worker.start({ onUnhandledRequest: 'bypass' })
}
