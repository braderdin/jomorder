#!/usr/bin/env bash
# Start: Phase 68 - AI Helper 20-Model Health Ping (Round-Robin assertion)
# Baca MODEL_AI_HELPER01-20 dari .env.local (READ-ONLY), ping setiap satu
# dengan 1s spacing. Skip model kosong. Assert HTTP 200 = OK.
# Tulis ringkasan ke /tmp/helper-ping.log (tiada secret terdedah).
set -u
ENV_FILE=".env.local"
BASE_URL=""
DUMMY_KEY="sk-or-v1-dummy"
OK=0
FAIL=0
declare -a FAIL_LIST
if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: $ENV_FILE tiada" >&2
  exit 1
fi
# Parse BASE_URL dari env file
while IFS= read -r line; do
  case "$line" in
    BASE_URL=*) BASE_URL="${line#BASE_URL=}"; BASE_URL="${BASE_URL//\"/}";;
  esac
done < "$ENV_FILE"
if [ -z "$BASE_URL" ]; then
  echo "ERROR: BASE_URL tiada dalam $ENV_FILE" >&2
  exit 1
fi
echo "=== AI HELPER PING $(date -u) ==="
for i in $(seq -w 1 20); do
  key="MODEL_AI_HELPER${i}"
  val=""
  while IFS= read -r line; do
    case "$line" in
      ${key}=*) val="${line#${key}=}"; val="${val//\"/}";;
    esac
  done < "$ENV_FILE"
  if [ -z "$val" ]; then
    echo "HELPER${i}: SKIP (kosong)"
    continue
  fi
  model="${val%%|*}"
  model="$(echo "$model" | xargs)"
  http_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 \
    -X POST "${BASE_URL}/chat/completions" \
    -H "Authorization: Bearer ${DUMMY_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"model\":\"${model}\",\"messages\":[{\"role\":\"user\",\"content\":\"ping\"}],\"max_tokens\":1}" 2>/dev/null)
  if [ "$http_code" = "200" ]; then
    echo "HELPER${i} ($model): OK [$http_code]"
    OK=$((OK+1))
  else
    echo "HELPER${i} ($model): FAIL [$http_code]"
    FAIL=$((FAIL+1))
    FAIL_LIST+=("HELPER${i}:${model}:${http_code}")
  fi
  sleep 1
done
echo "=== RINGKASAN: OK=$OK FAIL=$FAIL ==="
if [ "$FAIL" -gt 0 ]; then
  echo "GAGAL:"
  for f in "${FAIL_LIST[@]}"; do echo "  $f"; done
fi
# End: Phase 68 - AI Helper 20-Model Health Ping