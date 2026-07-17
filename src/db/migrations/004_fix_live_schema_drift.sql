-- ============================================================
-- JomOrder Modern-Siber :: Migration 004 - Consolidated Live Schema Drift Fix
-- ============================================================
-- Fasal 13 (DDL Sync Log) + Fasal 7 Strategy 1 (RLS isolation)
-- Fasal 1 (Anti-Hallucination): Tables/columns below are taken VERBATIM
--   from the project's canonical source of truth (src/db/schema.sql,
--   functions.sql, triggers.sql, analytics.sql, seed.sql, 001/002/003).
--   No fabricated tables/columns are introduced.
--
-- PURPOSE: Run ONCE in Supabase SQL Editor to fully reconcile a live DB
--   that was provisioned from an OLD/ALTERNATE schema (live shows
--   rekoel_pesanan / penjual_kedai / kawasaan_operasional) back to the
--   project's canonical schema (rekod_pesanan / senarai_kedai / kawasan_operasi).
--
-- ROOT CAUSE SUMMARY (see report):
--   1. get_saas_metrics() existed with a DIFFERENT return type -> 42P13 on
--      CREATE OR REPLACE. Fixed by DROP FUNCTION ... CASCADE at top.
--   2. Live DB table names diverged from project schema -> view/function
--      referencing rekod_pesanan failed (42P01 for zon_carian attempt).
--   3. zon_carian / kupon tables are NOT defined ANYWHERE in the project
--      (schema.sql has only 4 tables; coupon logic uses kempen_diskaun +
--      kod_kupon column). They are intentionally NOT created here to avoid
--      NEW drift. Chip Besar must confirm if they are actually required.
--
-- IDEMPOTENT: Safe to re-run. Uses IF NOT EXISTS / DROP IF EXISTS guards.
-- ============================================================

-- ============================================================
-- 0. Drop conflicting function (fixes ERROR 42P13)
-- ============================================================
DROP FUNCTION IF EXISTS public.get_saas_metrics() CASCADE;

-- ============================================================
-- 1. CORE TABLES (src/db/schema.sql) - canonical columns
-- ============================================================

