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
exit 0
# End: Phase 26 - Environment Drift Guard Utility