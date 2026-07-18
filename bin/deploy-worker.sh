#!/usr/bin/env bash
# Start: Phase 35 - Automated Worker Deployment & Secrets Provisioning
# Fasal 10 (Secrets Autonomy): Auto-provision X_TELEGRAM_BOT_API_SECRET_TOKEN
# dari .dev.vars (READ-ONLY parse) sebelum 'wrangler deploy'.
# Fasal 11 (IPv4 Mandate): Tiada DDL di sini; hanya provisioning secret + deploy.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DEV_VARS="${PROJECT_ROOT}/.dev.vars"

echo "=================================================="
echo " JomOrder Phase 35 :: Worker Deploy & Secret Provision"
echo "=================================================="

# Baca .dev.vars secara READ-ONLY (Fasal 11 strict read-only mandate).
# Extract nilai X_TELEGRAM_BOT_API_SECRET_TOKEN tanpa ubah fail sumber.
if [[ ! -f "${DEV_VARS}" ]]; then
  echo "[RALAT] .dev.vars tidak dijumpai di ${DEV_VARS}"
  exit 1
fi

SECRET_TOKEN="$(grep -E '^X_TELEGRAM_BOT_API_SECRET_TOKEN=' "${DEV_VARS}" | head -n1 | cut -d'=' -f2- | sed -E 's/^"//; s/"$//')"

if [[ -z "${SECRET_TOKEN}" ]]; then
  echo "[RALAT] X_TELEGRAM_BOT_API_SECRET_TOKEN tidak dijumpai dalam .dev.vars"
  exit 1
fi

echo "[INFO] Memulakan provisioning secret X_TELEGRAM_BOT_API_SECRET_TOKEN..."

# Fasal 10:MUST execute wrangler secret put untuk provision token bersih ke Cloudflare.
# Pipe nilai ke stdin wrangler (tiada echo token ke log awam).
printf '%s' "${SECRET_TOKEN}" | npx wrangler secret put X_TELEGRAM_BOT_API_SECRET_TOKEN
PUT_STATUS=$?

if [[ ${PUT_STATUS} -ne 0 ]]; then
  echo "[RALAT] Provisioning secret gagal (kod ${PUT_STATUS})"
  exit ${PUT_STATUS}
fi

echo "[PASS] Secret X_TELEGRAM_BOT_API_SECRET_TOKEN berjaya di-provision."

# Deploy worker ke Cloudflare (Fasal 9 port 8787 dev; produksi guna deploy).
echo "[INFO] Menjalankan wrangler deploy..."
npx wrangler deploy
DEPLOY_STATUS=$?

if [[ ${DEPLOY_STATUS} -eq 0 ]]; then
  echo "HASIL: DEPLOY_PASS"
else
  echo "HASIL: DEPLOY_FAIL (kod ${DEPLOY_STATUS})"
fi

exit ${DEPLOY_STATUS}
# End: Phase 35 - Automated Worker Deployment & Secrets Provisioning