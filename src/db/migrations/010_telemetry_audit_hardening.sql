-- ============================================================
-- JomOrder Phase 36 - Telemetry Audit Hardening Grid (Migration 010)
-- Fasal 7 Strategy 1 (RLS isolation) + Fasal 13 (DDL sync log)
-- Jadual: audit_telemetry_health (kesihatan sistem & drift telemetry)
-- Idempoten: SELAMAT dijalankan berulang kali.
-- ============================================================

-- Start: Phase 36 - audit_telemetry_health table
CREATE TABLE IF NOT EXISTS audit_telemetry_health (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    component TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'OK',
    latency_ms INTEGER NOT NULL DEFAULT 0,
    error_rate_pct NUMERIC(5,2) DEFAULT 0,
    drift_sustained BOOLEAN DEFAULT FALSE,
    merchant_telegram_id TEXT,
    detail_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indeks pengasingan multi-tenant + carian masa.
CREATE INDEX IF NOT EXISTS idx_audit_telemetry_health_mtid
    ON audit_telemetry_health (merchant_telegram_id);

CREATE INDEX IF NOT EXISTS idx_audit_telemetry_health_recorded
    ON audit_telemetry_health (recorded_at DESC);

-- RLS diwajibkan untuk pengasingan multi-tenant.
ALTER TABLE audit_telemetry_health ENABLE ROW LEVEL SECURITY;

-- Policy: service_role akses penuh (server-side write dari worker).
DROP POLICY IF EXISTS audit_telemetry_health_service_all ON audit_telemetry_health;
CREATE POLICY audit_telemetry_health_service_all
    ON audit_telemetry_health
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Policy: baca sendiri sahaja (merchant hanya nampak audit miliknya).
DROP POLICY IF EXISTS audit_telemetry_health_merchant_read ON audit_telemetry_health;
CREATE POLICY audit_telemetry_health_merchant_read
    ON audit_telemetry_health
    FOR SELECT
    USING (merchant_telegram_id = current_setting('request.jwt.claims', true)::json->>'sub');

-- End: Phase 36 - audit_telemetry_health table