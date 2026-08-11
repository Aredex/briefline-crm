# Official Documentation Baseline

**Status:** Phase 0 complete  
**Review date:** 2026-08-11  
**Spanish counterpart:** `03-documentation-baseline.es.md`

This document defines the permitted sources and patterns that implementation plans must consult. Library availability does not authorize invented APIs: every phase must verify the pinned version and follow patterns from official documentation.

## Preliminary allowed stack

- React 19, TypeScript, and Vite; no Create React App.
- NestJS 11 and Node.js 24 LTS.
- PostgreSQL, with the final version constrained by the selected provider.
- Prisma ORM with versioned migrations.
- OpenAPI/Swagger generated from NestJS.
- Argon2id as the preferred password-hashing algorithm.

## Primary sources

- [React versions](https://react.dev/versions) and [sunsetting Create React App](https://react.dev/blog/2025/02/14/sunsetting-create-react-app).
- NestJS [authentication](https://docs.nestjs.com/security/authentication), [authorization](https://docs.nestjs.com/security/authorization), [validation](https://docs.nestjs.com/techniques/validation), [configuration](https://docs.nestjs.com/techniques/configuration), [OpenAPI](https://docs.nestjs.com/openapi/introduction), [rate limiting](https://docs.nestjs.com/security/rate-limiting), and [migration guide](https://docs.nestjs.com/migration-guide).
- Prisma [transactions](https://www.prisma.io/docs/orm/prisma-client/queries/transactions) and [migration workflow](https://www.prisma.io/docs/orm/prisma-migrate/workflows/development-and-production).
- PostgreSQL [constraints](https://www.postgresql.org/docs/current/ddl-constraints.html) and [indexes](https://www.postgresql.org/docs/current/indexes.html).
- OWASP [REST Security](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html), [Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), and [API Security Top 10](https://owasp.org/API-Security/editions/2023/en/0x11-t10/).
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/), [WAI-ARIA APG](https://www.w3.org/WAI/ARIA/apg/), and [WAI Forms](https://www.w3.org/WAI/tutorials/forms/).

## Allowed technical patterns

- `APP_GUARD` for secure-by-default authentication with explicitly public routes.
- `JwtModule.registerAsync`, `JwtService.signAsync`, and `verifyAsync`.
- `@Roles`, `RolesGuard`, plus object-level authorization inside the use case.
- `ValidationPipe` with `whitelist`, `forbidNonWhitelisted`, and `transform`.
- `ConfigModule.forRoot` with startup-blocking configuration validation.
- `SwaggerModule`, `DocumentBuilder`, and documented bearer authentication.
- `ThrottlerModule`, `ThrottlerGuard`, and a login-specific limit.
- Prisma `$transaction` for task mutation plus history.
- `prisma migrate dev` in development only and `prisma migrate deploy` in CI/production.
- PK, FK, `NOT NULL`, `UNIQUE`, `CHECK`, and indexes justified by query patterns.
- Native HTML, limited explicit focus management, and accessible status messages.
- A permanent `Move to…` control as the contractual alternative to drag-and-drop.

## Derived requirements

- Re-check that the user is active on every authenticated request.
- Authorize every object addressed by ID to prevent BOLA.
- Never accept complete domain objects from request bodies.
- Pin the JWT algorithm and validate `iss`, `aud`, `exp`, and signature.
- Do not store access tokens in `localStorage` or `sessionStorage`; the authentication ADR will define the alternative.
- Limit request body size, field lengths, pagination, and request frequency.
- Keep transactions short and free of network calls.
- Represent state, priority, and errors through text, not color alone.
- Preserve information and functionality at 320 CSS px and 400% zoom.
- Meet 4.5:1 contrast for normal text and 3:1 for large text and meaningful controls.
- Use an internal 44 × 44 CSS px target for primary touch actions.
- Allow paste, autocomplete, and password managers on login.

## Prohibited anti-patterns

- Opt-in authentication endpoint by endpoint.
- Treating hidden frontend controls or unpredictable IDs as authorization.
- Reusing Prisma models as DTOs or permitting mass assignment.
- Hardcoded secrets, plain passwords, or tokens persisted in web storage.
- `db push`, `migrate reset`, or `migrate dev` in production.
- Writing history outside the business transaction.
- Assuming a foreign key automatically creates its local index.
- Nested query filters that depend on the old Express parser.
- Express 5-incompatible wildcards or optional parameters.
- Drag-and-drop as the only mechanism.
- Deprecated `aria-grabbed` or `aria-dropeffect`.
- Clickable `div` elements, placeholders as labels, or hover-only actions.
- Declaring `role="grid"` without implementing its complete keyboard model.
- Marking a non-modal drawer as `aria-modal="true"`.

## Verification required by future plans

Every implementation phase must include:

1. The exact documentation version consulted.
2. The official section or example to follow.
3. A functional and automated verification checklist.
4. An explicit search for applicable anti-patterns.
5. Test evidence, not merely the presence of code.