-- ---- Jadual 1: kawasan_operasi ----
CREATE TABLE IF NOT EXISTS kawasan_operasi (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nama_kawasan TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE kawasan_operasi ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kawasan_operasi_public_read ON kawasan_operasi;
CREATE POLICY kawasan_operasi_public_read
    ON kawasan_operasi FOR SELECT USING (true);
DROP POLICY IF EXISTS kawasan_operasi_service_all ON kawasan_operasi;
CREATE POLICY kawasan_operasi_service_all
    ON kawasan_operasi FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ---- Jadual 2: senarai_kedai (Merchant Registry) ----
CREATE TABLE IF NOT EXISTS senarai_kedai (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    nama_pemilik TEXT NOT NULL,
    emel_pemilik TEXT UNIQUE NOT NULL,
    no_telefon_sim TEXT UNIQUE NOT NULL,
    nama_kedai TEXT NOT NULL,
    latitude_kedai NUMERIC NOT NULL,
    longitude_kedai NUMERIC NOT NULL,
    duitnow_qr_url TEXT,
    status_kedai TEXT DEFAULT 'MENUNGGU_PENGESAHAN',
    status_langganan TEXT DEFAULT 'AKTIF',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
-- Fasa 4: merchant_telegram_id (onboarding Telegram lookup)
ALTER TABLE senarai_kedai ADD COLUMN IF NOT EXISTS merchant_telegram_id TEXT UNIQUE;
-- Fasa 5: tamat_langganan_pada (subscription expiry timestamp)
ALTER TABLE senarai_kedai ADD COLUMN IF NOT EXISTS tamat_langganan_pada TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_senarai_kedai_geo
    ON senarai_kedai (latitude_kedai, longitude_kedai);
CREATE INDEX IF NOT EXISTS idx_senarai_kedai_tgid
    ON senarai_kedai (merchant_telegram_id);
ALTER TABLE senarai_kedai ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS senarai_kedai_public_read ON senarai_kedai;
CREATE POLICY senarai_kedai_public_read
    ON senarai_kedai FOR SELECT USING (true);
DROP POLICY IF EXISTS senarai_kedai_service_all ON senarai_kedai;
CREATE POLICY senarai_kedai_service_all
    ON senarai_kedai FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ---- Jadual 3: menu_makanan ----
CREATE TABLE IF NOT EXISTS menu_makanan (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    kedai_id UUID REFERENCES senarai_kedai(id) ON DELETE CASCADE,
    nama_hidangan TEXT NOT NULL,
    harga NUMERIC(10,2) NOT NULL,
    status_tersedia BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE menu_makanan ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS menu_makanan_public_read ON menu_makanan;
CREATE POLICY menu_makanan_public_read
    ON menu_makanan FOR SELECT USING (true);
DROP POLICY IF EXISTS menu_makanan_service_all ON menu_makanan;
CREATE POLICY menu_makanan_service_all
    ON menu_makanan FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ---- Jadual 4: rekod_pesanan ----
CREATE TABLE IF NOT EXISTS rekod_pesanan (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    kedai_id UUID REFERENCES senarai_kedai(id),
    pelanggan_telegram_id TEXT NOT NULL,
    butiran_pesanan JSONB NOT NULL,
    jumlah_harga NUMERIC(10,2) NOT NULL,
    kaedah_pembayaran TEXT NOT NULL,
    status_pembayaran TEXT DEFAULT 'UNPAID',
    status_penghantaran TEXT DEFAULT 'PENDING',
    bukti_resit_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE rekod_pesanan ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rekod_pesanan_public_read ON rekod_pesanan;
CREATE POLICY rekod_pesanan_public_read
    ON rekod_pesanan FOR SELECT USING (true);
DROP POLICY IF EXISTS rekod_pesanan_service_all ON rekod_pesanan;
CREATE POLICY rekod_pesanan_service_all
    ON rekod_pesanan FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- 2. kempen_diskaun (migration 002 - coupon registry)
-- ============================================================
CREATE TABLE IF NOT EXISTS kempen_diskaun (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    kedai_id UUID REFERENCES senarai_kedai(id) ON DELETE CASCADE,
    kod_kupon TEXT UNIQUE NOT NULL,
    jenis_diskaun TEXT NOT NULL CHECK (jenis_diskaun IN ('PERCENT', 'AMOUNT')),
    nilai_diskaun NUMERIC(10,2) NOT NULL CHECK (nilai_diskaun >= 0),
    status_aktif BOOLEAN DEFAULT true,
    tamat_pada TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_kempen_diskaun_kedai ON kempen_diskaun (kedai_id);
CREATE INDEX IF NOT EXISTS idx_kempen_diskaun_kod ON kempen_diskaun (kod_kupon);
ALTER TABLE kempen_diskaun ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kempen_diskaun_public_read ON kempen_diskaun;
CREATE POLICY kempen_diskaun_public_read
    ON kempen_diskaun FOR SELECT USING (true);
DROP POLICY IF EXISTS kempen_diskaun_service_all ON kempen_diskaun;
CREATE POLICY kempen_diskaun_service_all
    ON kempen_diskaun FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- 3. Migration 001 - RLS owner-update guard (idempotent re-apply)
-- ============================================================
ALTER TABLE senarai_kedai ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS senarai_kedai_service_all ON senarai_kedai;
CREATE POLICY senarai_kedai_service_all
    ON senarai_kedai FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS senarai_kedai_owner_update ON senarai_kedai;
CREATE POLICY senarai_kedai_owner_update
    ON senarai_kedai FOR UPDATE TO anon, authenticated
    USING (merchant_telegram_id = current_setting('app.merchant_tgid', true))
    WITH CHECK (
        merchant_telegram_id = current_setting('app.merchant_tgid', true)
        AND NEW.status_kedai = OLD.status_kedai
        AND NEW.status_langganan = OLD.status_langganan
    );

-- ============================================================
-- 4. Migration 003 - Premium CHECK constraint (idempotent)
-- ============================================================
ALTER TABLE senarai_kedai
    DROP CONSTRAINT IF EXISTS chk_status_langganan;
ALTER TABLE senarai_kedai
    ADD CONSTRAINT chk_status_langganan
    CHECK (status_langganan IN ('AKTIF', 'HAMPIR_TAMAT', 'TAMAT', 'PREMIUM'));

-- ============================================================
-- 5. functions.sql - Haversine geo-match (SECURITY DEFINER)
-- ============================================================
CREATE OR REPLACE FUNCTION ambil_kedai_berhampiran(
    pelanggan_lat numeric,
    pelanggan_long numeric,
    radius_km numeric DEFAULT 10
)
RETURNS TABLE (
    id uuid,
    nama_kedai text,
    latitude_kedai numeric,
    longitude_kedai numeric,
    jarak_km numeric
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        q.q_id,
        q.q_nama,
        q.q_lat,
        q.q_long,
        q.q_jarak
    FROM (
        SELECT
            s.id AS q_id,
            s.nama_kedai AS q_nama,
            s.latitude_kedai AS q_lat,
            s.longitude_kedai AS q_long,
            (
                (
                    2 * 6371 * asin(
                        sqrt(
                            power(sin(radians(s.latitude_kedai - pelanggan_lat) / 2), 2)
                            + cos(radians(pelanggan_lat))
                              * cos(radians(s.latitude_kedai))
                              * power(sin(radians(s.longitude_kedai - pelanggan_long) / 2), 2)
                        )
                    )
                )::numeric
            ) AS q_jarak
        FROM senarai_kedai s
        WHERE s.status_kedai = 'DILULUSKAN'
          AND s.status_langganan = 'AKTIF'
          AND s.latitude_kedai IS NOT NULL
          AND s.longitude_kedai IS NOT NULL
    ) q
    WHERE q.q_jarak <= radius_km
    ORDER BY q.q_jarak ASC;
END;
$$ LANGUAGE plpgsql
   SECURITY DEFINER
   SET search_path = public;

-- ============================================================
-- 6. triggers.sql - Default subscription expiry trigger (Fasa 6)
-- ============================================================
CREATE OR REPLACE FUNCTION set_default_tamat_langganan()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.tamat_langganan_pada IS NULL THEN
        NEW.tamat_langganan_pada := NOW() + INTERVAL '30 days';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_default_tamat_langganan ON senarai_kedai;
CREATE TRIGGER trg_set_default_tamat_langganan
    BEFORE INSERT ON senarai_kedai
    FOR EACH ROW
    EXECUTE FUNCTION set_default_tamat_langganan();

-- ============================================================
-- 7. analytics.sql - SaaS metrics view + RPC (Fasa 13)
-- ============================================================
DROP VIEW IF EXISTS public.v_saas_metrics;
CREATE VIEW public.v_saas_metrics AS
SELECT
    (
        SELECT COUNT(*)
        FROM senarai_kedai
        WHERE status_kedai = 'DILULUSKAN'
          AND status_langganan = 'AKTIF'
    ) AS total_active_merchants,
    (
        SELECT COUNT(*)
        FROM senarai_kedai
        WHERE status_langganan = 'PREMIUM'
    ) AS total_premium_stores,
    (
        SELECT COALESCE(SUM(jumlah_harga), 0)
        FROM rekod_pesanan
        WHERE status_pembayaran = 'TELAH_BAYAR'
    ) AS total_revenue_rm,
    (
        SELECT COUNT(*)
        FROM rekod_pesanan
    ) AS total_orders,
    (
        SELECT COUNT(*) * 29
        FROM senarai_kedai
        WHERE status_kedai = 'DILULUSKAN'
          AND status_langganan = 'AKTIF'
    ) AS mrr_projection_rm;

CREATE OR REPLACE FUNCTION public.get_saas_metrics()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_active INT;
    v_premium INT;
    v_revenue NUMERIC;
    v_orders INT;
    v_mrr NUMERIC;
BEGIN
    SELECT total_active_merchants,
           total_premium_stores,
           total_revenue_rm,
           total_orders,
           mrr_projection_rm
    INTO v_active, v_premium, v_revenue, v_orders, v_mrr
    FROM public.v_saas_metrics;

    RETURN jsonb_build_object(
        'total_active_merchants', v_active,
        'total_premium_stores', v_premium,
        'total_revenue_rm', v_revenue,
        'total_orders', v_orders,
        'mrr_projection_rm', v_mrr
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_saas_metrics() TO service_role;
GRANT SELECT ON public.v_saas_metrics TO service_role;

-- ============================================================
-- 8. seed.sql - Idempotent operational zone seed (Fasa 12)
-- ============================================================
INSERT INTO kawasan_operasi (nama_kawasan) VALUES
    ('Kuala Lumpur'),
    ('Puncak Alam'),
    ('Petaling Jaya'),
    ('Shah Alam'),
    ('Klang')
ON CONFLICT (nama_kawasan) DO NOTHING;

-- ============================================================
-- 9. DRIFT FLAG (Fasal 13) - READ, DO NOT SILENTLY APPLY
-- ============================================================
-- zon_carian  : NOT defined in ANY project SQL/TS. Intentionally omitted.
--               If Chip Besar truly needs it, define its DDL in schema.sql
--               first, then re-run this migration.
-- kupon       : No such table in project. Coupon logic uses kempen_diskaun
--               (kod_kupon column). Intentionally omitted.
-- Legacy live tables (rekoel_pesanan / penjual_kedai / kawasaan_operasional)
--               remain UNTOUCHED. They are unused by the app. To retire them,
--               migrate data into the canonical tables manually, then DROP.
-- CODE-vs-SCHEMA COLUMN MISMATCH (separate bug, see report): src/db.ts
--   commitOrderPayload INSERTs columns (customer_telegram_id, customer_name,
--   cart_items, jumlah_amaun, koordinat_penghantaran, rujukan_pesanan) that
--   DO NOT exist in this rekod_pesanan definition. Reconcile before relying
--   on order commit in production.
-- ============================================================

-- End: Fasa 18/19 - Consolidated Live Schema Drift Fix (Migration 004)