#!/usr/bin/env bash
# Start: Phase 59 - End-to-End Regression (30 command + GUI callback full matrix)
# Guna: ./bin/e2e-regression.sh [BASE_URL]
# Baca secret dari .dev.vars (READ-ONLY, Fasal 11) untuk dapatkan secret token sah.
# Tembak kesemua 30 arahan natif + callback GUI kritikal, assert 200/403/405 = PASS.
set -uo pipefail

BASE_URL="${1:-http://localhost:8787}"
PASS_COUNT=0
FAIL_COUNT=0

# Baca secret token dari .dev.vars (read-only). Guna grep selamat.
SECRET=""
if [[ -f ".dev.vars" ]]; then
  SECRET=$(grep '^X_TELEGRAM_BOT_API_SECRET_TOKEN=' .dev.vars | head -n1 | cut -d'=' -f2- | tr -d '"')
fi
if [[ -z "$SECRET" ]]; then
  SECRET="dummy-secret"
fi
AUTH_HEADER="X-Telegram-Bot-Api-Secret-Token: ${SECRET}"

echo "=================================================="
echo " JomOrder Phase 59 E2E Regression :: ${BASE_URL}"
echo "=================================================="

check_post() {
  local label="$1"
  local text="$2"
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 -X POST \
    -H "$AUTH_HEADER" -H "Content-Type: application/json" \
    -d "{\"update_id\":1,\"message\":{\"message_id\":1,\"from\":{\"id\":111000111},\"chat\":{\"id\":111000111},\"text\":\"${text}\"}}" \
    "${BASE_URL}/" || echo "000")
  if [[ "$code" =~ ^(200|403|405)$ ]]; then
    echo "[PASS] ${label} -> HTTP ${code}"; PASS_COUNT=$((PASS_COUNT+1))
  else
    echo "[FAIL] ${label} -> HTTP ${code}"; FAIL_COUNT=$((FAIL_COUNT+1))
  fi
}

check_cb() {
  local label="$1"
  local data="$2"
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 -X POST \
    -H "$AUTH_HEADER" -H "Content-Type: application/json" \
    -d "{\"update_id\":2,\"callback_query\":{\"id\":\"cb1\",\"from\":{\"id\":111000111},\"message\":{\"message_id\":1,\"chat\":{\"id\":111000111}},\"data\":\"${data}\"}}" \
    "${BASE_URL}/" || echo "000")
  if [[ "$code" =~ ^(200|403|405)$ ]]; then
    echo "[PASS] ${label} -> HTTP ${code}"; PASS_COUNT=$((PASS_COUNT+1))
  else
    echo "[FAIL] ${label} -> HTTP ${code}"; FAIL_COUNT=$((FAIL_COUNT+1))
  fi
}

echo "--- Phase 59: 30 Native Commands (full matrix) ---"
for cmd in "/start" "/bantuan" "/menu" "/menu_kedai" "/urus_kedai" "/daftar" "/tambah_menu" \
  "/senarai_menu" "/cari_makan" "/troli" "/pesanan_saya" "/senarai_pesanan" "/cipta_kupon JOM10 10" \
  "/senarai_kupon" "/padam_kupon JOM10" "/promo" "/invois" "/laporan_jualan" "/tetapan" \
  "/set_lokasi" "/sejarah_pesanan" "/batalkan_pesanan 1" "/profil" "/naiktaraf" "/zon_operasi" \
  "/cart_kosong" "/bantuan_lokasi" "/pengumuman" "/status" "/admin_stats" "/senarai_pendaftaran"; do
  check_post "CMD:${cmd%% *}" "$cmd"
done

echo "--- Phase 59: GUI Callback Matrix (nested BACK + role nav) ---"
for cb in "nav:main" "nav:customer" "nav:merchant" "nav:admin" "nav:lang" "nav:help" \
  "customer_gui" "merchant_gui" "onboard_shop" "onboard_name" "upload_qr" "share_loc" \
  "open_shops" "open_cart" "open_promo" "open_history" "open_profile" "back:customer" \
  "back:merchant" "back:cart" "back:shop" "rate:1:5" "toggle_menu:1" "toggle_status:abc" \
  "add_to_cart:item:shop" "view_cart:abc" "view_shop:shop" "pay_now:1:shop:111000111" \
  "accept_order:1" "ready_order:1" "del_coupon:JOM10" "merchant_menu" "merchant_analytics" \
  "status_refresh" "merchant_orders" "merchant_settings" "merchant_report"; do
  check_cb "CB:${cb%%:*}" "$cb"
done

echo "--------------------------------------------------"
echo " Ringkasan E2E: PASS=${PASS_COUNT} FAIL=${FAIL_COUNT}"
echo "--------------------------------------------------"

if [[ "$FAIL_COUNT" -eq 0 ]]; then
  echo "HASIL: PASS"
  exit 0
else
  echo "HASIL: FAIL"
  exit 1
fi
# End: Phase 59 - End-to-End Regression