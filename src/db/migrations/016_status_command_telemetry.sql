-- ============================================================
-- JomOrder Phase 44 - /status Command Log Table
-- ============================================================
-- Fasal 7 Strategy 1: RLS diwajibkan (multi-tenant isolation).
-- Fasal 11: IPv4 Pooling Mandate - execute via pgbouncer=false.
-- Tujuan: Track setiap /status hit untuk diagnostics + health audit.
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

-- RLS: Hanya service_role boleh akses penuh (worker guna SERVICE_ROLE_KEY).
ALTER TABLE status_command_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS status_command_log_service_all ON status_command_log;
CREATE POLICY status_command_log_service_all
    ON status_command_log
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Index untuk query pantas (audit per user).
CREATE INDEX IF NOT EXISTS idx_status_log_tg
    ON status_command_log (tg_id, created_at DESC);

-- End: Phase 44 - /status Command Log Table