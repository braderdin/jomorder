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

<p align="center">Dibuat dengan 🇲🇾 untuk peniaga tempatan.</p>