-- ============================================================
-- JomOrder Modern-Siber :: Migration 024 - Final RLS Policy Cleanup
-- ============================================================
-- Fasal 13 (DDL Sync Log) + Fasal 7 Strategy 1 (RLS isolation)
-- TUJUAN: Betulkan ralat "duplicate policy" bila 001 + 004 di-apply
--         berasingan. Kedua-dua fail buat policy SAMA pada table SAMA
--         (senarai_kedai_service_all, senarai_kedai_owner_update) ->
--         CREATE kedua gagal dengan 42P07.
-- FIX: DROP POLICY IF EXISTS untuk SEMUA policy berkonflik dulu,
--      kemudian CREATE sekali sahaja. Idempoten + selamat re-run.
-- ============================================================

-- ------------------------------------------------------------
-- 1. senarai_kedai (Merchant Registry)
-- ------------------------------------------------------------
ALTER TABLE senarai_kedai ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS senarai_kedai_service_all ON senarai_kedai;
CREATE POLICY senarai_kedai_service_all
    ON senarai_kedai
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS senarai_kedai_owner_update ON senarai_kedai;
CREATE POLICY senarai_kedai_owner_update
    ON senarai_kedai
    FOR UPDATE
    TO anon, authenticated
    USING (
        merchant_telegram_id = current_setting('app.merchant_tgid', true)
    )
    WITH CHECK (
        merchant_telegram_id = current_setting('app.merchant_tgid', true)
    );

DROP POLICY IF EXISTS senarai_kedai_public_read ON senarai_kedai;
CREATE POLICY senarai_kedai_public_read
    ON senarai_kedai FOR SELECT USING (true);

-- ------------------------------------------------------------
-- 2. kawasan_operasi
-- ------------------------------------------------------------
ALTER TABLE kawasan_operasi ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kawasan_operasi_public_read ON kawasan_operasi;
CREATE POLICY kawasan_operasi_public_read
    ON kawasan_operasi FOR SELECT USING (true);

DROP POLICY IF EXISTS kawasan_operasi_service_all ON kawasan_operasi;
CREATE POLICY kawasan_operasi_service_all
    ON kawasan_operasi FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ------------------------------------------------------------
-- 3. menu_makanan
-- ------------------------------------------------------------
ALTER TABLE menu_makanan ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS menu_makanan_public_read ON menu_makanan;
CREATE POLICY menu_makanan_public_read
    ON menu_makanan FOR SELECT USING (true);

DROP POLICY IF EXISTS menu_makanan_service_all ON menu_makanan;
CREATE POLICY menu_makanan_service_all
    ON menu_makanan FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ------------------------------------------------------------
-- 4. rekod_pesanan
-- ------------------------------------------------------------
ALTER TABLE rekod_pesanan ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rekod_pesanan_public_read ON rekod_pesanan;
CREATE POLICY rekod_pesanan_public_read
    ON rekod_pesanan FOR SELECT USING (true);

DROP POLICY IF EXISTS rekod_pesanan_service_all ON rekod_pesanan;
CREATE POLICY rekod_pesanan_service_all
    ON rekod_pesanan FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ------------------------------------------------------------
-- 5. kempen_diskaun
-- ------------------------------------------------------------
ALTER TABLE kempen_diskaun ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kempen_diskaun_public_read ON kempen_diskaun;
CREATE POLICY kempen_diskaun_public_read
    ON kempen_diskaun FOR SELECT USING (true);

DROP POLICY IF EXISTS kempen_diskaun_service_all ON kempen_diskaun;
CREATE POLICY kempen_diskaun_service_all
    ON kempen_diskaun FOR ALL TO service_role USING (true) WITH CHECK (true);

-- End: Phase 57 - Final RLS Policy Cleanup (024)