-- Start: Phase 30 - Order Lifecycle Performance Indices (Migration 006)
-- Fasal 13 (Schema Integrity Guard) + Fasal 4 (SOA). Idempoten: selamat di-run berulang.
-- Optimize vendor active-order queries pada kolum status_pesanan di rekod_pesanan.

-- Indeks partial: hanya pesanan aktif (belum siap/tolak) untuk laju vendor scan.
CREATE INDEX IF NOT EXISTS idx_rekod_pesanan_status_active
  ON rekod_pesanan (merchant_telegram_id, status_pesanan)
  WHERE status_pesanan IN ('PENDING', 'ACCEPTED', 'PREPARING', 'READY');

-- Indeks komposit penuh: fallback query mengikut merchant + status + updated_at.
CREATE INDEX IF NOT EXISTS idx_rekod_pesanan_merchant_status_updated
  ON rekod_pesanan (merchant_telegram_id, status_pesanan, updated_at DESC);

-- Komen dokumentasi pada kolum sasaran.
COMMENT ON COLUMN rekod_pesanan.status_pesanan IS
  'Phase 30 lifecycle: PENDING | ACCEPTED | PREPARING | READY | COMPLETED | REJECTED';
-- End: Phase 30 - Order Lifecycle Performance Indices (Migration 006)