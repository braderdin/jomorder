# 🍜 JomOrder

[![Live Bot](https://img.shields.io/badge/Telegram-JomOrder%20Bot-2CA5E0?logo=telegram)](https://t.me/jomorder_makan_bot)
[![Portal](https://img.shields.io/badge/Portal-Customer%20App-000000?logo=vercel)](https://jomorder-portal.vercel.app)
[![Status](https://img.shields.io/badge/Status-Production%20Ready-brightgreen)]()
[![Program](https://img.shields.io/badge/Program-MDEC%20GLOW-blue)]()
[![License](https://img.shields.io/badge/License-MIT-orange)]()

---

## 🚀 Live Demos

<div align="center">

| 🤖 **Telegram Bot** | 🌐 **Web Portal** |
|:---:|:---:|
| [Cuba Sekarang](https://t.me/jomorder_makan_bot) | [Buka Portal](https://jomorder-portal.vercel.app) |

</div>

---

## 🎯 Gambaran Projek

**JomOrder** ialah platform SaaS bot Telegram yang direka khas untuk meniaga makanan & minuman di Malaysia. Peniaga F&B boleh mengurus pesanan, menu, dan pelanggan terus dari telefon tanpa memerlukan aplikasi atau laman web berasingan — semua dalam Telegram yang pelanggan gunakan setiap hari.

> **Masalah:** Peniaga kecil sukar memulakan perniagaan online kerana kos operasi dan kompleksiti teknikal.  
> **Penyelesaian:** JomOrder menyediakan infrastruktur percuma (Zero-Ops) dengan 30+ perintah native untuk urusin pesanan secara lengkap.

---

## ✨ Ciri Utama

- **📱 Automated Ordering** — Pelanggan boleh pesan terus melalui Telegram dengan antarama yang mesra pengguna tempatan
- **🔄 Real-Time Sync** — Status pesanan dikemas kini secara langsung antara peniaga dan pelanggan
- **🌐 Multi-Platform Web App** — Portal web ringkas untuk paparan menu, statistik jualan, dan urusan kedai
- **🔐 Multi-Tenant Security** — Data setiap kedai diasingkan dengan Row Level Security (RLS)
- **🎟️ Promotional Engine** — Sistem kupon diskaun dan kempen berpusat untuk tingkatkan jualan
- **📊 Analytics Dashboard** — Laporan jualan harian dan ringkasan pesanan
- **🎨 Adaptive UI** — Antarama butang inline dan keyboard yang menyesuaikan peranan pengguna

---

## 🏗️ Arhitektur Teknologi

| Capaian | Infrastruktur |
|---------|---------------|
| **Frontend** | Progressive Web App (PWA) - Mobile-first responsive design |
| **Backend** | Serverless Edge Compute - Zero server management required |
| **Database** | Managed PostgreSQL with Row Level Security |
| **Cache** | Redis for session and state management |
| **Storage** | Object Storage with automated image optimization |
| **Bot API** | Secure Telegram Bot API Integration |

---

## 📱 Flow Penggunaan

```
1️⃣ Pelanggan / Peniaga mula bot Telegram
   ↓
2️⃣ Paparan menu kedai berdekatan / urus menu kedai
   ↓
3️⃣ Pilih item, tambah ke troli (cart)
   ↓
4️⃣ Checkout dengan pembayaran & pengesahan
   ↓
5️⃣ Notifikik ke peniaga & status pesanan diupdate
```

---

## 🗺️ Roadmap Pembangunan

<details>
<summary><b>📋 Klik untuk lihat fasa pembangunan (FAQ)</b></summary>

### Phase 57 - Minigame, R2 Storage & Landing Page
- Minigame spin-wheel "Pusing Roda Makanan" untuk pengalaman interaktif
- Landing page dengan butang "🍔 Buka Menu" dan navigasi smooth scroll
- Penguatkuasaan kuota storan R2 (25MB/akaun) dengan optimalisasi imej WebP

### Phase 58 - GUI Elevation & UX Polish
- Papan kekunci berterusan untuk semua skrin utama
- Pengesahan peranan automatik di `/start`
- Progress bar emoji status pesanan (DITERIMA 🟡 / MEMASAK 🟢 / DIHANTAR 🔵 / SIAP 🟣)
- Pesanan semula pantas dengan 1 ketuk

### Phase 59 - Webhook Resilience, i18n & Photo Cards
- Webhook retry/backoff bridge untuk kebolehan tinggi
- Saluran optimalisasi imej WebP (<150KB) untuk foto menu
- Sistem multi-bahasa (Bahasa Malaysia & English)
- Shop photo card untuk paparan menu yang lebih menarik

### Phase 60 - Founder Demo Shop & CI/CD Auto
- Kedai contoh pengasas untuk demo langsung
- GitHub Actions automatik untuk deployment & migrasi
- Landing page "Kedai Contoh Pengasas" dengan grid menu live

</details>

---

## 🤝 Penyertaan

Projek ini dikembangkan sebagai sebahagian daripada program **MDEC GLOW** untuk menyokong peniaga tempatan Malaysia.

[![Telegram](https://img.shields.io/badge/Telegram-Khong%20Wei%20Shian-2CA5E0?logo=telegram)](https://t.me/braderdin)

---

<p align="center">
  <b>Dibuat dengan 🇲🇾 untuk peniaga tempatan Malaysia</b>
  <br/>
  <sub>JomOrder — Solusi SaaS Percuma untuk Perniagaan Makanan</sub>
</p>