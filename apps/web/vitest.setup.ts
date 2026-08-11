/*
 * Vitest global setup — jest-dom matchers + session reset.
 *
 * jsdom's Location#assign is non-writable and non-configurable, so it cannot
 * be spied. It doesn't need to be: the API client guards redirects with
 * try/catch (jsdom does not navigate), and AuthProvider registers an
 * unauthorized handler that navigates via the router instead of
 * window.location.assign (see client.ts redirectToLogin).
 */
import '@testing-library/jest-dom/vitest'
import { setCsrfToken, setSession } from './src/lib/auth-session'
import { mockResetData } from './src/mocks/handlers'

// Module-level state persists across tests — always reset it.
afterEach(() => {
  // Handlers mutate the shared fixtures (archive/create/rename); a later test
  // in the same file must see the original data.
  mockResetData()
  setSession(null)
  setCsrfToken(null)
})
