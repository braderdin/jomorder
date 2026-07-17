#!/usr/bin/env bash
# Start: Phase 26 - Environment Drift Guard Utility (Fasal 11)
# Idempoten: parse kunci dalam .env.local, sahkan kewujudan deklaratif
# dalam .env.example, auto-append rujukan dummy jika hilang.
# READ-ONLY ke .env.local (Fasal 11 Strict Secret File Read-Only Mandate).
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_LOCAL="${ROOT_DIR}/.env.local"
ENV_EXAMPLE="${ROOT_DIR}/.env.example"

if [[ ! -f "$ENV_LOCAL" ]]; then
  echo "[DRIFT] .env.local tiada. Skip."
  exit 0
fi

if [[ ! -f "$ENV_EXAMPLE" ]]; then
  echo "[DRIFT] .env.example tiada. Skip."
  exit 0
fi

APPENDED=0

# Parse setiap baris kunci dalam .env.local (abaikan comment/kosong).
while IFS= read -r line; do
  # Buang leading whitespace
  stripped="$(echo "$line" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
  [[ -z "$stripped" || "$stripped" == \#* ]] && continue

  # Ambil nama kunci sebelum '=' (tangani K=V dan K="V").
  key="$(echo "$stripped" | cut -d= -f1 | sed -e 's/[[:space:]]*$//')"
  [[ -z "$key" ]] && continue

  # Semak jika kunci wujud dalam .env.example (sebagai KEY= atau # KEY=).
  if ! grep -qE "^[[:space:]]*#?[[:space:]]*${key}=" "$ENV_EXAMPLE"; then
    # Append rujukan dummy selamat (tiada rahsia sebenar ditulis).
    echo "${key}=\"__DRIFT_PLACEHOLDER_PLEASE_SET__\"" >> "$ENV_EXAMPLE"
    echo "[DRIFT] Tambah kunci hilang ke .env.example: ${key}"
    APPENDED=$((APPENDED + 1))
  fi
done < "$ENV_LOCAL"

if [[ "$APPENDED" -eq 0 ]]; then
  echo "[DRIFT] PASS: tiada drift kunci dikesan."
else
  echo "[DRIFT] SIAP: ${APPENDED} kunci diselaraskan."
fi

# Start: Phase 27 - Vercel Config ID Drift Guard
# Sahkan Vercel ID konfigurasi (VERCEL_PROJECT_ID, VERCEL_ORG_ID) wujud
# dan konsisten case-nya dalam .env.example untuk elak mixed-case typographical drift.
VERCEL_IDS=("VERCEL_PROJECT_ID" "VERCEL_ORG_ID")
for vid in "${VERCEL_IDS[@]}"; do
  if ! grep -qE "^[[:space:]]*#?[[:space:]]*${vid}=" "$ENV_EXAMPLE"; then
    echo "${vid}=\"__SET_VERCEL_${vid}_HERE__\"" >> "$ENV_EXAMPLE"
    echo "[DRIFT] Tambah Vercel ID hilang ke .env.example: ${vid}"
    APPENDED=$((APPENDED + 1))
  fi
done

# Amaran case-sensitivity: Vercel ID peka case. Flag jika sebarang varian
# case lain wujud (cth VERCEL_project_id) yang boleh sebabkan drift senyap.
while IFS= read -r line; do
  lk="$(echo "$line" | cut -d= -f1 | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
  [[ "$lk" == \#* || -z "$lk" ]] && continue
  for vid in "${VERCEL_IDS[@]}"; do
    if [[ "$lk" != "$vid" && "${lk^^}" == "${vid^^}" ]]; then
      echo "[DRIFT][WARNING] Varian case salah dikesan: ${lk} (sepatutnya ${vid})"
    fi
  done
done < "$ENV_EXAMPLE"
# End: Phase 27 - Vercel Config ID Drift Guard

# Start: Phase 28 - Public Caching Token Drift Guard
# Sahkan konfigurasi token caching awam wujud: PUBLIC_STATS_TTL (cache window)
# dan UPSTASH_REDIS_REST_URL/TOKEN (grid storage). Auto-append jika hilang.
PUBLIC_CACHE_KEYS=("PUBLIC_STATS_TTL" "UPSTASH_REDIS_REST_URL" "UPSTASH_REDIS_REST_TOKEN")
for pkey in "${PUBLIC_CACHE_KEYS[@]}"; do
  if ! grep -qE "^[[:space:]]*#?[[:space:]]*${pkey}=" "$ENV_EXAMPLE"; then
    echo "${pkey}=\"__SET_${pkey}_HERE__\"" >> "$ENV_EXAMPLE"
    echo "[DRIFT] Tambah kunci caching awam hilang ke .env.example: ${pkey}"
    APPENDED=$((APPENDED + 1))
  fi
done
# End: Phase 28 - Public Caching Token Drift Guard

exit 0
# End: Phase 26 - Environment Drift Guard Utility
