#!/usr/bin/env bash
# E2E API boot (INT-002/003) — the repo's `pnpm dev` cannot boot the API
# under Node 24:
#   1. `nest build` hoists rootDir (the app imports the generated Prisma
#      client from packages/api-contract/src/...), so the entry lands at
#      dist/apps/api/src/main.js while the `start` script hardcodes
#      dist/main.
#   2. The emitted client.js carries `import.meta.url` inside otherwise-CJS
#      code; Node 24's module detection treats the file as ESM and crashes
#      with "exports is not defined in ES module scope".
# This script builds from source and patches the emitted artifact (dist/ is
# regenerable — source is untouched), then runs the real server.
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

CLIENT_JS="apps/api/dist/packages/api-contract/src/generated/prisma/client.js"
test -f "$CLIENT_JS" || {
  echo "E2E boot: expected $CLIENT_JS from the build, missing — check the build output" >&2
  exit 1
}
sed -i.bak \
  "s|globalThis\['__dirname'\] = path.dirname((0, node_url_1.fileURLToPath)(import.meta.url));|globalThis['__dirname'] = __dirname;|" \
  "$CLIENT_JS"
rm -f "${CLIENT_JS}.bak"

exec node apps/api/dist/apps/api/src/main.js
