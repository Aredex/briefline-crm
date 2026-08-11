# PH-02 Scaffold Summary — REP-001/002/003/004/006

**Date:** 2026-08-11
**Author:** full-stack dev agent (PH-02)
**Scope:** REP-001, REP-002, REP-003, REP-004, REP-006. REP-005 (Compose) y CI-001/DOC-007 no están en este scope (aparecen otros archivos creados en paralelo — `.github/workflows/ci.yml`, `docker/compose.yml`, `.env.example` — dejados intactos).

## Archivos creados

```
/Users/ac/develop_projects/portfolio/briefline-crm/
├── pnpm-workspace.yaml                    REP-001
├── package.json                           REP-001/REP-002 (root scripts, engines, packageManager)
├── tsconfig.base.json                     REP-003 (strict, ES2024, NodeNext, noUncheckedIndexedAccess)
├── eslint.config.mjs                      REP-004 (flat config, ESLint 10, typescript-eslint, react plugins)
├── .prettierrc / .prettierignore          REP-004
├── .gitignore                             REP-001 (generated contract types NOT ignored — ADR-005 REP-006)
├── .nvmrc / .node-version                 Node 24.19.0
├── .npmrc                                 engine-strict=true (REP-002)
├── apps/api/
│   ├── package.json                       NestJS 11.1.29, pines exactos
│   ├── tsconfig.json                      experimentalDecorators, emitDecoratorMetadata, strictPropertyInitialization: false
│   ├── tsconfig.build.json                (extra — necesario para `nest build`, que no puede emitir con noEmit)
│   ├── nest-cli.json
│   ├── src/main.ts                        bootstrap placeholder (global prefix /api, PORT)
│   ├── src/app.module.ts                  placeholder (PH-04 reemplaza)
│   └── test/placeholder.spec.ts           smoke test (mantiene los scripts lint/test funcionales)
├── apps/web/
│   ├── package.json                       React 19.2.8, Vite 8.2.1, pines exactos
│   ├── tsconfig.json                      jsx react-jsx, lib ES2024+DOM, types vitest/globals+node
│   ├── vite.config.ts                     plugin react + proxy /api → localhost:3000 (ADR-001/005)
│   ├── index.html
│   ├── src/main.tsx                       placeholder (PH-07 reemplaza)
│   └── test/smoke.spec.ts                 smoke test
└── packages/api-contract/
    ├── package.json                       generate/validate/typecheck/lint, exports → src/generated/api-types.ts
    ├── tsconfig.json                      declaration + emitDeclarationOnly
    ├── openapi.yaml                       OpenAPI v1 COMPLETO extraído fielmente (líneas 33–3122) de
    │                                      .claude/plans/openapi-and-errors.md — 3090 líneas, validado con PyYAML
    ├── src/index.ts                       re-export del generated (único punto de entrada del paquete)
    └── src/generated/.gitkeep             tipos generados se commitearán tras `pnpm generate` (ADR-005)
```

## Pines verificados en npm (2026-08-11, regla R-2)

`npm view <pkg> version` — pines NO presentes en el technology-matrix, resueltos y verificados:

