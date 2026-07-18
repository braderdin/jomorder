#!/usr/bin/env bash
# Start: Phase 39 - Force Webhook Register (Fasal 10 + Fasal 11)
# Skrip automasi untuk force-trigger Telegram setWebhook endpoint.
# Baca konfigurasi dari .dev.vars (READ-ONLY) - tidak ubah fail rahsia.
# Usage: bash bin/force-webhook-register.sh
set -euo pipefail

DEV_VARS=".dev.vars"
if [[ ! -f "$DEV_VARS" ]]; then
  echo "ERROR: $DEV_VARS tidak dijumpai. Pastikan berada di root projek."
  exit 1
fi

# Extract token secara selamat (grep + cut, tiada echo secrets ke log).
BOT_TOKEN="$(grep -E '^TELEGRAM_BOT_TOKEN=' "$DEV_VARS" | cut -d'=' -f2- | tr -d '\"')"
SECRET_TOKEN="$(grep -E '^X_TELEGRAM_BOT_API_SECRET_TOKEN=' "$DEV_VARS" | cut -d'=' -f2- | tr -d '\"')"
WORKER_URL="$(grep -E '^WORKER_URL=' "$DEV_VARS" | cut -d'=' -f2- | tr -d '\"')"

if [[ -z "$BOT_TOKEN" || -z "$SECRET_TOKEN" || -z "$WORKER_URL" ]]; then
  echo "ERROR: Gagal extract TELEGRAM_BOT_TOKEN / X_TELEGRAM_BOT_API_SECRET_TOKEN / WORKER_URL dari .dev.vars"
  exit 1
fi

# Bersihkan trailing slash pada WORKER_URL.
WORKER_URL="${WORKER_URL%/}"
WEBHOOK_URL="${WORKER_URL}/"

echo "Phase39: Mendaftarkan webhook ke ${WORKER_URL} ..."
echo "Phase39: Menghantar setWebhook dengan secret token guard (Fasal 10)."

# Panggil Telegram setWebhook API.
# drop_pending_updates=true -> bersihkan queue lama semasa reconnect.
RESPONSE="$(curl -s -X POST \
  "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d "{
    \"url\": \"${WEBHOOK_URL}\",
    \"secret_token\": \"${SECRET_TOKEN}\",
    \"max_connections\": 40,
    \"drop_pending_updates\": true
  }")"

echo "Phase39: Telegram setWebhook response:"
echo "$RESPONSE"

# Sahkan status webhook.
echo "Phase39: Mengesahkan getWebhookInfo ..."
WEBHOOK_INFO=$(curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo")
echo "$WEBHOOK_INFO"
echo ""

# Start: Phase 42 - Webhook Live Verification (post-deploy)
# Parse URL dari getWebhookInfo; sahkan ia point ke worker live kita.
WEBHOOK_URL_CHECK=$(echo "$WEBHOOK_INFO" | grep -o '"url":"[^"]*"' | head -n1 | sed 's/"url":"//; s/"$//')
if [[ -n "$WEBHOOK_URL_CHECK" && "$WEBHOOK_URL_CHECK" == "${WORKER_URL}/" ]]; then
  echo "[PASS] Phase42: Webhook URL sepadan worker live: ${WEBHOOK_URL_CHECK}"
else
  echo "[RALAT] Phase42: Webhook URL TIDAK sepadan! Dijumpai: '${WEBHOOK_URL_CHECK}' (jangka: ${WORKER_URL}/)"
  echo "[RALAT] Sila semak worker deploy berjaya sebelum webhook register."
fi

# Sahkan pending_update_count = 0 (tiada backlog).
PENDING_COUNT=$(echo "$WEBHOOK_INFO" | grep -o '"pending_update_count":[0-9]*' | head -n1 | grep -o '[0-9]*')
if [[ "$PENDING_COUNT" == "0" ]]; then
  echo "[PASS] Phase42: pending_update_count=0 (tiada backlog)."
else
  echo "[AMARAN] Phase42: pending_update_count=${PENDING_COUNT} (mungkin ada backlog)."
fi
# End: Phase 42 - Webhook Live Verification

echo "Phase39: Webhook register selesai."
# End: Phase 39 - Force Webhook Register
