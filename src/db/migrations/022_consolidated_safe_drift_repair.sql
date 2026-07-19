-- Start: Phase 55 - Consolidated Safe Drift Repair (master idempotent)
-- Fasal 13 (DDL Sync) + Fasal 7 S1 (RLS) + Fasal 11 (IPv4 pooler ?pgbouncer=false).
-- Gabungkan DDL selamat dari 001 + 004 + 005 + 017 + 021 TANPA:
--   * INSERT ke schema_migrations (jadual tidak wujud -> ERROR).
--   * RLS WITH CHECK rujuk OLD (ERROR 42P01).
--   * CHECK constraint jenis_diskaun 'PERCENT'/'AMOUNT' (drift vs 019/020 'PERATUS'/'TANAH').
-- SELAMAT di-run berulang (IF NOT EXISTS / DO $$ guard).
-- End: Phase 55 - header

-- ============================================================
-- 1. CORE TABLES (idempoten, serap 004 canonical)
-- ============================================================
CREATE TABLE IF NOT EXISTS kawasan_operasi (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nama_kawasan TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE kawasan_operasi ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kawasan_operasi_public_read ON kawasan_operasi;
CREATE POLICY kawasan_operasi_public_read ON kawasan_operasi FOR SELECT USING (true);
DROP POLICY IF EXISTS kawasan_operasi_service_all ON kawasan_operasi;
CREATE POLICY kawasan_operasi_service_all ON kawasan_operasi FOR ALL TO service_role USING (true) WITH CHECK (true);

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
ALTER TABLE senarai_kedai ADD COLUMN IF NOT EXISTS merchant_telegram_id TEXT UNIQUE;
ALTER TABLE senarai_kedai ADD COLUMN IF NOT EXISTS tamat_langganan_pada TIMESTAMPTZ;
ALTER TABLE senarai_kedai ADD COLUMN IF NOT EXISTS radius_operasi_km NUMERIC DEFAULT 10;

CREATE INDEX IF NOT EXISTS idx_senarai_kedai_geo ON senarai_kedai (latitude_kedai, longitude_kedai);
CREATE INDEX IF NOT EXISTS idx_senarai_kedai_tgid ON senarai_kedai (merchant_telegram_id);
ALTER TABLE senarai_kedai ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS senarai_kedai_public_read ON senarai_kedai;
CREATE POLICY senarai_kedai_public_read ON senarai_kedai FOR SELECT USING (true);
DROP POLICY IF EXISTS senarai_kedai_service_all ON senarai_kedai;
CREATE POLICY senarai_kedai_service_all ON senarai_kedai FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS menu_makanan (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kedai_id UUID REFERENCES senarai_kedai(id) ON DELETE CASCADE,
  nama_hidangan TEXT NOT NULL,
  harga NUMERIC(10,2) NOT NULL,
  status_tersedia BOOLEAN DEFAULT true,
  gambar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE menu_makanan ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS menu_makanan_public_read ON menu_makanan;
CREATE POLICY menu_makanan_public_read ON menu_makanan FOR SELECT USING (true);
DROP POLICY IF EXISTS menu_makanan_service_all ON menu_makanan;
CREATE POLICY menu_makanan_service_all ON menu_makanan FOR ALL TO service_role USING (true) WITH CHECK (true);

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
CREATE POLICY rekod_pesanan_public_read ON rekod_pesanan FOR SELECT USING (true);
DROP POLICY IF EXISTS rekod_pesanan_service_all ON rekod_pesanan;
CREATE POLICY rekod_pesanan_service_all ON rekod_pesanan FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- 2. kempen_diskaun (coupon registry) - CHECK seragam PERATUS/TANAH
-- ============================================================
CREATE TABLE IF NOT EXISTS kempen_diskaun (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kedai_id UUID REFERENCES senarai_kedai(id) ON DELETE CASCADE,
  kod_kupon TEXT UNIQUE NOT NULL,
  jenis_diskaun TEXT NOT NULL CHECK (jenis_diskaun IN ('PERATUS', 'TANAH')),
  nilai_diskaun NUMERIC(10,2) NOT NULL CHECK (nilai_diskaun >= 0),
  status_aktif BOOLEAN DEFAULT true,
  tamat_pada TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_kempen_diskaun_kedai ON kempen_diskaun (kedai_id);
CREATE INDEX IF NOT EXISTS idx_kempen_diskaun_kod ON kempen_diskaun (kod_kupon);
CREATE INDEX IF NOT EXISTS idx_kempen_diskaun_sweep ON kempen_diskaun (status_aktif, tamat_pada);
CREATE INDEX IF NOT EXISTS idx_kempen_diskaun_kod_kedai ON kempen_diskaun (kedai_id, kod_kupon);
ALTER TABLE kempen_diskaun ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kempen_diskaun_public_read ON kempen_diskaun;
CREATE POLICY kempen_diskaun_public_read ON kempen_diskaun FOR SELECT USING (true);
DROP POLICY IF EXISTS kempen_diskaun_service_all ON kempen_diskaun;
CREATE POLICY kempen_diskaun_service_all ON kempen_diskaun FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- 3. audit_kupon_padam (drift repair 020)
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_kupon_padam (
  id BIGSERIAL PRIMARY KEY,
  kod TEXT NOT NULL,
  merchant_telegram_id TEXT,
  snapshot_json JSONB,
  transaction_ref TEXT,
  dipadam_pada TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE audit_kupon_padam ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_all ON audit_kupon_padam;
CREATE POLICY service_all ON audit_kupon_padam FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_audit_kupon_padam_merchant ON audit_kupon_padam (merchant_telegram_id);

-- ============================================================
-- 4. RLS owner-update guard (NO OLD/NEW conflict, FIXED)
-- ============================================================
ALTER TABLE senarai_kedai ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS senarai_kedai_owner_update ON senarai_kedai;
CREATE POLICY senarai_kedai_owner_update
  ON senarai_kedai FOR UPDATE TO anon, authenticated
  USING (merchant_telegram_id = current_setting('app.merchant_tgid', true))
  WITH CHECK (merchant_telegram_id = current_setting('app.merchant_tgid', true));

-- ============================================================
-- 5. Premium CHECK constraint (idempoten)
-- ============================================================
ALTER TABLE senarai_kedai DROP CONSTRAINT IF EXISTS chk_status_langganan;
ALTER TABLE senarai_kedai
  ADD CONSTRAINT chk_status_langganan
  CHECK (status_langganan IN ('AKTIF', 'HAMPIR_TAMAT', 'TAMAT', 'PREMIUM'));

-- ============================================================
-- 6. Haversine function + triggers + analytics (idempoten)
-- ============================================================
CREATE OR REPLACE FUNCTION ambil_kedai_berhampiran(
  pelanggan_lat numeric, pelanggan_long numeric, radius_km numeric DEFAULT 10
) RETURNS TABLE (
  id uuid, nama_kedai text, latitude_kedai numeric, longitude_kedai numeric, jarak_km numeric
) AS $$
BEGIN
  RETURN QUERY
  SELECT q.q_id, q.q_nama, q.q_lat, q.q_long, q.q_jarak
  FROM (
    SELECT s.id AS q_id, s.nama_kedai AS q_nama, s.latitude_kedai AS q_lat,
      s.longitude_kedai AS q_long,
      (2 * 6371 * asin(sqrt(
        power(sin(radians(s.latitude_kedai - pelanggan_lat) / 2), 2)
        + cos(radians(pelanggan_lat)) * cos(radians(s.latitude_kedai))
          * power(sin(radians(s.longitude_kedai - pelanggan_long) / 2), 2)
      ))::numeric) AS q_jarak
    FROM senarai_kedai s
    WHERE s.status_kedai = 'DILULUSKAN' AND s.status_langganan = 'AKTIF'
      AND s.latitude_kedai IS NOT NULL AND s.longitude_kedai IS NOT NULL
  ) q
  WHERE q.q_jarak <= radius_km
  ORDER BY q.q_jarak ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION set_default_tamat_langganan()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.tamat_langganan_pada IS NULL THEN
    NEW.tamat_langganan_pada := NOW() + INTERVAL '30 days';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_set_default_tamat_langganan ON senarai_kedai;
CREATE TRIGGER trg_set_default_tamat_langganan
  BEFORE INSERT ON senarai_kedai FOR EACH ROW EXECUTE FUNCTION set_default_tamat_langganan();

DROP VIEW IF EXISTS public.v_saas_metrics;
CREATE VIEW public.v_saas_metrics AS
SELECT
  (SELECT COUNT(*) FROM senarai_kedai WHERE status_kedai = 'DILULUSKAN' AND status_langganan = 'AKTIF') AS total_active_merchants,
  (SELECT COUNT(*) FROM senarai_kedai WHERE status_langganan = 'PREMIUM') AS total_premium_stores,
  (SELECT COALESCE(SUM(jumlah_harga), 0) FROM rekod_pesanan WHERE status_pembayaran = 'TELAH_BAYAR') AS total_revenue_rm,
  (SELECT COUNT(*) FROM rekod_pesanan) AS total_orders,
  (SELECT COUNT(*) * 29 FROM senarai_kedai WHERE status_kedai = 'DILULUSKAN' AND status_langganan = 'AKTIF') AS mrr_projection_rm;

CREATE OR REPLACE FUNCTION public.get_saas_metrics()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_active INT; v_premium INT; v_revenue NUMERIC; v_orders INT; v_mrr NUMERIC;
BEGIN
  SELECT total_active_merchants, total_premium_stores, total_revenue_rm, total_orders, mrr_projection_rm
  INTO v_active, v_premium, v_revenue, v_orders, v_mrr FROM public.v_saas_metrics;
  RETURN jsonb_build_object('total_active_merchants', v_active, 'total_premium_stores', v_premium,
    'total_revenue_rm', v_revenue, 'total_orders', v_orders, 'mrr_projection_rm', v_mrr);
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_saas_metrics() TO service_role;
GRANT SELECT ON public.v_saas_metrics TO service_role;

-- ============================================================
-- 7. Invoice tracker indexes (serap 005, TANPA schema_migrations)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_rekod_pesanan_created_at ON rekod_pesanan (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rekod_pesanan_kedai_created ON rekod_pesanan (kedai_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rekod_pesanan_status_bayar ON rekod_pesanan (status_pembayaran) WHERE status_pembayaran = 'UNPAID';

-- ============================================================
-- 8. Seed kawasan operasi
-- ============================================================
INSERT INTO kawasan_operasi (nama_kawasan) VALUES
  ('Kuala Lumpur'), ('Puncak Alam'), ('Petaling Jaya'), ('Shah Alam'), ('Klang')
ON CONFLICT (nama_kawasan) DO NOTHING;

-- End: Phase 55 - Consolidated Safe Drift Repair