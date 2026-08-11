/*
 * App root — provider order (PH-07): ErrorBoundary > QueryProvider >
 * AuthProvider > RouterProvider. Live regions (one role="status", one
 * role="alert") are mounted once here, app-wide.
 */
// Single react-router entry across the app: vitest resolves 'react-router/dom'
// and 'react-router' as separate module instances (CJS vs ESM), which breaks
// RouterProvider context for useRouteError in tests. The main entry exports
// the same DOM RouterProvider (AP-16).
import { RouterProvider } from 'react-router'
import { AuthProvider } from './providers/AuthProvider'
import { ErrorBoundary } from './providers/ErrorBoundary'
import { QueryProvider } from './providers/QueryProvider'
import { router as productionRouter } from './router'
import type { RouterProviderProps } from 'react-router'

export interface AppProps {
  /**
   * Router to mount. Defaults to the production singleton; tests pass a fresh
   * createAppRouter() per render so navigation state never leaks between
   * tests (see router.tsx).
   */
  router?: RouterProviderProps['router']
}

export function App({ router = productionRouter }: AppProps = {}) {
  return (
    <ErrorBoundary>
      <QueryProvider>
        <AuthProvider>
          <RouterProvider router={router} />
          {/* App-wide live regions (a11y contract: exactly one of each) */}
          <div className="sr-only" role="status" aria-live="polite" data-live-region="status" />
          <div className="sr-only" role="alert" aria-live="assertive" data-live-region="alert" />
        </AuthProvider>
      </QueryProvider>
    </ErrorBoundary>
  )
}
