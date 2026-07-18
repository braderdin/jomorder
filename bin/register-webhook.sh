#!/usr/bin/env bash
# Start: Phase 38 - Forced Telegram Webhook Registration (bin/register-webhook.sh)
# Fasal 10 (Webhook Guard) + Fasal 11 (read-only .dev.vars parse).
# Paksa setWebhook ke endpoint worker dengan secret token selamat.
# Tiada penulisan ke .dev.vars (read-only compliance).

set -u

# Muatkan pembolehubah dari .dev.vars (parse selamat, tiada export rahsia longgar).
DEVS="$(dirname "$0")/../.dev.vars"
if [ ! -f "$DEVS" ]; then
  echo "ERROR: .dev.vars tidak dijumpai di $DEVS" >&2
  exit 1
fi

TELEGRAM_BOT_TOKEN="$(grep -E '^TELEGRAM_BOT_TOKEN=' "$DEVS" | head -n1 | cut -d'=' -f2- | tr -d '"')"
SECRET_TOKEN="$(grep -E '^X_TELEGRAM_BOT_API_SECRET_TOKEN=' "$DEVS" | head -n1 | cut -d'=' -f2- | tr -d '"')"
WORKER_URL="$(grep -E '^WORKER_URL=' "$DEVS" | head -n1 | cut -d'=' -f2- | tr -d '"')"

if [ -z "$TELEGRAM_BOT_TOKEN" ] || [ -z "$WORKER_URL" ]; then
  echo "ERROR: TELEGRAM_BOT_TOKEN atau WORKER_URL tiada dalam .dev.vars" >&2
  exit 1
fi

# Pastikan URL berakhir dengan '/'
case "$WORKER_URL" in
  */) WEBHOOK_URL="$WORKER_URL" ;;
  *)  WEBHOOK_URL="$WORKER_URL/" ;;
esac

echo ">> Mendaftarkan webhook ke: $WEBHOOK_URL"

# Panggil Telegram setWebhook (secret_token dihantar untuk Fasal 10 guard).
RESP="$(curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -F "url=${WEBHOOK_URL}" \
  -F "secret_token=${SECRET_TOKEN}" \
  -F "max_connections=40" \
  -F "drop_pending_updates=true")"

echo ">> Telegram response: $RESP"

# Sahkan keputusan.
if echo "$RESP" | grep -q '"ok":true'; then
  echo "OK: Webhook berjaya didaftarkan."
  exit 0
else
  echo "FAIL: Webhook gagal didaftarkan." >&2
  exit 1
fi
# End: Phase 38 - Forced Telegram Webhook Registration