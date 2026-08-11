#!/bin/bash
# Post-deploy smoke test — PH-12 OPS-008
# Usage: bash scripts/smoke-test.sh [BASE_URL]
# Default: http://localhost:3000 (local); pass https://briefline.onrender.com for prod

set -euo pipefail

BASE=${1:-http://localhost:3000}
PASS=0
FAIL=0
COOKIES=$(mktemp -t briefline-smoke-cookies.XXXXXX)
trap 'rm -f "$COOKIES"' EXIT

check() {
  local desc="$1"
  local method="$2"
  local url="$3"
  local expected="$4"
  local data="${5:-}"
  local csrf="${6:-}"

  local headers=(-H "Accept: application/json")
  if [ -n "$data" ]; then
    headers+=(-H "Content-Type: application/json")
  fi
  if [ -n "$csrf" ]; then
    headers+=(-H "X-CSRF-Token: $csrf")
  fi

  local code
  if [ -n "$data" ]; then
    code=$(curl -s -o /dev/null -w "%{http_code}" -X "$method" "$BASE$url" \
      "${headers[@]}" -d "$data" \
      --cookie-jar "$COOKIES" --cookie "$COOKIES" 2>/dev/null || echo "000")
  else
    code=$(curl -s -o /dev/null -w "%{http_code}" -X "$method" "$BASE$url" \
      "${headers[@]}" \
      --cookie-jar "$COOKIES" --cookie "$COOKIES" 2>/dev/null || echo "000")
  fi

  if [ "$code" = "$expected" ]; then
    echo "  ✅ $desc ($code)"
    PASS=$((PASS + 1))
    return 0
  else
    echo "  ❌ $desc (expected $expected, got $code)"
    FAIL=$((FAIL + 1))
    return 1
  fi
}

echo "🏥 Briefline Post-Deploy Smoke Test"
echo "   Base: $BASE"
echo "   $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
echo ""

# ── Public endpoints ──────────────────────────────────────────────

echo "── Public ──"
check "Health endpoint"              GET  "/api/v1/health"         200
CSRF=$(curl -s "$BASE/api/v1/auth/csrf" -H "Accept: application/json" --cookie-jar "$COOKIES" --cookie "$COOKIES" | grep -o '"csrfToken":"[^"]*"' | cut -d'"' -f4 || echo "")
if [ -n "$CSRF" ]; then
  echo "  ✅ CSRF token obtained"
  PASS=$((PASS + 1))
else
  echo "  ❌ CSRF token missing"
  FAIL=$((FAIL + 1))
fi
check "Invalid login (wrong password)" POST "/api/v1/auth/login"  401 '{"email":"admin@briefline.demo","password":"wrong"}'

# ── Admin journey ─────────────────────────────────────────────────

echo "── Admin ──"
check "Admin login"                  POST "/api/v1/auth/login"    201 '{"email":"admin@briefline.demo","password":"briefline-demo-2026"}' "$CSRF"
check "Dashboard KPIs"               GET  "/api/v1/dashboard/kpis" 200
check "My Tasks"                     GET  "/api/v1/dashboard/my-tasks" 200
check "Recent Activity"              GET  "/api/v1/dashboard/recent-activity" 200
check "Task board"                   GET  "/api/v1/tasks/board"    200
check "Clients list"                 GET  "/api/v1/clients"        200
check "Users list (admin only)"      GET  "/api/v1/users"          200

# ── Member login ──────────────────────────────────────────────────

echo "── Member ──"
check "Member login"                 POST "/api/v1/auth/login"    201 '{"email":"maria@briefline.demo","password":"briefline-demo-2026"}'
check "Member dashboard"             GET  "/api/v1/dashboard/kpis" 200
check "Member forbidden (users)"     GET  "/api/v1/users"          403
check "Forbidden PATCH foreign task" PATCH "/api/v1/tasks/cccccccc-cccc-4000-8000-000000000201/status" 403 '{"status":"IN_PROGRESS","expectedVersion":1}' "$CSRF"

# ── SPA deep routes ────────────────────────────────────────────────

echo "── SPA deep routes ──"
check "SPA /login"                   GET  "/login"                 200 "" "" "" # No API prefix
check "SPA /dashboard"               GET  "/dashboard"             200 "" "" ""
check "SPA /clients"                 GET  "/clients"               200 "" "" ""

# ── Summary ───────────────────────────────────────────────────────

echo ""
echo "Results: $PASS passed, $FAIL failed"
if [ $FAIL -eq 0 ]; then
  echo "✅ All smoke tests passed"
else
  echo "❌ Some tests failed"
fi
exit $FAIL
