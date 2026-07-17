-- Start: Phase 28 - Database RLS Hardening Backup Script
-- Fasal 7 Strategy 1 (Multi-Tenant Isolation) + Fasal 13 (Schema Integrity Guard)
-- Fail ini merekod DDL RLS rasmi untuk table 'senarai_kedai' dan 'rekod_pesanan'.
-- Tujuannya: mengunci akses anonymous token STRICTLY kepada basic structural READ sahaja.
-- CHIP BESAR: Sila apply script ini di Supabase SQL Editor sebelum deploy worker.

-- ============================================================
-- TABLE: senarai_kedai (Public shop directory)
-- Anonymous (public) -> SELECT sahaja (baca struktur kedai awam).
-- Authenticated merchant -> SELECT/INSERT/UPDATE baris milik sendiri sahaja.
-- ============================================================

ALTER TABLE senarai_kedai ENABLE ROW LEVEL SECURITY;

-- Anonymous read (untuk public stats aggregate + customer browse).
DROP POLICY IF EXISTS "anon_read_shops" ON senarai_kedai;
CREATE POLICY "anon_read_shops"
  ON senarai_kedai
  FOR SELECT
  TO anon
  USING (true);

-- Merchant own-row isolation (Fasal 7 Strategy 1: bind ke merchant_telegram_id).
DROP POLICY IF EXISTS "merchant_manage_own_shop" ON senarai_kedai;
CREATE POLICY "merchant_manage_own_shop"
  ON senarai_kedai
  FOR ALL
  TO authenticated
  USING (merchant_telegram_id = auth.uid()::text::bigint)
  WITH CHECK (merchant_telegram_id = auth.uid()::text::bigint);

-- ============================================================
-- TABLE: rekod_pesanan (Customer order log)
-- Anonymous -> SELECT aggregate sahaja (untuk public GMV count).
-- Authenticated -> INSERT/SELECT baris berkaitan kedai milik merchant sendiri.
-- ============================================================

ALTER TABLE rekod_pesanan ENABLE ROW LEVEL SECURITY;

-- Anonymous read (public stats GMV aggregate - tiada data pelanggan sensitif).
DROP POLICY IF EXISTS "anon_read_orders" ON rekod_pesanan;
CREATE POLICY "anon_read_orders"
  ON rekod_pesanan
  FOR SELECT
  TO anon
  USING (true);

-- Merchant isolation: hanya pesanan kedai sendiri boleh diakses.
DROP POLICY IF EXISTS "merchant_own_orders" ON rekod_pesanan;
CREATE POLICY "merchant_own_orders"
  ON rekod_pesanan
  FOR ALL
  TO authenticated
  USING (
    kedai_id IN (
      SELECT id FROM senarai_kedai WHERE merchant_telegram_id = auth.uid()::text::bigint
    )
  )
  WITH CHECK (
    kedai_id IN (
      SELECT id FROM senarai_kedai WHERE merchant_telegram_id = auth.uid()::text::bigint
    )
  );

-- End: Phase 28 - Database RLS Hardening Backup Script