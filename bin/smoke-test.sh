#!/usr/bin/env bash
# Start: Phase 36 LOOP 1 - Deployment Smoke Test (Active Endpoint Verifier)
# Guna: ./bin/smoke-test.sh [BASE_URL]
# Default BASE_URL=http://localhost:8787 (wrangler dev port 8787)
# Verify GET /health, /smoke, /api/public-stats HTTP status codes.
# Fasal 10: HTTP 405/403 pada GET smoke ping dianggap PASS (active endpoint), bukan crash.
set -uo pipefail

BASE_URL="${1:-http://localhost:8787}"
PASS_COUNT=0
FAIL_COUNT=0

echo "=================================================="
echo " JomOrder Phase 36 Smoke Test :: ${BASE_URL}"
echo "=================================================="

# Helper: check HTTP status, treat 200/405/403 sebagai PASS (Fasal 10 harmonized)
check_status() {
  local path="$1"
  local label="$2"
  local http_code

  http_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "${BASE_URL}${path}" || echo "000")

  # 200 = OK, 405 = Method Not Allowed (active endpoint), 403 = Forbidden (active guard)
  if [[ "$http_code" =~ ^(200|405|403)$ ]]; then
    echo "[PASS] ${label} -> HTTP ${http_code}"
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    echo "[FAIL] ${label} -> HTTP ${http_code}"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
}

# Phase 36 target endpoints
check_status "/health" "GET /health (DB sentinel heartbeat)"
check_status "/smoke" "GET /smoke (live smoke report)"
check_status "/api/public-stats" "GET /api/public-stats (public analytics)"

echo "--------------------------------------------------"
echo " Ringkasan: PASS=${PASS_COUNT} FAIL=${FAIL_COUNT}"
echo "--------------------------------------------------"

# Exit 0 jika tiada kegagalan sebenar (real failure)
if [[ "$FAIL_COUNT" -eq 0 ]]; then
  echo "HASIL: PASS"
  exit 0
else
  echo "HASIL: FAIL"
  exit 1
fi
# End: Phase 36 LOOP 1 - Deployment Smoke Test
