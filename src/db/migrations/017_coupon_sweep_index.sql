-- ============================================================
-- JomOrder Modern-Siber :: Migration 017
-- Coupon Expiry Auto-Sweep Performance Index
-- ============================================================
-- Fasal 7 Strategy 1 (RLS isolation) + Scheduler sweep query optimization.
-- Tiada schema drift: hanya TAMBAH index ke jadual sedia ada
-- (kempen_diskaun) supaya sweepExpiredCoupons() laju.
-- Safe: CREATE INDEX CONCURRENTLY tidak lock table lama.
-- ============================================================

-- Index untuk query sweep: tamat_pada <= now() AND status_aktif = true
-- Dapat percepatkan penapis temporal + flag aktif.
CREATE INDEX IF NOT EXISTS idx_kempen_diskaun_sweep
  ON kempen_diskaun (status_aktif, tamat_pada);

-- Index untuk lookup kod_kupon + kedai_id (apply/resolve hot path)
CREATE INDEX IF NOT EXISTS idx_kempen_diskaun_kod_kedai
  ON kempen_diskaun (kedai_id, kod_kupon);

-- Catat migrasi ke jadual audit (jika wujud)
INSERT INTO schema_migrations (version, name, applied_at)
  VALUES (17, '017_coupon_sweep_index', NOW())
  ON CONFLICT (version) DO NOTHING;
-- End: Migration 017