// OpenAPI document loader for Swagger UI (api-docs-link plan, F1).
//
// packages/api-contract/openapi.yaml is the single source of truth for the API
// contract (ADR-005, see packages/api-contract/src/index.ts) — no controller in
// this app carries @nestjs/swagger decorators. Instead of generating the document
// from decorators, we parse the existing YAML file and hand the plain object to
// SwaggerModule.setup() (which accepts a pre-built OpenAPIObject, no decorators
// required). This keeps a single contract shared by codegen (openapi-typescript),
// contract tests, and the docs UI, with zero risk of runtime/contract drift.
import { readFileSync } from 'node:fs'
import { load } from 'js-yaml'
import type { OpenAPIObject } from '@nestjs/swagger'

let cachedDocument: OpenAPIObject | undefined

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Minimal structural validation of the parsed YAML — just enough to fail fast
 * (D5) with a clear message if the contract file is missing, malformed, or not
 * an OpenAPI 3.x document, instead of silently mounting a broken /api/docs.
 */
function assertIsOpenApiDocument(value: unknown, resolvedPath: string): asserts value is OpenAPIObject {
  if (!isRecord(value)) {
    throw new Error(`OpenAPI document at ${resolvedPath} did not parse to an object`)
  }

  const { openapi, info, paths } = value

  if (typeof openapi !== 'string' || !openapi.startsWith('3.')) {
    throw new Error(`OpenAPI document at ${resolvedPath} has an invalid or missing "openapi" version field`)
  }

  if (info === undefined || info === null) {
    throw new Error(`OpenAPI document at ${resolvedPath} is missing the required "info" field`)
  }

  if (!isRecord(paths) || Object.keys(paths).length === 0) {
    throw new Error(`OpenAPI document at ${resolvedPath} has no paths defined`)
  }
}

/**
 * Loads and validates packages/api-contract/openapi.yaml, memoized after the
 * first call. Resolved via the package's "./openapi.yaml" export subpath so the
 * lookup works identically in dev (ts-node/nest start) and in the production
 * build (dist/), where a relative path would break if outDir depth changes.
 */
export function loadOpenApiDocument(): OpenAPIObject {
  if (cachedDocument) {
    return cachedDocument
  }

  const resolvedPath = require.resolve('@briefline/api-contract/openapi.yaml')
  const raw = readFileSync(resolvedPath, 'utf8')
  const parsed: unknown = load(raw)

  assertIsOpenApiDocument(parsed, resolvedPath)

  cachedDocument = parsed
  return cachedDocument
}
