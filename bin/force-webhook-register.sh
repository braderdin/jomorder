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

# Start: Phase 44 - Re-Sync 22 Native Commands (termasuk /status)
echo "Phase44: Menyeleraskan 22 command natif (setMyCommands) ..."
SET_CMD_RESP="$(curl -s -X POST \
  "https://api.telegram.org/bot${BOT_TOKEN}/setMyCommands" \
  -H "Content-Type: application/json" \
  -d '{
    "commands": [
      {"command":"/start","description":"Mula & pilih peranan"},
      {"command":"/bantuan","description":"Panduan interaktif bot"},
      {"command":"/menu","description":"Senarai kedai aktif"},
      {"command":"/urus","description":"Papan pemerintah peniaga"},
      {"command":"/urus_kedai","description":"Urus kedai saya"},
      {"command":"/daftar","description":"Daftar kedai baharu"},
      {"command":"/tambah_menu","description":"Tambah item menu"},
      {"command":"/senarai_menu","description":"Senarai menu kedai"},
      {"command":"/cari_makan","description":"Cari kedai berdekatan"},
      {"command":"/troli","description":"Lihat troli pesanan"},
      {"command":"/pesanan_saya","description":"Senarai pesanan aktif"},
      {"command":"/senarai_pesanan","description":"Senarai pesanan saya"},
      {"command":"/cipta_kupon","description":"Cipta kupon diskaun"},
      {"command":"/senarai_kupon","description":"Senarai kupon aktif"},
      {"command":"/padam_kupon","description":"Padam kupon diskaun"},
      {"command":"/invois","description":"Jana invois digital"},
      {"command":"/laporan_jualan","description":"Laporan jualan kedai"},
      {"command":"/set_lokasi","description":"Tetapkan koordinat kedai"},
      {"command":"/sejarah_pesanan","description":"Sejarah pesanan saya"},
      {"command":"/batalkan_pesanan","description":"Batal pesanan tertunda"},
      {"command":"/profil","description":"Profil & langganan saya"},
      {"command":"/naiktaraf","description":"Naik taraf pelan premium"},
      {"command":"/zon_operasi","description":"Zon operasi perkhidmatan"},
      {"command":"/admin_stats","description":"Statistik pentadbir"},
      {"command":"/senarai_pendaftaran","description":"Senarai peniaga berdaftar"},
      {"command":"/pengumuman","description":"Pengumuman pentadbir"},
      {"command":"/status","description":"Semak status bot & akaun"}
    ]
  }')"
echo "Phase44: setMyCommands response: ${SET_CMD_RESP}"
# End: Phase 44 - Re-Sync 22 Native Commands

# Start: Phase 46 - Dead Callback Repair Verification Note
# Semua 22 command natif di atas TELAH diikat ke router callback yang hidup.
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
# Jika return 200 JSON {status:OK} = cron wired. Jika 403 = secret salah.
# End: Phase 51 - Cron Route Deployment Note

# End: Phase 39 - Force Webhook Register
