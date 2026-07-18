-- ============================================================
-- JomOrder Phase 34 - Automated Audit Trail Grid (Migration 009)
-- Fasal 7 Strategy 1 (RLS isolation) + Fasal 13 (DDL sync log)
-- Idempoten: SELAMAT dijalankan berulang kali.
-- ============================================================

-- Start: Phase 34 - audit_kupon_padam table
-- Jadual audit bagi rollback buffer pemadaman kupon (snapshot sebelum DELETE).
CREATE TABLE IF NOT EXISTS audit_kupon_padam (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    kod TEXT NOT NULL,
    merchant_telegram_id TEXT NOT NULL,
    snapshot_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    transaction_ref TEXT,
    dipadam_pada TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indeks untuk carian pantas mengikut merchant (pengasingan multi-tenant).
CREATE INDEX IF NOT EXISTS idx_audit_kupon_padam_mtid
    ON audit_kupon_padam (merchant_telegram_id);

CREATE INDEX IF NOT EXISTS idx_audit_kupon_padam_kod
    ON audit_kupon_padam (kod);

-- RLS diwajibkan untuk pengasingan multi-tenant.
ALTER TABLE audit_kupon_padam ENABLE ROW LEVEL SECURITY;

-- Policy: baca sendiri sahaja (merchant hanya nampak audit miliknya).
DROP POLICY IF EXISTS audit_kupon_padam_merchant_read ON audit_kupon_padam;
CREATE POLICY audit_kupon_padam_merchant_read
    ON audit_kupon_padam
    FOR SELECT
    USING (merchant_telegram_id = current_setting('request.jwt.claims', true)::json->>'sub');

-- Policy: service_role akses penuh (server-side write dari worker).
DROP POLICY IF EXISTS audit_kupon_padam_service_all ON audit_kupon_padam;
CREATE POLICY audit_kupon_padam_service_all
    ON audit_kupon_padam
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- End: Phase 34 - audit_kupon_padam table