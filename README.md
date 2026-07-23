# 🍜 JomOrder
### *Sistem Pesanan Telegram Serba Otomatis untuk Perniagaan Makanan & Minuman Malaysia*

<p align="center">
  <a href="https://t.me/jomorder_makan_bot">
    <img src="https://img.shields.io/badge/Status-Production-brightgreen?style=for-the-badge" alt="Status: Production Ready">
  </a>
  <a href="https://t.me/jomorder_makan_bot">
    <img src="https://img.shields.io/badge/Telegram-Bot%20Live-2CA5E0?style=for-the-badge&logo=telegram" alt="Live Telegram Bot">
  </a>
  <a href="https://jomorder-portal.vercel.app">
    <img src="https://img.shields.io/badge/Web-Portal%20Live-000000?style=for-the-badge&logo=vercel" alt="Web Portal">
  </a>
  <a href="https://mdec.my">
    <img src="https://img.shields.io/badge/Program-MDEC%20GLOW-blue?style=for-the-badge" alt="MDEC GLOW">
  </a>
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/License-MIT-orange?style=for-the-badge" alt="MIT License">
  </a>
</p>

---

## 🌟 Hero Section

**JomOrder** menyediakan penyelesaian SaaS bot Telegram lengkap — memudahkan peniaga F&B kecil di Malaysia untuk mengumpulkan pesanan secara digital secara serba otomatis, tanpa memerlukan aplikasi berasingan atau laman web yang kompleks.

> **Masalah:** Peniaga kecil sukar memulakan perniagaan online kerana kos operasi dan kompleksiti teknikal.  
> **Penyelesaian:** JomOrder menyediakan infrastruktur percuma (Zero-Ops) dengan 30+ perintah native untuk urusin pesanan secara lengkap, langsung dari Telegram.

---

## 🔗 Live Demos & Links

<div align="center">

| 🤖 **Telegram Bot Demo** | 🌐 **Web Application Portal** |
|:---:|:---:|
| [![Cuba Bot](https://img.shields.io/badge/🚀-Cuba%20Sekarang-2CA5E0?style=for-the-badge&labelColor=2CA5E0)](https://t.me/jomorder_makan_bot) | [![Buka Portal](https://img.shields.io/badge/🌐-Buka%20Portal-000000?style=for-the-badge&labelColor=000000)](https://jomorder-portal.vercel.app) |

</div>

---

## 🎯 Gambaran Projek

JomOrder ialah platform SaaS bot Telegram yang direka khas untuk meniaga makanan & minuman di Malaysia. Peniaga F&B boleh mengurus pesanan, menu, dan pelanggan terus dari telefon — semua dalam Telegram yang pelanggan gunakan setiap hari.

---

## ✨ Ciri Utama

- **📱 Automated Ordering System** — Pelanggan boleh pesan terus melalui Telegram dengan antarama yang mesra pengguna tempatan
- **🔄 Real-Time Synchronization** — Status pesanan dikemas kini secara langsung antara peniaga dan pelanggan
- **🌐 Multi-Platform Web Application** — Portal web ringkas untuk paparan menu, statistik jualan, dan urusan kedai
- **🔐 Secure Multi-Tenant Architecture** — Data setiap kedai diasingkan dengan keselamatan tinggi
- **🎟️ Promotional Engine** — Sistem kupon diskaun dan kempen berpusat untuk tingkatkan jualan
- **📊 Analytics Dashboard** — Laporan jualan harian dan ringkasan pesanan
- **🎨 Adaptive User Interface** — Antarama butang inline dan keyboard yang menyesuaikan peranan pengguna

---

## ⚙️ Tech Stack

| Layer | Technology |
|:-----:|------------|
| **Frontend** | Modern Web & Serverless Architecture (Mobile-first PWA) |
| **Backend** | Serverless Edge Compute with Zero Server Management |
| **Database** | Managed PostgreSQL with Secure Multi-Tenant Isolation |
| **Caching** | Redis for Session & State Management |
| **Storage** | Object Storage with Automated Image Optimization |
| **Bot Integration** | Secure Telegram Bot API Integration |

---

## 📋 Alur Kerja Penggunaan

```
┌─────────────────────────────────────────────┐
│ 1️⃣ Mula Bot Telegram                        │
└─────────────────┬───────────────────────────┘
                ▼
┌─────────────────────────────────────────────┐
│ 2️⃣ Pelanggan: Lihat Menu / Peniaga: Urus Menu │
└─────────────────┬───────────────────────────┘
                ▼
┌─────────────────────────────────────────────┐
│ 3️⃣ Pilih Item & Tambah ke Troli            │
└─────────────────┬───────────────────────────┘
                ▼
┌─────────────────────────────────────────────┐
│ 4️⃣ Checkout dengan Pembayaran & Pengesahan │
└─────────────────┬───────────────────────────┘
                ▼
┌─────────────────────────────────────────────┐
│ 5️⃣ Notifikasi ke Peniaga & Status Update   │
└─────────────────────────────────────────────┘
```

---

## 🗺️ Fasa Pembangunan & Roadmap

<details>
<summary><b>📋 Klik untuk melihat log fasa pembangunan (FAQ)</b></summary>

### Phase 57 — Minigame, R2 Storage & Landing Page
- Minigame spin-wheel "Pusing Roda Makanan" untuk pengalaman interaktif
- Landing page dengan butang "🍔 Buka Menu" dan navigasi smooth scroll
- Penguatkuasaan kuota storan R2 (25MB/akaun) dengan optimalisasi imej WebP

### Phase 58 — GUI Elevation & UX Polish
- Papan kekunci berterusan untuk semua skrin utama
- Pengesahan peranan automatik di `/start`
- Progress bar emoji status pesanan (DITERIMA 🟡 / MEMASAK 🟢 / DIHANTAR 🔵 / SIAP 🟣)
- Pesanan semula pantas dengan 1 ketuk

### Phase 59 — Webhook Resilience, i18n & Photo Cards
- Webhook retry/backoff bridge untuk kebolehan tinggi
- Saluran optimalisasi imej WebP (<150KB) untuk foto menu
- Sistem multi-bahasa (Bahasa Malaysia & English)
- Shop photo card untuk paparan menu yang lebih menarik

### Phase 60 — Founder Demo Shop & CI/CD Auto
- Kedai contoh pengasas untuk demo langsung
- GitHub Actions automatik untuk deployment & migrasi
- Landing page "Kedai Contoh Pengasas" dengan grid menu live

</details>

---

## 🤝 Penyertaan

Projek ini dikembangkan sebagai sebahagian daripada program **MDEC GLOW** untuk menyokong peniaga tempatan Malaysia.

[![Telegram](https://img.shields.io/badge/Telegram-Abang%20Din-2CA5E0?logo=telegram)](https://t.me/jomorder_makan_bot)

---

<p align="center">
  <b>Dibuat dengan 🇲🇾 untuk peniaga tempatan Malaysia</b>
  <br/>
  <sub>JomOrder — Solusi SaaS Percuma untuk Perniagaan Makanan</sub>
</p>