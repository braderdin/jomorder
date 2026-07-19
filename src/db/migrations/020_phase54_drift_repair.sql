-- Start: Phase 54 - Drift Repair DDL (idempotent)
-- Fasal 13 (DDL sync) + Fasal 7 S1 (RLS).
-- Baiki drift: audit_kupon_padam dirujuk tapi tiada jadual;
-- tambah CHECK constraint jenis_diskaun selari enjin diskaun (PERATUS/TANAH).
-- SELAMAT di-run berulang (IF NOT EXISTS / IF NOT EXISTS constraint).

-- 1. Jadual audit pemadaman kupon (rollback buffer untuk /padam_kupon).
CREATE TABLE IF NOT EXISTS audit_kupon_padam (
  id BIGSERIAL PRIMARY KEY,
  kod TEXT NOT NULL,
  merchant_telegram_id TEXT,
  snapshot_json JSONB,
  transaction_ref TEXT,
  dipadam_pada TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Enable RLS (Fasal 7 S1) - service_role bypass untuk backend.
ALTER TABLE audit_kupon_padam ENABLE ROW LEVEL SECURITY;

-- 3. Policy service_all (backend guna service_role key).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'audit_kupon_padam'
      AND policyname = 'service_all'
  ) THEN
    CREATE POLICY service_all ON audit_kupon_padam
      FOR ALL TO service_role
      USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 4. Index untuk carian pantas ikut merchant.
CREATE INDEX IF NOT EXISTS idx_audit_kupon_padam_merchant
  ON audit_kupon_padam (merchant_telegram_id);

-- 5. CHECK constraint jenis_diskaun (selari discounts.ts + DDL 019).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'kempen_diskaun'
      AND column_name = 'jenis_diskaun'
      AND constraint_name = 'chk_jenis_diskaun'
  ) THEN
    ALTER TABLE kempen_diskaun
      ADD CONSTRAINT chk_jenis_diskaun
      CHECK (jenis_diskaun IN ('PERATUS', 'TANAH'));
  END IF;
END $$;

-- End: Phase 54 - Drift Repair DDL