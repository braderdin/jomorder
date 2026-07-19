-- ============================================================
-- Migration 019: Command Registry Sync + Schema Drift Repair (Phase 53)
-- Fasal 13: DDL sync log. Idempotent, safe to re-run.
-- Target: aws-0-ap-southeast-1.pooler.supabase.com:5432?pgbouncer=false
-- ============================================================

-- Start: Phase 53 - kempen_diskaun (campaign discount engine)
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
    ON kempen_diskaun FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS kempen_diskaun_merchant_read ON kempen_diskaun;
CREATE POLICY kempen_diskaun_merchant_read
    ON kempen_diskaun FOR SELECT USING (true);
-- End: Phase 53 - kempen_diskaun

-- Start: Phase 53 - webhook_error_logs (webhook error telemetry)
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
    ON webhook_error_logs FOR ALL TO service_role USING (true) WITH CHECK (true);
-- End: Phase 53 - webhook_error_logs

-- Start: Phase 53 - menu_makanan.gambar_url (Fasal 8 photo column)
ALTER TABLE menu_makanan ADD COLUMN IF NOT EXISTS gambar_url TEXT;
-- End: Phase 53 - menu_makanan.gambar_url

-- Start: Phase 53 - Performance indexes (017 + 018 sync)
CREATE INDEX IF NOT EXISTS idx_kempen_kedai_aktif
    ON kempen_diskaun (kedai_id, status_aktif);
CREATE INDEX IF NOT EXISTS idx_kempen_kod
    ON kempen_diskaun (kod_kupon);
CREATE INDEX IF NOT EXISTS idx_menu_gambar
    ON menu_makanan (kedai_id) WHERE gambar_url IS NOT NULL;
-- End: Phase 53 - Performance indexes

-- Start: Phase 53 - command_registry_sync marker
-- Rekod bahawa 30-command matrix diselaraskan (Fasal 4 SOA single source).
-- Tiada jadual baharu; ini sekadar audit trail supaya drift dapat dikesan.
INSERT INTO command_telemetry (merchant_telegram_id, command, status)
SELECT NULL, 'phase53_schema_sync', 'OK'
WHERE NOT EXISTS (
    SELECT 1 FROM command_telemetry
    WHERE command = 'phase53_schema_sync'
);
-- End: Phase 53 - command_registry_sync marker