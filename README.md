# 🍜 JomOrder

> Platform SaaS bot Telegram untuk kedai makan Malaysia — urus pesanan, menu & pelanggan terus dari telefon.

[![Live Bot](https://img.shields.io/badge/Telegram-JomOrder%20Bot-2CA5E0?logo=telegram)](https://t.me/jomorder_makan_bot)
[![Portal](https://img.shields.io/badge/Portal-JomOrder%20Web-000000?logo=vercel)](https://jomorder-portal.vercel.app/)
![Status](https://img.shields.io/badge/Status-Active-brightgreen)
![SaaS](https://img.shields.io/badge/Multi--Tenant-Yes-blue)

---

## 🚀 Cuba Sekarang (Live)

| Produk | Pautan |
|--------|--------|
| 🤖 Bot Telegram | https://t.me/jomorder_makan_bot |
| 🌐 Portal Web | https://jomorder-portal.vercel.app/ |

---

## ✨ Apa itu JomOrder?

JomOrder membantu peniaga F&B Malaysia menerima pesanan secara digital tanpa kos operasi — terus ke Telegram yang pelanggan dah guna setiap hari.

- **Multi-Tenant** — setiap kedai dapat ruang sendiri, data diasingkan selamat.
- **Interface Bahasa Malaysia** — mesra pengguna tempatan, tak perlu switch app.
- **Zero-Ops Free Tier** — dioptimasikan untuk berjalan pada infrastruktur percuma.
- **30 Perintah Native** — kawalan penuh kedai terus dari chat (termasuk /menu, /menu_kedai, /tetapan, /invois, /zon_operasi, /cart_kosong, /promo, /bantuan_lokasi).

---

## 🛠️ Ciri Utama

- Pengurusan menu & kedai dari Telegram
- Troli pesanan & sejarah pelanggan
- Kupon diskaun & laporan jualan
- Portal web dengan statistik langsung
- Keselamatan isolation per-peniaga (RLS)
- Muat naik QR DuitNow (R2) + foto menu (Fasal 8)
- Kad alu-aluan adaptif (waktu + peranan)
- Grid menu foto langsung di portal
- Ringkasan harian peniaga (digest cron)

---

## 📋 Matriks Perintah Native (30)

| Kategori | Perintah |
|----------|----------|
| Pelanggan | /start · /bantuan · /menu · /menu_kedai · /cari_makan · /troli · /cart_kosong · /pesanan_saya · /senarai_pesanan · /sejarah_pesanan · /profil · /promo · /bantuan_lokasi · /batalkan_pesanan |
| Peniaga | /daftar · /tambah_menu · /senarai_menu · /urus · /urus_kedai · /laporan_jualan · /cipta_kupon · /senarai_kupon · /padam_kupon · /invois · /tetapan · /set_lokasi · /zon_operasi · /naiktaraf |
| Pentadbir | /admin_stats · /senarai_pendaftaran · /pengumuman · /status |

Semua perintah diselaraskan antara `NATIVE_COMMAND_LIST` (types.ts), `BOT_COMMANDS` (telegram_setup.ts), `DISTRIBUTOR_COMMAND_MAP` (handlers.ts), dan `setMyCommands` (bin/force-webhook-register.sh).

---

## 🗂️ Skema Supabase (Migrasi 019)

- `kempen_diskaun` — enjin kupon diskaun berpusat (RLS service_role)
- `webhook_error_logs` — telemetry ralat webhook
- `menu_makanan.gambar_url` — foto menu WebP (Fasal 8)
- Index `idx_kempen_kedai_aktif`, `idx_kempen_kod`, `idx_menu_gambar` — laju sweep

---

## 🖱️ Navigasi GUI Tanpa Command (Phase 55 Modern-Siber)

Semua menu bot boleh diakses terus dari **butang inline + keyboard**, tanpa taip `/command`. Setiap skrin ada butang **⬅️ Kembali** untuk navigasi lancar.

- **Pelanggan:** `🛒 Kedai Berdekatan` · `🛍️ Troli Saya` · `🔥 Promo Aktif` · `📜 Sejarah Pesanan` · `👤 Profil Saya` · `⭐ Beri Penilaian`
- **Peniaga:** `🏪 Papan Perniagaan` · `📋 Menu Kedai` · `📦 Pesanan` · `📊 Laporan` · `🎟️ Kupon` · `⚙️ Tetapan` · `📍 Zon Operasi`
- **Navigasi Grid:** `nav:main` · `nav:customer` · `nav:merchant` · `nav:admin` dengan butang BACK konsisten.

Portal web turut memaparkan **GUI Nav Button Grid** (glow hover Modern-Siber) di `src/public/index.html`.

---

## 🧱 Teknologi

Dibina sebagai *serverless-first SaaS* menggunakan edge compute, managed database dan cache layer — tanpa pelayan untuk diurus.

---

## 📜 Lesen

MIT © JomOrder — Projek MDEC GLOW.

---

# Start: Phase 57 - Minigame + R2 Storage + Landing Page Upgrade
- Minigame spin-wheel "Pusing Roda Makanan" (hiburan, tanpa kupon): src/services/minigame.ts + src/handlers/minigame_gui.ts
- Landing page "🍔 Buka Menu" glow button + scroll ke #menu-grid (index.html + style.css + script.js)
- R2 Storage quota enforcer (20MB/akaun) + image optimize guard (<150KB WebP)
- QR DuitNow upload ke R2 melalui /tetapan -> Muat Naik QR (settings.ts)
- Redis mergeState (atomic field merge, elak overwrite field lain)
- Minigame analytics lightweight counter (session_cache.ts + analytics.ts)
- Customer GUI richer grid (Bayar / Nilai) + Merchant GUI QR DuitNow button
- Router: open_pay + open_review + upload_qr routed
- Vercel rewrite /api/menu-showcase -> worker
- Manual action: TIADA (semua DDL automatik via postgres MCP)
# End: Phase 57 - Minigame + R2 Storage + Landing Page Upgrade

# Start: Phase 58 - GUI Elevation & UX Polish
- Persistent reply keyboard pelanggan (`customerReplyKeyboard`) & peniaga (`merchantReplyKeyboard`) pada semua skrin utama.
- Auto-role detect di `/start` -> route terus ke Customer GUI atau Merchant Papan (tiada taip /command).
- Nested BACK chain: `back:customer`, `back:merchant`, `back:cart`, `back:shop` + smart parent return.
- Empty-state mesra: troli kosong & tiada pesanan aktif papar CTA "Cari Kedai" + promo.
- Order progress bar emoji (DITERIMA 🟡 / MEMASAK 🟢 / DIHANTAR 🔵 / SIAP 🟣) pada `handlePesananSaya`.
- Rich menu item card helper (`buildMenuItemCaption`, `menuItemAddKeyboard`) di `ui_helpers.ts`.
- Quick Reorder: snapshot cart ke state + `reorderKeyboard` 1-tap pesan semula.
- Landing page deep-link `?start=menu` scroll terus ke #menu-grid + butang "🍔 Buka Menu Terus".
- Minigame polish: persistent keyboard + glow style (`.showcase-btn`).
# End: Phase 58 - GUI Elevation & UX Polish

# Start: Phase 59 - Webhook Resilience, i18n & Photo Cards
- Webhook retry/backoff bridge (`src/services/telegram_retry_bridge.ts`) + middleware binding di `telegram.ts` `sendMessage` (429/5xx auto-retry, clean 200 OK ke Telegram pada timeout, Fasal 7 S4).
- Image optimization pipeline (`image_optimize.ts`) + storage quota guard (<150KB WebP, 25MB akaun) di `storage_quota.ts`; `storage.ts` convert ke WebP sebelum upload R2.
- Merchant menu photo upload `/tetapan -> Muat Naik Foto Menu` terus ke R2 WebP (`merchant.ts` + `handleSetMenuPhoto`).
- e2e-regression.sh (tsc + smoke + e2e flow) + hook di `smoke-test.sh` (`-e2e` flag).
- testing.ts GUI matrix (caption/keyboard/back assertion) + sentinel version bump.
- i18n core (`src/services/i18n.ts`) BM default + EN toggle; hook di `start.ts` + `customer_cart.ts` + landing page `data-i18n` (script.js toggle).
- Shop photo card caption (`buildShopCaption`) + menu photo grid glow (style.css).
- Manual action: TIADA (semua DDL automatik via postgres MCP).
# End: Phase 59 - Webhook Resilience, i18n & Photo Cards

<p align="center">Dibuat dengan 🇲🇾 untuk peniaga tempatan.</p>
