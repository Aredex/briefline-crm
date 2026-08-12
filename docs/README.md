# Documentation Index — Briefline CRM

Master index of all project documentation: product specs, architecture records, development
plans, design specifications, operations runbooks, and reference contracts.

**Scope:** `docs/*.md`, `.claude/plans/*.md`, `README.md`, `packages/api-contract/openapi.yaml`.
**Total:** 37 documents. **Languages:** EN = English, ES = Spanish.

> Note: the root `README.md` also contains a short "Documentation Index" table listing the
> most important documents; this file is the complete one.

---

## Product

| Document | Description | Lang |
|---|---|---|
| [docs/00-project-brief.md](00-project-brief.md) | Approved project brief: goals, scope, audiences, and non-goals | ES |
| [docs/01-decision-log.md](01-decision-log.md) | Decision log (DEC-001+) with statuses: Confirmed / Provisional / Open | ES |
| [docs/02-prd.en.md](02-prd.en.md) | Product requirements document, baseline v1 (English) | EN |
| [docs/02-prd.es.md](02-prd.es.md) | Product requirements document, baseline v1 (Spanish) | ES |
| [docs/05-landing-footer-spec.es.md](05-landing-footer-spec.es.md) | Approved spec for the public landing page and footer: copy, UX, accessibility, acceptance criteria | ES |
| [docs/08-landing-page.md](08-landing-page.md) | Implemented landing page documentation: sections, copy, layout, visual design, accessibility, screenshot | EN |

## Architecture

| Document | Description | Lang |
|---|---|---|
| [.claude/plans/adrs.md](../.claude/plans/adrs.md) | Architecture Decision Records ADR-001–005: cookies/CSRF, identity, timezone, concurrency, monorepo | EN |
| [.claude/plans/architecture-diagrams.md](../.claude/plans/architecture-diagrams.md) | C4 diagrams (system context, containers, components) in Mermaid | EN |
| [.claude/plans/data-model.md](../.claude/plans/data-model.md) | Database schema for User, Client, Task, TaskChange + ERD | EN |
| [.claude/plans/permission-matrix.md](../.claude/plans/permission-matrix.md) | Full permission matrix: operations × roles × states with canonical HTTP statuses | EN |
| [.claude/plans/consolidated-api-baseline.md](../.claude/plans/consolidated-api-baseline.md) | Canonical baseline of authorized dependencies and allowed APIs (mandatory read before coding) | ES |
| [.claude/plans/technology-matrix.md](../.claude/plans/technology-matrix.md) | 52 dependencies with exact verified versions and official docs | EN |
| [.claude/plans/openapi-and-errors.md](../.claude/plans/openapi-and-errors.md) | API contract design (v1) and error catalogue (RFC 9457 problem details) | EN |

## Development

| Document | Description | Lang |
|---|---|---|
| [docs/03-documentation-baseline.en.md](03-documentation-baseline.en.md) | Official documentation baseline: permitted sources and patterns (English) | EN |
| [docs/03-documentation-baseline.es.md](03-documentation-baseline.es.md) | Official documentation baseline (Spanish) | ES |
| [docs/plans/04-development-plan.en.md](plans/04-development-plan.en.md) | Master development plan: 17 phases, tasks, gates (English) | EN |
| [docs/plans/04-development-plan.es.md](plans/04-development-plan.es.md) | Master development plan (Spanish) | ES |
| [.claude/plans/agent-contribution-guide.md](../.claude/plans/agent-contribution-guide.md) | Rules and source hierarchy for implementation agents | ES |
| [.claude/plans/backend-api-verification.md](../.claude/plans/backend-api-verification.md) | Verified backend library APIs (NestJS 11, Prisma 7, PostgreSQL) | ES |
| [.claude/plans/frontend-api-verification.md](../.claude/plans/frontend-api-verification.md) | Verified frontend library APIs (React 19, Vite, TanStack Query, dnd-kit) | EN |
| [.claude/plans/devops-platform-validation.md](../.claude/plans/devops-platform-validation.md) | Render, Neon, and GitHub Actions limits and capabilities revalidation | ES |
| [.claude/plans/qa-tooling-verification.md](../.claude/plans/qa-tooling-verification.md) | Verified QA tooling: Vitest, Testcontainers, Playwright, axe-core | ES |
| [.claude/plans/test-matrix.md](../.claude/plans/test-matrix.md) | Requirement-to-test matrix (162 rows) with coverage thresholds | EN |
| [.claude/plans/ph02-scaffold-summary.md](../.claude/plans/ph02-scaffold-summary.md) | PH-02 scaffold summary: monorepo setup (REP-001..006) | ES |
| [.claude/plans/ph02-devops-summary.md](../.claude/plans/ph02-devops-summary.md) | PH-02 DevOps summary: local PostgreSQL compose + initial CI | ES |
| [.claude/plans/ph11-test-expansion.md](../.claude/plans/ph11-test-expansion.md) | PH-11 QA-002: unit test expansion results (web 131, api 47) | ES |
| [.claude/plans/ph12-code-changes.md](../.claude/plans/ph12-code-changes.md) | PH-12 code changes: unified production build, health endpoint, daily reset | ES |
| [.claude/plans/ph13-contract-anti-pattern-audit.md](../.claude/plans/ph13-contract-anti-pattern-audit.md) | PH-13 REL-002/003: OpenAPI ↔ runtime contract and anti-pattern audit | EN |
| [.claude/plans/ph14-login-loop-diagnosis.md](../.claude/plans/ph14-login-loop-diagnosis.md) | PH-14 diagnosis of the login refresh loop (no code changes applied) | ES |

## Design

| Document | Description | Lang |
|---|---|---|
| [.claude/plans/ux-wireframes-tokens.md](../.claude/plans/ux-wireframes-tokens.md) | UX specification: sitemap, wireframes, design tokens, responsive and accessibility contract | EN |
| [.claude/plans/ph11-a11y-performance.md](../.claude/plans/ph11-a11y-performance.md) | PH-11 accessibility (axe) and performance audit results | EN |
| [.claude/plans/ph11-browser-matrix.md](../.claude/plans/ph11-browser-matrix.md) | PH-11 QA-008: supported browser matrix | ES |

## Operations

| Document | Description | Lang |
|---|---|---|
| [.claude/plans/ph11-security-review.md](../.claude/plans/ph11-security-review.md) | SEC-002: exhaustive security review (low-medium risk verdict, hardening items) | ES |
| [.claude/plans/ph12-operations-runbook.md](../.claude/plans/ph12-operations-runbook.md) | Deploy, rollback, credential rotation, and daily reset runbook | EN |
| [.claude/plans/ph13-exit-checklist.md](../.claude/plans/ph13-exit-checklist.md) | PH-13 REL-001: PRD exit checklist — every functional requirement verified | EN |

## Reference

| Document | Description | Lang |
|---|---|---|
| [README.md](../README.md) | Root readme: architecture, quick start, scripts, API summary, security, deployment, free-tier limits | EN |
| [packages/api-contract/openapi.yaml](../packages/api-contract/openapi.yaml) | OpenAPI 3.1 contract: the API specification served at `/api/docs` | EN |

---

*Index maintained by hand. When adding a document, add it here with a one-line description
and its language (EN/ES).*
