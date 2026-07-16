-- ============================================================
-- File 1: 001_security_hardening.sql
-- Fasa 8 / Fasal 7 (Strategy 1: Multi-Tenant RLS Isolation)
-- Tujuan: Block unauthorized PUBLIC mutations of approval /
--         subscription state columns pada jadual senarai_kedai.
-- Nota: Service role (worker backend) BYPASS RLS sepenuhnya,
--       jadi aliran kelulusan admin (File 3/4) kekal berfungsi.
-- ============================================================

-- Pastikan RLS aktif (idempoten).
ALTER TABLE senarai_kedai ENABLE ROW LEVEL SECURITY;

-- Defensive: ikat semula policy privileged secara eksklusif kepada
-- service_role supaya tiada drift yang membuka akses ke peranan awam.
DROP POLICY IF EXISTS senarai_kedai_service_all ON senarai_kedai;
CREATE POLICY senarai_kedai_service_all
    ON senarai_kedai
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Start: Fasa 8 - Guard status columns (status_kedai, status_langganan)
-- Public (anon/authenticated) HANYA boleh kemas kini profil sendiri
-- apabila worker menetapkan session var 'app.merchant_tgid'.
-- Mereka DILARANG menukar status_kedai atau status_langganan secara
-- langsung (WITH CHECK memaksa nilai kekal sama seperti OLD).
DROP POLICY IF EXISTS senarai_kedai_owner_update ON senarai_kedai;
CREATE POLICY senarai_kedai_owner_update
    ON senarai_kedai
    FOR UPDATE
    TO anon, authenticated
    USING (
        merchant_telegram_id = current_setting('app.merchant_tgid', true)
    )
    WITH CHECK (
        merchant_telegram_id = current_setting('app.merchant_tgid', true)
        AND NEW.status_kedai = OLD.status_kedai
        AND NEW.status_langganan = OLD.status_langganan
    );
-- End: Fasa 8 - Guard status columns