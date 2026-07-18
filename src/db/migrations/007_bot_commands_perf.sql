-- Start: Phase 31 - Bot Command Performance Index (Migration 007)
-- Fasal 7 Strategy 1 (RLS isolation) + Fasal 11 (schema integrity guard).
-- Indeks idempoten untuk pastikan trigger arahan bot (merchant_telegram_id
-- lookup + count pesanan hari ini) balas < 200ms tanpa sequential scan.
-- SELARAS: Chip Besar mesti apply skrip ini di Supabase SQL Editor live
-- sebelum logik command production diaktifkan (Fasal 13 migration sync).

-- Indeks pada pengecam Telegram peniaga (lookup /start & /urus).
CREATE INDEX IF NOT EXISTS idx_senarai_kedai_merchant_tg
  ON public.senarai_kedai (merchant_telegram_id);

-- Indeks pada status kedai (filter /menu senarai aktif).
CREATE INDEX IF NOT EXISTS idx_senarai_kedai_status
  ON public.senarai_kedai (status_kedai);

-- Indeks composite untuk count pesanan hari ini (dashboard merchant).
CREATE INDEX IF NOT EXISTS idx_rekod_pesanan_kedai_created
  ON public.rekod_pesanan (kedai_id, created_at);

-- End: Phase 31 - Bot Command Performance Index (Migration 007)