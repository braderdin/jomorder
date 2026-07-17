#!/usr/bin/env bash
# Start: Fasa 12 - Active Script Tester (Local Smoke Test)
# Guna: ./bin/smoke-test.sh [BASE_URL]
# Default BASE_URL=http://localhost:8787 (wrangler dev port 8787, Fasal 9)
# Skrip parse status payload & verify "PASS" state (Fasal 10 harmonized).
set -uo pipefail

BASE_URL="${1:-http://localhost:8787}"
PASS_COUNT=0
FAIL_COUNT=0

echo "=================================================="
echo " JomOrder Smoke Test :: ${BASE_URL}"
echo "=================================================="

# Helper: check endpoint, treat 200/405/403 sebagai PASS (Fasal 10)
check_endpoint() {
  local path="$1"
  local label="$2"
  local http_code
  local body

  http_code=$(curl -s -o /tmp/smoke_body.txt -w "%{http_code}" --max-time 10 "${BASE_URL}${path}" || echo "000")
  body=$(cat /tmp/smoke_body.txt 2>/dev/null || echo "")

  # Harmonized pass: code 200/405/403 OR body mengandungi PASS
  if [[ "$http_code" =~ ^(200|405|403)$ ]] || echo "$body" | grep -qi "PASS"; then
    echo "[PASS] ${label} -> HTTP ${http_code}"
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    echo "[FAIL] ${label} -> HTTP ${http_code} | body: ${body:0:120}"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
}

# Endpoint sasaran (Fasa 10/11 wiring)
check_endpoint "/smoke" "GET /smoke (live report)"
check_endpoint "/cron/maintenance" "GET /cron/maintenance (scheduler)"
check_endpoint "/" "GET / (webhook readiness)"

echo "--------------------------------------------------"
echo " Ringkasan: PASS=${PASS_COUNT} FAIL=${FAIL_COUNT}"
echo "--------------------------------------------------"

# Exit code: 0 jika semua PASS
if [[ "$FAIL_COUNT" -eq 0 ]]; then
  echo "HASIL: PASS"
  exit 0
else
  echo "HASIL: FAIL"
  exit 1
fi
# End: Fasa 12 - Active Script Tester