| Package | Pin | Nota |
|---|---|---|
| eslint | 10.8.1 | typescript-eslint 8.67.0 declara peer `eslint ^8.57 \|\| ^9 \|\| ^10` — compatible |
| @eslint/js | 10.0.1 | alineado con eslint 10 |
| typescript-eslint | 8.67.0 | peer typescript `>=4.8.4 <6.1.0` — 5.9.3 OK |
| eslint-plugin-react | 7.37.5 | reglas aplicadas solo a apps/web/** |
| eslint-plugin-react-hooks | 7.1.1 | rules-of-hooks/exhaustive-deps manuales (independiente del shape de flat configs) |
| prettier | 3.9.6 | |
| openapi-typescript | 7.13.0 | `--check` verificado en Context7: exit 0 si el output está al día, 1 si stale |
| reflect-metadata | 0.2.2 | estructural de NestJS (ausente del matrix — pendiente de añadir) |
| rxjs | 7.8.2 | idem |
| @types/react / @types/react-dom | 19.2.18 / 19.2.4 | idem |
| @prisma/adapter-pg | 7.9.1 | CR-08 resuelto (misma línea que Prisma 7.9.1) |
| supertest / @types/supertest | 7.2.2 / 7.2.1 | CR-09 resuelto |
| @testcontainers/postgresql | 12.1.0 | CR-09 resuelto |
| @axe-core/playwright | 4.12.1 | CR-10 resuelto (mismo pin que @axe-core/react) |
| @types/express | 5.0.6 | CR-12 resuelto (Express 5) |
| pnpm | 10.34.5 | última 10.x del registro, alineado con ADR-005 "pnpm 10" |

**ACCIÓN PENDIENTE para PH-00:** añadir estos pines al technology-matrix (cierra los pendientes CR-07..CR-12 + estructurales).

## Decisiones tomadas

1. **Sin Turborepo/concurrently (ADR-005 punto 7).** `dev` = `pnpm -r --parallel run dev`; `build` = `pnpm -r build` (orden topológico por dependencias: contract → api/web gracias a `"@briefline/api-contract": "workspace:*"` declarado en ambos apps).
2. **`workspace:*` en api y web** — el contrato es la frontera de integración (ADR-005); declararlo desde el inicio garantiza el orden de build y la resolución de Vite vía `exports`.
3. **`exports: { ".": "./src/generated/api-types.ts" }` en api-contract** — sin build de runtime: Vite transpila el .ts directo; tsc de los apps resuelve vía `paths` de tsconfig.base (doble mecanismo, sin "tercer modelo a mano").
4. **Orden de bootstrap (REQUERIDO, REP-006):** `pnpm install` → `pnpm --filter @briefline/api-contract generate` → `pnpm typecheck`. `src/index.ts` re-exporta `./generated/api-types`; hasta que exista el archivo generado, el typecheck del paquete no compila — esperado (el CI correrá generate primero).
5. **`validate` script = generate con `--check`** — valida que openapi.yaml es parseable Y que el generated commitado está al día (guard REP-006 "regeneration produces no diff", sin deps extra).
6. **tsconfig.build.json extra en api** — `nest build` no puede emitir con `noEmit: true` de la base; el build file lo desactiva y excluye test/.
7. **Smoke specs en apps/api/test y apps/web/test** — los scripts `lint: "eslint src/ test/"` y `test` fallan sobre directorios vacíos; un spec mínimo los hace correr desde el primer commit.
8. **`start:prod` en api** — contrato de deploy Render (§1.4.1: `startCommand: npm run start:prod`).
9. **engine-strict en .npmrc** + `engines.node >=24.19.0` — REP-002 "incompatible runtime fails clearly".
10. **ESLint flat config root** — ignore de `packages/api-contract/src/generated/**`; `no-console: warn`; `no-unused-vars` TS-aware con ignores `^_`; reglas react solo en `apps/web/**`.
11. **`noUncheckedIndexedAccess: true`** en la base (recomendación del usuario; también lo sugiere la doc oficial de openapi-typescript).
12. **main.ts escucha en `0.0.0.0` con `process.env.PORT`** — requisito Render (§1.4.1).
13. **No se crearon vitest.config / playwright.config** — fuera de scope de la tarea (llegarán con PH-04/PH-07); los scripts ya los referencian por convención de Vitest 4 (`--config`) y Playwright (config auto-detectada).

## Riesgos / notas

- `eslint@10.8.1` es el latest y typescript-eslint lo soporta, pero el plan original decía "ESLint v9+": v10 es ≥ v9, cumple. Si el equipo prefiere 9.x, el pin sería `eslint@9.39.5` (verificado) sin otros cambios.
- `@prisma/adapter-pg@7.9.1`, `supertest@7.2.2`, `@testcontainers/postgresql@12.1.0` resuelven los pines pendientes CR-08/CR-09 y deben entrar al matrix (sección §0) antes de PH-03.
- El openapi.yaml extraído es byte-por-byte el del documento (validado: sin fences markdown, sin secciones coladas; parseado OK con PyYAML).
- Scripts `test:e2e` (api: `vitest run --config vitest.e2e.config.ts`) requieren crear la config e2e en PH-04 — el script existe ya por contrato REP-002.
