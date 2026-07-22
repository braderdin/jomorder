#!/usr/bin/env bash
# Start: Phase 42 - Automated Worker Deployment & 4-Secret Provisioning
# Fasal 10 (Secrets Autonomy): Auto-provision KEEMPAT-EMPAT secret dari .dev.vars
# (READ-ONLY parse) sebelum 'wrangler deploy'.
# Fasal 11 (IPv4 Mandate): Tiada DDL di sini; hanya provisioning secret + deploy.
# Fasal 15 (Anti-Secret Leak): Tiada kunci rahsia ditulis ke wrangler.toml.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DEV_VARS="${PROJECT_ROOT}/.dev.vars"

echo "=================================================="
echo " JomOrder Phase 42 :: Worker Deploy & Secret Provision"
echo "=================================================="

# Baca .dev.vars secara READ-ONLY (Fasal 11 strict read-only mandate).
if [[ ! -f "${DEV_VARS}" ]]; then
  echo "[RALAT] .dev.vars tidak dijumpai di ${DEV_VARS}"
  exit 1
fi

# Extract function: ambil nilai variable dari .dev.vars tanpa ubah fail sumber.
extract_var() {
  local key="$1"
  grep -E "^${key}=" "${DEV_VARS}" | head -n1 | cut -d'=' -f2- | sed -E 's/^"//; s/"$//'
}

# Start: Phase 42 - 4-Secret Provisioning Matrix
# Senarai secret WAJIB (rahsia, tidak di-commit ke git).
SECRETS=(
  "TELEGRAM_BOT_TOKEN"
  "X_TELEGRAM_BOT_API_SECRET_TOKEN"
  "SUPABASE_SERVICE_ROLE_KEY"
  "UPSTASH_REDIS_REST_TOKEN"
)

echo "[INFO] Memulakan provisioning ${#SECRETS[@]} secret ke Cloudflare..."

for SECRET_NAME in "${SECRETS[@]}"; do
  SECRET_VALUE="$(extract_var "${SECRET_NAME}")"
  if [[ -z "${SECRET_VALUE}" ]]; then
    echo "[RALAT] ${SECRET_NAME} tidak dijumpai dalam .dev.vars"
    exit 1
  fi
  echo "[INFO] Provisioning secret: ${SECRET_NAME}..."
  # Pipe nilai ke stdin wrangler (tiada echo token ke log awam - Fasal 15).
  printf '%s' "${SECRET_VALUE}" | npx wrangler secret put "${SECRET_NAME}"
  PUT_STATUS=$?
  if [[ ${PUT_STATUS} -ne 0 ]]; then
    echo "[RALAT] Provisioning ${SECRET_NAME} gagal (kod ${PUT_STATUS})"
    exit ${PUT_STATUS}
  fi
  echo "[PASS] Secret ${SECRET_NAME} berjaya di-provision."
done
# End: Phase 42 - 4-Secret Provisioning Matrix

# Start: Phase 60 - Apply latest migration before deploy (DDL 025 founder shop)
if [[ -f "${PROJECT_ROOT}/src/db/migrations/025_founder_demo_shop.sql" ]]; then
  echo "[INFO] Phase60: Apply migration 025 (founder demo shop)..."
  bash "${PROJECT_ROOT}/bin/db-query.sh" < "${PROJECT_ROOT}/src/db/migrations/025_founder_demo_shop.sql" || echo "[WARN] 025 apply gagal (mungkin sudah wujud - idempoten)"
fi
# End: Phase 60 - Apply latest migration before deploy

# Deploy worker ke Cloudflare.
# Fasal 11 (Wrangler Deployment Mandate): map CLOUDFLARE_DEPLOY_TOKEN -> CLOUDFLARE_API_TOKEN.
# Fallback: jika CLOUDFLARE_DEPLOY_TOKEN (cfut_...) tiada permission, guna
# CLOUDFLARE_API_TOKEN (cfat_...) dari .dev.vars line 55 sebagai primary deploy token.
DEPLOY_TOKEN="$(extract_var 'CLOUDFLARE_DEPLOY_TOKEN')"
if [[ -z "${DEPLOY_TOKEN}" ]]; then
  DEPLOY_TOKEN="$(extract_var 'CLOUDFLARE_API_TOKEN')"
fi
echo "[INFO] Menjalankan wrangler deploy (token: ${DEPLOY_TOKEN:0:8}...)"
CLOUDFLARE_API_TOKEN="${DEPLOY_TOKEN}" npx wrangler deploy
DEPLOY_STATUS=$?

if [[ ${DEPLOY_STATUS} -eq 0 ]]; then
  echo "HASIL: DEPLOY_PASS"
else
  echo "HASIL: DEPLOY_FAIL (kod ${DEPLOY_STATUS})"
fi

# Start: Phase 70 - Dynamic setMyCommands from bot_commands.json (SSOT)
# Baca perintah dari fail JSON tunggal untuk elak duplikasi
if [[ ${DEPLOY_STATUS} -eq 0 ]]; then
  BOT_TOKEN="$(extract_var 'TELEGRAM_BOT_TOKEN')"
  if [[ -n "${BOT_TOKEN}" ]]; then
    echo "[INFO] Phase70: Syncing commands from ${PROJECT_ROOT}/src/bot_commands.json..."
    curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/setMyCommands" \
      -H "Content-Type: application/json" \
      -d "{\"commands\": $(cat "${PROJECT_ROOT}/src/bot_commands.json")}"
    echo ""
    echo "[PASS] Phase70: setMyCommands synced from SSOT."
  fi
fi
# End: Phase 70 - Dynamic setMyCommands from bot_commands.json

exit ${DEPLOY_STATUS}
# End: Phase 42 - Automated Worker Deployment & 4-Secret Provisioning
