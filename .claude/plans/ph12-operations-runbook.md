# PH-12 — Operations Runbook & Deploy Documentation

**Date:** 2026-08-11
**Status:** Code changes in progress (agent: OPS-001/004/006)

---

## OPS-002: Render Service Deployment

### Service Configuration (render.yaml equivalent)

```yaml
# Render Blueprint (render.yaml) — colocar en la raíz del repo
services:
  - type: web
    name: briefline-api
    env: node
    region: frankfurt  # más cercano a Neon eu-central-1
    plan: free
    buildCommand: pnpm install --frozen-lockfile && pnpm --filter @briefline/web build && pnpm --filter @briefline/api build
    startCommand: pnpm --filter @briefline/api start:deploy
    healthCheckPath: /api/v1/health
    envVars:
      - key: NODE_ENV
        value: production
      - key: DATABASE_URL
        sync: false  # Neon pooled connection
      - key: DIRECT_URL
        sync: false  # Neon direct connection (migrations)
      - key: JWT_SECRET
        sync: false
      - key: CSRF_SECRET
        sync: false
      - key: CORS_ORIGINS
        value: https://briefline.onrender.com
      - key: PORT
        value: "3000"
```

### Render Free Tier Constraints
- **750 hours/month** across all services
- **15-minute spin-down** after inactivity → cold starts expected
- **Bandwidth:** 100 GB/month
- **Build timeout:** 60 minutes
- **No persistent disk** — database must be external (Neon)

### Deploy Flow
1. Push to `main` → Render auto-deploys (or manual deploy)
2. `buildCommand` runs: install → build web → build API
3. `startCommand` runs: `prisma migrate deploy` → `node dist/main.js`
4. Health check on `/api/v1/health` confirms live
5. Cold start: ~30-60 seconds for free tier wake-up

---

## OPS-003: Neon PostgreSQL

### Setup
1. Create Neon project in `eu-central-1` (Frankfurt — closest to Render Frankfurt)
2. Create database `briefline`
3. Copy **pooled connection string** → `DATABASE_URL`
4. Copy **direct connection string** → `DIRECT_URL` (for Prisma migrations)
5. Enable **connection pooling** in Neon dashboard
6. Set pool size: 5 (Neon free tier default)

### Connection Strings
```
DATABASE_URL=postgresql://briefline:[PASSWORD]@[HOST]-pooler.eu-central-1.aws.neon.tech/briefline?sslmode=require&pgbouncer=true
DIRECT_URL=postgresql://briefline:[PASSWORD]@[HOST].eu-central-1.aws.neon.tech/briefline?sslmode=require
```

### Neon Free Tier Constraints
- **0.5 GB storage**
- **1 GB RAM** (shared compute)
- **100 hours/month** active time (compute auto-suspends after 5 min idle)
- **No backups** on free tier → daily reset script is the recovery mechanism
- **SSL enforced** (`sslmode=require`)

