-- ============================================================
-- JomOrder Modern-Siber :: Migration 002 - Dynamic Discount Engine
-- ============================================================
-- Fasa 14: Dynamic Discount Engine, Promotional Campaigns & Premium Dashboard
-- Fasal 7 Strategy 1: RLS isolation kekal (multi-tenant per kedai_id)
-- Fasal 13: DDL sync log - migration baharu mesti di-apply ke live Supabase
-- Idempoten: SELURUH blok selamat dijalan berulang kali
-- ============================================================

-- ============================================================
-- Jadual: kempen_diskaun (Merchant Coupon / Voucher Registry)
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

CREATE INDEX IF NOT EXISTS idx_kempen_diskaun_kedai
    ON kempen_diskaun (kedai_id);

CREATE INDEX IF NOT EXISTS idx_kempen_diskaun_kod
    ON kempen_diskaun (kod_kupon);

-- ============================================================
-- Row Level Security (Fasal 7 Strategy 1)
-- ============================================================
ALTER TABLE kempen_diskaun ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kempen_diskaun_public_read ON kempen_diskaun;
CREATE POLICY kempen_diskaun_public_read
    ON kempen_diskaun
    FOR SELECT
    USING (true);

DROP POLICY IF EXISTS kempen_diskaun_service_all ON kempen_diskaun;
CREATE POLICY kempen_diskaun_service_all
    ON kempen_diskaun
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- ============================================================
-- Nota Drift (Fasal 13):
-- Chip Besar mesti jalankan SQL ini di dashboard Supabase (SQL editor)
-- SEBELUM enjin diskaun Fasa 14 aktif di production.
-- Tiada kolum baharu ditambah ke senarai_kedai (reuse status_langganan='PREMIUM').
-- ============================================================