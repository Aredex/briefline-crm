/*
 * MSW node server — used by the Vitest test suite (imported only from test
 * files and never from app code, so it cannot reach the production bundle).
 */
import { setupServer } from 'msw/node'
import { handlers } from './handlers'

export const server = setupServer(...handlers)
