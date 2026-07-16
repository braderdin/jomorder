-- ============================================================
-- JomOrder Modern-Siber :: DB Trigger Automation (Fasa 6 Sprint)
-- ============================================================
-- Fasal 13 (DDL Sync) + Fasal 7 Strategy 1 (RLS intact via trigger)
-- Tujuan: Auto-populate `tamat_langganan_pada` (default 30 hari)
--          setiap kali kedai baharu didaftarkan supaya grace-period
--          automation (scheduler HAMPIR_TAMAT) ada rujukan masa tepat.
-- Multi-tenant isolation kekal: trigger operates per-row, RLS untouched.
-- ============================================================

-- Start: Fasa 6 - Default Subscription Expiry Trigger
-- Trigger ini di-FIRE sebelum INSERT ke senarai_kedai.
-- Jika tamat_langganan_pada NULL, isi = NOW() + INTERVAL '30 days' (RM29/bulan cycle).
CREATE OR REPLACE FUNCTION set_default_tamat_langganan()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Hanya isi jika merchant tak letak tarikh sendiri (manual override friendly)
  IF NEW.tamat_langganan_pada IS NULL THEN
    NEW.tamat_langganan_pada := NOW() + INTERVAL '30 days';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_default_tamat_langganan ON senarai_kedai;

CREATE TRIGGER trg_set_default_tamat_langganan
  BEFORE INSERT ON senarai_kedai
  FOR EACH ROW
  EXECUTE FUNCTION set_default_tamat_langganan();
-- End: Fasa 6 - Default Subscription Expiry Trigger

-- ============================================================
-- NOTE LIVE APPLY (Fasal 13 reminder untuk Chip Besar):
-- 1. Buka Supabase SQL Editor.
-- 2. Paste keseluruhan fail ini.
-- 3. RUN. Trigger aktif serta-merta untuk INSERT baharu.
-- 4. Rekod sedia ada tak disentuh (backfill perlu ALTER manual jika mahu).
-- ============================================================