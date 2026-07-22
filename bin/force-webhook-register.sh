#!/usr/bin/env bash
# Start: Phase 39 - Force Webhook Register (Fasal 10 + Fasal 11)
# Skrip automasi untuk mencetuskan secara paksa endpoint setWebhook Telegram.
# Baca konfigurasi dari .dev.vars (READ-ONLY) - tidak mengubah fail rahsia.
# Usage: bash bin/force-webhook-register.sh
set -euo pipefail

DEV_VARS=".dev.vars"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
if [[ ! -f "$DEV_VARS" ]]; then
  echo "ERROR: $DEV_VARS tidak dijumpai. Pastikan berada di root projek."
  exit 1
fi

# Konstanta untuk URL dasar API Telegram
TELEGRAM_API_BASE_URL="https://api.telegram.org/bot"

# Extract token secara selamat (grep + cut, tiada echo secrets ke log).
BOT_TOKEN="$(grep -E '^TELEGRAM_BOT_TOKEN=' "$DEV_VARS" | cut -d'=' -f2- | tr -d '\"')"
SECRET_TOKEN="$(grep -E '^X_TELEGRAM_BOT_API_SECRET_TOKEN=' "$DEV_VARS" | cut -d'=' -f2- | tr -d '\"')"
WORKER_URL="$(grep -E '^WORKER_URL=' "$DEV_VARS" | cut -d'=' -f2- | tr -d '\"')"

if [[ -z "$BOT_TOKEN" ]]; then
  echo "ERROR: TELEGRAM_BOT_TOKEN tidak ditemui atau kosong di $DEV_VARS."
  exit 1
fi
if [[ -z "$SECRET_TOKEN" ]]; then
  echo "ERROR: X_TELEGRAM_BOT_API_SECRET_TOKEN tidak ditemui atau kosong di $DEV_VARS."
  exit 1
fi
if [[ -z "$WORKER_URL" ]]; then
  echo "ERROR: WORKER_URL tidak ditemui atau kosong di $DEV_VARS."
  exit 1
fi

# Bersihkan trailing slash pada WORKER_URL.
WORKER_URL="${WORKER_URL%/}"
WEBHOOK_URL="${WORKER_URL}/"

echo "Phase39: Mendaftarkan webhook ke ${WORKER_URL} ..."
echo "Phase39: Menghantar setWebhook dengan secret token guard (Fasal 10)."

# Panggil Telegram setWebhook API.
# drop_pending_updates=true -> membersihkan barisan lama semasa penyambungan semula.
RESPONSE="$(curl -s -X POST \
  "${TELEGRAM_API_BASE_URL}${BOT_TOKEN}/setWebhook" \
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
echo "Phase39: Mengesahkan getWebhookInfo..."
WEBHOOK_INFO_JSON=$(curl -s -X POST "${TELEGRAM_API_BASE_URL}${BOT_TOKEN}/getWebhookInfo")
echo "$WEBHOOK_INFO_JSON"
echo "" # Tambahkan baris kosong untuk keterbacaan

# Start: Phase 42 - Webhook Live Verification (post-deploy)
# Parse URL dari getWebhookInfo menggunakan jq; sahkan ia menunjuk ke worker langsung kita.
WEBHOOK_URL_CHECK=$(echo "$WEBHOOK_INFO_JSON" | jq -r '.result.url')
if [[ -n "$WEBHOOK_URL_CHECK" && "$WEBHOOK_URL_CHECK" == "${WORKER_URL}/" ]]; then
  echo "[PASS] Phase42: URL Webhook sepadan dengan worker langsung: ${WEBHOOK_URL_CHECK}"
else
  echo "[RALAT] Phase42: URL Webhook TIDAK sepadan! Ditemui: '${WEBHOOK_URL_CHECK}' (dijangka: ${WORKER_URL}/)"
  echo "[RALAT] Sila semak worker berjaya di-deploy sebelum pendaftaran webhook."
fi

# Sahkan pending_update_count = 0 (tiada backlog).
PENDING_COUNT=$(echo "$WEBHOOK_INFO_JSON" | jq -r '.result.pending_update_count')
if [[ "$PENDING_COUNT" == "0" ]]; then
  echo "[PASS] Phase42: pending_update_count=0 (tiada tunggakan)."
else
  echo "[AMARAN] Phase42: pending_update_count=${PENDING_COUNT} (mungkin ada tunggakan)."
fi
# End: Phase 42 - Webhook Live Verification

echo "Phase39: Pendaftaran webhook selesai."

# Start: Phase 70 - Dynamic setMyCommands from bot_commands.json (SSOT)
# Baca perintah dari fail JSON tunggal untuk elak duplikasi di kod/shell
CMDS_JSON_PATH="${PROJECT_ROOT}/src/bot_commands.json"
if [[ -f "${CMDS_JSON_PATH}" ]]; then
  echo "Phase70: Syncing commands from ${CMDS_JSON_PATH}..."
  SET_CMD_RESP="$(curl -s -X POST \
    "${TELEGRAM_API_BASE_URL}${BOT_TOKEN}/setMyCommands" \
    -H "Content-Type: application/json" \
    -d "{\"commands\": $(cat "${CMDS_JSON_PATH}")}")"
  echo "Phase70: setMyCommands response: ${SET_CMD_RESP}"
else
  echo "[WARNING] bot_commands.json not found, skipping command sync"
fi
# End: Phase 70 - Dynamic setMyCommands from bot_commands.json

# Start: Phase 46 - Dead Callback Repair Verification Note
# Semua 22 perintah natif di atas TELAH diikat kepada router callback yang aktif.
# Phase 46 membaiki 3 callback mati: merchant_menu -> /senarai_menu,
# merchant_analytics -> /laporan_jualan, status_refresh -> /status.
# Selepas deploy, jalankan: bash bin/smoke-test.sh <WORKER_URL> dan sahkan
# PH46:CB:merchant_menu / merchant_analytics / status_refresh = [PASS].
# End: Phase 46 - Dead Callback Repair Verification Note

# Start: Phase 51 - Cron Route Deployment Note
# Selepas deploy, pastikan 3 cron route hidup dengan trigger test:
#   curl -X POST -H "X-Telegram-Bot-Api-Secret-Token: $SECRET_TOKEN" ${WORKER_URL}/cron/daily-digest
#   curl -X POST -H "X-Telegram-Bot-Api-Secret-Token: $SECRET_TOKEN" ${WORKER_URL}/cron/coupon-sweep
#   curl -X POST -H "X-Telegram-Bot-Api-Secret-Token: $SECRET_TOKEN" ${WORKER_URL}/cron/maintenance
# Jika mengembalikan 200 JSON {status:OK} = cron berfungsi. Jika 403 = secret tidak sah.
# End: Phase 51 - Cron Route Deployment Note

# End: Phase 39 - Force Webhook Register
