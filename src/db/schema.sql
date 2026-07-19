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

-- Start: Fasa 4 - Tambah merchant_telegram_id (onboarding Telegram lookup)
ALTER TABLE senarai_kedai
    ADD COLUMN IF NOT EXISTS merchant_telegram_id TEXT UNIQUE;
-- End: Fasa 4

-- Start: Fasa 5 - Tambah tamat_langganan_pada (subscription expiry timestamp)
-- Fasal 13: DDL sync log. Rekod masa tepat langganan tamat untuk grace-period.
ALTER TABLE senarai_kedai
    ADD COLUMN IF NOT EXISTS tamat_langganan_pada TIMESTAMPTZ;
-- End: Fasa 5

CREATE INDEX IF NOT EXISTS idx_senarai_kedai_geo
    ON senarai_kedai (latitude_kedai, longitude_kedai);

CREATE INDEX IF NOT EXISTS idx_senarai_kedai_tgid
    ON senarai_kedai (merchant_telegram_id);

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

-- Start: Phase 51 - Menu item photo column (Fasal 8 storage wiring)
ALTER TABLE menu_makanan
    ADD COLUMN IF NOT EXISTS gambar_url TEXT;
-- End: Phase 51 - Menu item photo column

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

-- ============================================================
-- Jadual 15: command_telemetry (Phase 42 - Command Audit Log)
-- ============================================================
CREATE TABLE IF NOT EXISTS command_telemetry (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    merchant_telegram_id BIGINT,
    command TEXT NOT NULL,
    chat_id BIGINT,
    status TEXT DEFAULT 'OK',
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE command_telemetry ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS command_telemetry_service_all ON command_telemetry;
CREATE POLICY command_telemetry_service_all
    ON command_telemetry
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_command_telemetry_cmd
    ON command_telemetry (command, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_command_telemetry_merchant
    ON command_telemetry (merchant_telegram_id, created_at DESC);
-- End: Phase 42 - command_telemetry DDL

-- ============================================================
-- Jadual 16: status_command_log (Phase 44 - /status Audit Log)
-- ============================================================
CREATE TABLE IF NOT EXISTS status_command_log (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tg_id BIGINT,
    chat_id BIGINT,
    role TEXT,
    db_status TEXT DEFAULT 'OK',
    redis_status TEXT DEFAULT 'OK',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE status_command_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS status_command_log_service_all ON status_command_log;
CREATE POLICY status_command_log_service_all
    ON status_command_log
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_status_log_tg
    ON status_command_log (tg_id, created_at DESC);
-- End: Phase 44 - status_command_log DDL

-- ============================================================
-- Jadual 17: kempen_diskaun (Phase 2 - Campaign Discount Engine)
-- ============================================================
CREATE TABLE IF NOT EXISTS kempen_diskaun (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    kedai_id UUID REFERENCES senarai_kedai(id) ON DELETE CASCADE,
    kod_kupon TEXT NOT NULL,
    jenis_diskaun TEXT NOT NULL DEFAULT 'PERATUS',
    nilai_diskaun NUMERIC(10,2) NOT NULL DEFAULT 0,
    had_penggunaan INTEGER DEFAULT 0,
    digunakan INTEGER DEFAULT 0,
    tarikh_mula TIMESTAMPTZ DEFAULT NOW(),
    tarikh_tamat TIMESTAMPTZ,
    status_aktif BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE kempen_diskaun ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kempen_diskaun_service_all ON kempen_diskaun;
CREATE POLICY kempen_diskaun_service_all
    ON kempen_diskaun
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS kempen_diskaun_merchant_read ON kempen_diskaun;
CREATE POLICY kempen_diskaun_merchant_read
    ON kempen_diskaun
    FOR SELECT
    USING (true);
-- End: Phase 2 - kempen_diskaun DDL

-- ============================================================
-- Jadual 18: webhook_error_logs (Phase 13 - Webhook Error Telemetry)
-- ============================================================
CREATE TABLE IF NOT EXISTS webhook_error_logs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tg_id BIGINT,
    chat_id BIGINT,
    endpoint TEXT,
    error_message TEXT,
    stack_trace TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE webhook_error_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS webhook_error_logs_service_all ON webhook_error_logs;
CREATE POLICY webhook_error_logs_service_all
    ON webhook_error_logs
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Start: Phase 53 - Indexes from migration 017/018 (sync master)
CREATE INDEX IF NOT EXISTS idx_kempen_kedai_aktif
    ON kempen_diskaun (kedai_id, status_aktif);
CREATE INDEX IF NOT EXISTS idx_kempen_kod
    ON kempen_diskaun (kod_kupon);
CREATE INDEX IF NOT EXISTS idx_menu_gambar
     ON menu_makanan (kedai_id) WHERE gambar_url IS NOT NULL;
-- End: Phase 53 - Indexes from migration 017/018

-- Start: Phase 56 - Safe Consolidated DDL Reference
-- FAIL 023_final_safe_consolidated.sql ialah master idempoten yang menggabung
-- semua DDL selamat (001+004+005+017+021+rls_policies) TANPA schema_migrations
-- INSERT dan TANPA auth.uid()::text::bigint cast (RLS TEXT fix). Jalankan 023 di
-- Supabase SQL Editor sebagai ganti manual 022. Idempoten - selamat berulang.
-- End: Phase 56 - Safe Consolidated DDL Reference
