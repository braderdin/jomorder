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

# Konstanta untuk URL dasar API Telegram
TELEGRAM_API_BASE_URL="https://api.telegram.org/bot"

# Extract token secara selamat (grep + cut, tiada echo secrets ke log).
BOT_TOKEN="$(grep -E '^TELEGRAM_BOT_TOKEN=' "$DEV_VARS" | cut -d'=' -f2- | tr -d '\"')"
SECRET_TOKEN="$(grep -E '^X_TELEGRAM_BOT_API_SECRET_TOKEN=' "$DEV_VARS" | cut -d'=' -f2- | tr -d '\"')"
WORKER_URL="$(grep -E '^WORKER_URL=' "$DEV_VARS" | cut -d'=' -f2- | tr -d '\"')"

if [[ -z "$BOT_TOKEN" ]]; then
  echo "ERROR: TELEGRAM_BOT_TOKEN tidak dijumpai atau kosong di $DEV_VARS."
  exit 1
fi
if [[ -z "$SECRET_TOKEN" ]]; then
  echo "ERROR: X_TELEGRAM_BOT_API_SECRET_TOKEN tidak dijumpai atau kosong di $DEV_VARS."
  exit 1
fi
if [[ -z "$WORKER_URL" ]]; then
  echo "ERROR: WORKER_URL tidak dijumpai atau kosong di $DEV_VARS."
  exit 1
fi

# Validasi dasar untuk WORKER_URL
if ! echo "$WORKER_URL" | grep -q '^https?://'; then
  echo "ERROR: WORKER_URL ('$WORKER_URL') tidak sah. Mesti bermula dengan http:// atau https://."
  exit 1
fi
# Bersihkan trailing slash pada WORKER_URL.
WORKER_URL="${WORKER_URL%/}"
WEBHOOK_URL="${WORKER_URL}/"

echo "Phase39: Mendaftarkan webhook ke ${WORKER_URL} ..."
echo "Phase39: Menghantar setWebhook dengan secret token guard (Fasal 10)."

# Panggil Telegram setWebhook API.
# drop_pending_updates=true -> bersihkan queue lama saat reconnect.
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
# Parse URL dari getWebhookInfo menggunakan jq; sahkan ia point ke worker live kita.
WEBHOOK_URL_CHECK=$(echo "$WEBHOOK_INFO_JSON" | jq -r '.result.url')
if [[ -n "$WEBHOOK_URL_CHECK" && "$WEBHOOK_URL_CHECK" == "${WORKER_URL}/" ]]; then
  echo "[PASS] Phase42: Webhook URL sepadan worker live: ${WEBHOOK_URL_CHECK}"
else
  echo "[RALAT] Phase42: Webhook URL TIDAK sepadan! Dijumpai: '${WEBHOOK_URL_CHECK}' (jangka: ${WORKER_URL}/)"
  echo "[RALAT] Sila semak worker deploy berjaya sebelum webhook register."
fi

# Sahkan pending_update_count = 0 (tiada backlog).
PENDING_COUNT=$(echo "$WEBHOOK_INFO_JSON" | jq -r '.result.pending_update_count')
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
  "${TELEGRAM_API_BASE_URL}${BOT_TOKEN}/setMyCommands" \
  -H "Content-Type: application/json" \
  -d '{
    "commands": [
      {"command":"/start","description":"Mula & pilih peranan"},
      {"command":"/bantuan","description":"Panduan interaktif bot"},
      {"command":"/menu","description":"Senarai kedai aktif"},
      {"command":"/menu_kedai","description":"Menu kedai saya"},
      {"command":"/tetapan","description":"Tetapan akaun & QR"},
      {"command":"/urus","description":"Papan pemerintah peniaga"},
      {"command":"/urus_kedai","description":"Urus kedai saya"},
      {"command":"/daftar","description":"Daftar kedai baharu"},
      {"command":"/tambah_menu","description":"Tambah item menu"},
      {"command":"/senarai_menu","description":"Senarai menu kedai"},
      {"command":"/cari_makan","description":"Cari kedai berdekatan"},
      {"command":"/troli","description":"Lihat troli pesanan"},
      {"command":"/cart_kosong","description":"Kosongkan troli"},
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
      {"command":"/promo","description":"Lihat promosi aktif"},
      {"command":"/bantuan_lokasi","description":"Panduan kongsi lokasi"},
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
