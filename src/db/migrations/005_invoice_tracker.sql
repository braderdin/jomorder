-- ============================================================
-- JomOrder Phase 29 :: Migration 005 - Invoice Tracker Indexes
-- Idempotent DDL: pecutkan lookup histori tenant berasaskan timestamp.
-- Fasal 13 (Schema Sync) - apply pada Supabase dashboard sebelum logic.
-- ============================================================

-- Indeks tunggal pada created_at: laju kan query julat masa global.
CREATE INDEX IF NOT EXISTS idx_rekod_pesanan_created_at
    ON rekod_pesanan (created_at DESC);

-- Indeks komposit (kedai_id, created_at): tenant-scoped timestamp lookup.
-- Paling kritikal untuk buildMerchantInvoice() yang filter kedai + julat masa.
CREATE INDEX IF NOT EXISTS idx_rekod_pesanan_kedai_created
    ON rekod_pesanan (kedai_id, created_at DESC);

-- Indeks separa pada status pembayaran: laju kan ringkasan invois.
CREATE INDEX IF NOT EXISTS idx_rekod_pesanan_status_bayar
    ON rekod_pesanan (status_pembayaran)
    WHERE status_pembayaran = 'UNPAID';

-- Catat migration ke log schema (idempoten).
INSERT INTO schema_migrations (nama_migration, diaplik_pada)
VALUES ('005_invoice_tracker', NOW())
ON CONFLICT (nama_migration) DO NOTHING;

-- End: Phase 29 Migration 005