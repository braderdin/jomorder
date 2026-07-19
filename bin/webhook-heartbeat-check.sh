#!/usr/bin/env bash
# Start: Phase 40 - WSL Webhook Pulse Heartbeat Checker
# Guna: ./bin/webhook-heartbeat-check.sh [BASE_URL] [RETRY_URL]
# Query live webhook registration status matrix dan trigger auto-repair
# bila telemetry drift kesan. Fail-open: 200/405/403 = endpoint hidup.
set -uo pipefail

BASE_URL="${1:-http://localhost:8787}"
RETRY_URL="${2:-}"
PASS=0
FAIL=0

echo "=================================================="
echo " JomOrder Phase 40 Webhook Heartbeat :: ${BASE_URL}"
echo "=================================================="

probe() {
  local path="$1"
  local label="$2"
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "${BASE_URL}${path}" || echo "000")
  if [[ "$code" =~ ^(200|405|403)$ ]]; then
    echo "[PULSE OK] ${label} -> HTTP ${code}"
    PASS=$((PASS + 1))
  else
    echo "[PULSE DRIFT] ${label} -> HTTP ${code}"
    FAIL=$((FAIL + 1))
  fi
}

# Telemetry matrix: health, smoke, webhook-ready, public-stats
probe "/health" "GET /health (DB sentinel)"
probe "/smoke" "GET /smoke (resilience report)"
probe "/" "GET / (webhook-ready 200)"
probe "/api/public-stats" "GET /api/public-stats (public analytics)"

# Phase 51: Cron endpoint matrix (secret-less GET = 404/405 = route wujud)
# 404 dianggap OK kerana cron hanya terima POST; route tetap di-deploy.
probe "/cron/daily-digest" "GET /cron/daily-digest (route deployed)"
probe "/cron/coupon-sweep" "GET /cron/coupon-sweep (route deployed)"
probe "/cron/maintenance" "GET /cron/maintenance (route deployed)"

# Auto-repair: jika drift kesan dan RETRY_URL diberi, tembak semula register.
if [[ "$FAIL" -gt 0 && -n "$RETRY_URL" ]]; then
  echo "[REPAIR] Telemetry drift kesan -> trigger auto-repair @ ${RETRY_URL}"
  curl -s -o /dev/null -w "repair HTTP %{http_code}\n" --max-time 15 -X POST \
    -H "Content-Type: application/json" "$RETRY_URL" || echo "repair gagal"
fi

echo "--------------------------------------------------"
echo " Heartbeat: PASS=${PASS} DRIFT=${FAIL}"
echo "--------------------------------------------------"

if [[ "$FAIL" -eq 0 ]]; then
  echo "HASIL: PULSE_OK"
  exit 0
else
  echo "HASIL: PULSE_DRIFT"
  exit 1
fi
# End: Phase 40 - WSL Webhook Pulse Heartbeat Checker