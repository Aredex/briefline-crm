#!/usr/bin/env bash
# E2E API boot (INT-002/003) — normal boot sequence: deploy migrations, reset
# the database to a known fixture state, build the API, run the compiled
# server. The Prisma client lives inside apps/api/src (render-build-path-fix
# plan, ADR-005), so the build lands at the expected dist/main.js and the
# generated client is plain CJS — no rootDir hoist and no ESM/CJS patching
# needed anymore.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
cd "$ROOT"

pnpm --filter @briefline/api prisma:deploy
# prisma:reset (TRUNCATE CASCADE + re-seed), not prisma:seed: a previous run's
# journey may have left rows (clients/tasks/TaskChange with runtime IDs) that
# the seed's fixture-id deleteMany cannot clear — the orphaned TaskChange rows
# then fail the FK on task.deleteMany (seed.ts:638).
pnpm --filter @briefline/api prisma:reset
pnpm --filter @briefline/api build

exec node apps/api/dist/main.js
