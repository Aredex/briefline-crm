// Unit tests for the OpenAPI document loader (openapi-document.ts, api-docs-link
// plan F1). No Docker/network involved: this just parses the YAML file that
// ships with the repo (packages/api-contract/openapi.yaml, ADR-005).
import { describe, expect, it } from 'vitest'
import { loadOpenApiDocument } from '../../src/docs/openapi-document'

describe('loadOpenApiDocument', () => {
  it('does not throw and returns a document', () => {
    expect(() => loadOpenApiDocument()).not.toThrow()
    expect(loadOpenApiDocument()).toBeDefined()
  })

  it('parses an OpenAPI 3.1 document with the expected title', () => {
    const document = loadOpenApiDocument()
    expect(document.openapi.startsWith('3.1')).toBe(true)
    expect(document.info.title).toBe('Briefline CRM API')
  })

  it('has at least one path defined', () => {
    const document = loadOpenApiDocument()
    expect(Object.keys(document.paths ?? {}).length).toBeGreaterThan(0)
  })

  it('declares /api/v1 as the server URL so "Try it out" targets the right base', () => {
    const document = loadOpenApiDocument()
    expect(document.servers?.[0]?.url).toBe('/api/v1')
  })
})
