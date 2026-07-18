-- ============================================================
-- JomOrder Phase 42 - Command Telemetry Audit Table
-- ============================================================
-- Fasal 7 Strategy 1: RLS diwajibkan (multi-tenant isolation).
-- Fasal 11: IPv4 Pooling Mandate - execute via pgbouncer=false.
-- Tujuan: Track setiap 22-command hit untuk analytics + debugging.
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

-- RLS: Hanya service_role boleh akses penuh (worker guna SERVICE_ROLE_KEY).
ALTER TABLE command_telemetry ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS command_telemetry_service_all ON command_telemetry;
CREATE POLICY command_telemetry_service_all
    ON command_telemetry
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Index untuk query pantas (analytics per command).
CREATE INDEX IF NOT EXISTS idx_command_telemetry_cmd
    ON command_telemetry (command, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_command_telemetry_merchant
    ON command_telemetry (merchant_telegram_id, created_at DESC);

-- End: Phase 42 - Command Telemetry Audit Table