/**
 * @briefline/api-contract — integration boundary (ADR-005).
 *
 * The OpenAPI v1 document (openapi.yaml) is the single source of truth.
 * Generated TypeScript types live in src/generated/api-types.ts and are produced
 * by `pnpm --filter @briefline/api-contract generate`; generated files are never
 * hand-edited and regeneration must produce no diff (REP-006).
 */
export type * from './generated/api-types'
