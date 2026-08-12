// Mounts Swagger UI at /api/docs from the pre-built OpenAPI document (no
// decorators — see openapi-document.ts and ADR-005). Kept as its own module so
// main.ts stays a thin bootstrap sequence.
import { SwaggerModule } from '@nestjs/swagger'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { loadOpenApiDocument } from './openapi-document'

export function setupApiDocs(app: NestExpressApplication): void {
  SwaggerModule.setup('docs', app, loadOpenApiDocument(), {
    useGlobalPrefix: true, // globalPrefix 'api' -> /api/docs (the URI version prefix does not apply)
    customSiteTitle: 'Briefline CRM API — OpenAPI 3.1',
    swaggerOptions: {
      validatorUrl: null, // do not leak the spec to validator.swagger.io (D8)
      withCredentials: true, // the HttpOnly session cookie travels on "Try it out" GETs
      supportedSubmitMethods: ['get'], // unsafe methods would just 403 on CSRF from this UI
      docExpansion: 'list',
      persistAuthorization: false,
    },
    // No customJsStr: it's the only Swagger UI option that would inject an
    // inline <script>, which the default helmet CSP (script-src 'self') blocks.
    // `raw` is left at its default `true`, which also exposes /api/docs-json
    // and /api/docs-yaml.
  })
}