### Prisma + Neon Compatibility
- Prisma 7 supports `pgbouncer=true` in the connection string
- `DIRECT_URL` used for migrations (avoids PgBouncer limitations)
- `DATABASE_URL` used for runtime queries (pooled, lower latency)
- Driver: `@prisma/client` with `pg` (not `neon` serverless driver — Prisma 7 doesn't support it yet)

---

## OPS-005: Secrets Management

### Required Secrets

| Secret | Purpose | Rotation | Where |
|---|---|---|---|
| `DATABASE_URL` | Neon pooled connection | Never (static) | Render + GitHub |
| `DIRECT_URL` | Neon direct connection | Never (static) | Render |
| `JWT_SECRET` | HS256 JWT signing | Every 90 days | Render |
| `CSRF_SECRET` | CSRF token signing | Every 90 days | Render |

### Rotation Steps
1. Generate new secret: `openssl rand -hex 64`
2. Update in Render dashboard (service → Environment)
3. Deploy (redeploy triggers new build)
4. All existing sessions invalidated — users re-login

### Secret Inventory (NEVER commit)
- `.env` — local development only, gitignored
- `.env.example` — template only, safe to commit (no real secrets)
- Production secrets live ONLY in Render dashboard and GitHub Secrets
- Token scan: `grep -rE 'password|secret|token|key' --include='*.ts' --include='*.tsx' --include='*.json' apps/ packages/`

---

## OPS-007: Daily Reset (GitHub Action)

### Scheduled Reset Workflow

```yaml
# .github/workflows/daily-reset.yml
name: Daily Database Reset

on:
  schedule:
    - cron: '0 4 * * *'  # 4am UTC daily
  workflow_dispatch:      # manual trigger

jobs:
  reset:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    environment: production
    steps:
      - uses: actions/checkout@v4
      
      - uses: pnpm/action-setup@v4
        with:
          version: 10
      
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: 'pnpm'
      
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      
      - name: Reset database
        run: pnpm --filter @briefline/api tsx prisma/reset.ts
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          DIRECT_URL: ${{ secrets.DIRECT_URL }}
      
      - name: Post-reset smoke test
        run: |
          curl -f https://briefline.onrender.com/api/v1/health || echo "Cold start in progress..."
          sleep 30
          curl -f https://briefline.onrender.com/api/v1/health
```

### Manual Dispatch Protection
- Only available from `main` branch
- Requires `production` environment approval

---

## OPS-008: Post-Deploy Smoke Tests

### Smoke Test Script

```bash
#!/bin/bash
# scripts/smoke-test.sh — post-deploy verification
# Usage: bash scripts/smoke-test.sh https://briefline.onrender.com

BASE=${1:-http://localhost:3000}
PASS=0
FAIL=0

check() {
  local desc="$1"
  local method="$2"
  local url="$3"
  local expected="$4"
  local data="${5:-}"
  
  local code
  if [ -z "$data" ]; then
    code=$(curl -s -o /dev/null -w "%{http_code}" -X "$method" "$BASE$url" --cookie-jar /tmp/cookies.txt --cookie /tmp/cookies.txt)
  else
    code=$(curl -s -o /dev/null -w "%{http_code}" -X "$method" "$BASE$url" -H "Content-Type: application/json" -d "$data" --cookie-jar /tmp/cookies.txt --cookie /tmp/cookies.txt)
  fi
  
  if [ "$code" = "$expected" ]; then
    echo "  ✅ $desc ($code)"
    PASS=$((PASS + 1))
  else
    echo "  ❌ $desc (expected $expected, got $code)"
    FAIL=$((FAIL + 1))
  fi
}

echo "🏥 Briefline Post-Deploy Smoke Test"
echo "   Base: $BASE"
echo ""

# 1. Health
check "Health endpoint" GET "/api/v1/health" 200

# 2. CSRF
check "CSRF token" GET "/api/v1/auth/csrf" 200

# 3. Login admin
check "Admin login" POST "/api/v1/auth/login" 201 '{"email":"admin@briefline.demo","password":"briefline-demo-2026"}'

# 4. Login member
check "Member login" POST "/api/v1/auth/login" 201 '{"email":"maria@briefline.demo","password":"briefline-demo-2026"}'

# 5. Dashboard (authenticated)
check "Dashboard KPIs" GET "/api/v1/dashboard/kpis" 200

# 6. Tasks board
check "Task board" GET "/api/v1/tasks/board" 200

# 7. Deep route (SPA)
check "SPA deep route" GET "/clients" 200

# 8. Forbidden mutation
check "Forbidden PATCH" PATCH "/api/v1/tasks/cccccccc-cccc-4000-8000-000000000201/status" 403 '{"status":"IN_PROGRESS","expectedVersion":1}'

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ $FAIL -eq 0 ] && echo "✅ All smoke tests passed" || echo "❌ Some tests failed"
exit $FAIL
```

---

## OPS-009: Cold-Start Experience

### Frontend Loading State
The app already shows loading states via React Query `isLoading` and `Skeleton` components.
- Initial load: spinner/skeleton while `/auth/me` resolves (AuthProvider)
- Data fetching: Skeleton components (Skeleton.tsx)
- Error boundary: ErrorState with retry button

### Cold Start Disclosure (README)
Add to README.md:
```markdown
## ⚠️ Free Tier Cold Starts

This demo runs on Render's free tier. After 15 minutes of inactivity, the server
spins down. The first request wakes it up, which takes **30-60 seconds**.

**If the page is blank**, wait 30 seconds and refresh. The API will respond once
the cold start completes. Subsequent requests are instant.
```

### Render Spin-Down Mitigation
- Health check every 14 minutes via UptimeRobot (free) or similar
- Daily reset at 4am UTC resets the database and wakes the service

---

## OPS-010: Runbook

### Deploy
```bash
# 1. Ensure all tests pass locally
pnpm typecheck && pnpm test && pnpm test:e2e

# 2. Commit and push
git add -A && git commit -m "release: v0.1.0" && git push origin main

# 3. Render auto-deploys from main
# Monitor: https://dashboard.render.com

# 4. Run smoke tests
bash scripts/smoke-test.sh https://briefline.onrender.com
```

### Rollback
```bash
# Render dashboard → Deploy → Manual Deploy → select previous commit
# Or via git:
git revert HEAD --no-edit && git push origin main
```

### Database Reset
```bash
# Option A: GitHub Actions (recommended)
gh workflow run daily-reset.yml

# Option B: Local
DATABASE_URL=postgresql://... pnpm --filter @briefline/api tsx prisma/reset.ts
```

### Secret Rotation
```bash
# Generate new secrets
openssl rand -hex 64  # JWT_SECRET
openssl rand -hex 64  # CSRF_SECRET
# Update in Render dashboard → Environment → Save → Deploy
```

### Quota / Suspension Response
If Render free hours are exhausted (750h/month):
1. Check usage: Render dashboard → Billing
2. Service auto-resumes next billing cycle (1st of month)
3. For immediate recovery: upgrade to Render Individual ($7/month)
4. If Neon compute exhausted: wait for auto-resume (~2 min after next request)

### Monitoring
- Render dashboard: logs, metrics, deploy history
- Neon dashboard: query stats, connections, storage
- GitHub Actions: daily reset status, CI pipeline
- No external monitoring (free tier constraint)

---

## Verification Checklist (PH-12 gates)

- [ ] OPS-001: Vite SPA served through Nest in production (ServeStaticModule)
- [ ] OPS-002: Render service configured with health check
- [ ] OPS-003: Neon database created, connection strings stored as secrets
- [ ] OPS-004: `prisma migrate deploy` runs before server start
- [ ] OPS-005: All secrets in Render + GitHub, none in repo
- [ ] OPS-006: HTTPS enforced, Secure cookies in prod, trust proxy set
- [ ] OPS-007: Daily reset workflow scheduled + manual dispatch
- [ ] OPS-008: Smoke test script runnable against deployed URL
- [ ] OPS-009: Cold start documented in README
- [ ] OPS-010: Runbook covers deploy, rollback, reset, rotate, quota
