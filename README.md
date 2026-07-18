# jomorder
Multi-tenant Telegram bot SaaS untuk kedai makan Malaysia

## Status: 22/22 Command Aktif (Phase 44) + UI/UX Menarik (Phase 45)

Bot JomOrder menyokong 22 arahan natif Bahasa Malaysia yang berfungsi sepenuhnya.
Portal landings page di-reka cantik (neon/glassmorphism) dengan statistik langsung dari Supabase.

- /start - Mula & pilih peranan
- /bantuan - Panduan interaktif bot
- /daftar - Daftar kedai baharu
- /urus_kedai - Urus kedai saya
- /tambah_menu - Tambah item menu
- /senarai_menu - Senarai menu kedai
- /cari_makan - Cari kedai berdekatan
- /troli - Lihat troli pesanan
- /pesanan_saya - Senarai pesanan aktif
- /senarai_pesanan - Senarai pesanan saya
- /cipta_kupon - Cipta kupon diskaun
- /senarai_kupon - Senarai kupon aktif
- /padam_kupon - Padam kupon diskaun
- /laporan_jualan - Laporan jualan kedai
- /set_lokasi - Tetapkan koordinat kedai
- /sejarah_pesanan - Sejarah pesanan saya
- /batalkan_pesanan - Batal pesanan tertunda
- /profil - Profil & langganan saya
- /naiktaraf - Naik taraf pelan premium
- /admin_stats - Statistik pentadbir
- /senarai_pendaftaran - Senarai peniaga berdaftar
- /pengumuman - Pengumuman pentadbir
- /status - Semak status bot & akaun

## Tech Stack
- Cloudflare Workers (TypeScript)
- Supabase Postgres (RLS multi-tenant)
- Upstash Redis (state buffer)
- Telegram Bot API

## Deploy
```
bash bin/deploy-worker.sh
bash bin/force-webhook-register.sh