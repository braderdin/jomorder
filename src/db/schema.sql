-- ============================================================
-- JomOrder Modern-Siber :: Master DDL Schema (Local Migration Scalpel)
-- ============================================================
-- Strategy 1: RLS diwajibkan untuk semua jadual (multi-tenant isolation)
-- Fasal 12: Sequential Task Isolation (satu jadual pada satu masa)
-- ============================================================

-- ============================================================
-- Jadual 1: kawasan_operasi
-- ============================================================
CREATE TABLE IF NOT EXISTS kawasan_operasi (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nama_kawasan TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE kawasan_operasi ENABLE ROW LEVEL SECURITY;

-- Placeholder policies: public read (SELECT) + service_role full access
DROP POLICY IF EXISTS kawasan_operasi_public_read ON kawasan_operasi;
CREATE POLICY kawasan_operasi_public_read
    ON kawasan_operasi
    FOR SELECT
    USING (true);

DROP POLICY IF EXISTS kawasan_operasi_service_all ON kawasan_operasi;
CREATE POLICY kawasan_operasi_service_all
    ON kawasan_operasi
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- ============================================================
-- Jadual 2: senarai_kedai (Merchant Registry)
-- ============================================================
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

CREATE INDEX IF NOT EXISTS idx_senarai_kedai_geo
    ON senarai_kedai (latitude_kedai, longitude_kedai);

ALTER TABLE senarai_kedai ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS senarai_kedai_public_read ON senarai_kedai;
CREATE POLICY senarai_kedai_public_read
    ON senarai_kedai
    FOR SELECT
    USING (true);

DROP POLICY IF EXISTS senarai_kedai_service_all ON senarai_kedai;
CREATE POLICY senarai_kedai_service_all
    ON senarai_kedai
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- ============================================================
-- Jadual 3: menu_makanan
-- ============================================================
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
    ON menu_makanan
    FOR SELECT
    USING (true);

DROP POLICY IF EXISTS menu_makanan_service_all ON menu_makanan;
CREATE POLICY menu_makanan_service_all
    ON menu_makanan
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- ============================================================
-- Jadual 4: rekod_pesanan
-- ============================================================
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
    ON rekod_pesanan
    FOR SELECT
    USING (true);

DROP POLICY IF EXISTS rekod_pesanan_service_all ON rekod_pesanan;
CREATE POLICY rekod_pesanan_service_all
    ON rekod_pesanan
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
