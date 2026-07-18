-- Start: Phase 37 - Conformance Migration 011 (22-Command Routing Matrix)
-- Idempoten: selamat dijalankan berulang kali tanpa ralat.
-- Skop: logging arkib kemas kini pesanan + RLS trigger multi-tenant.
-- IPv4 Pooling Mandate (Fasal 11): apply pada pooler ?pgbouncer=false.
-- End: Phase 37 - Conformance Header

-- ---------------------------------------------------------------------------
-- 1. Jadual log arkib kemas kini pesanan (audit trail 22-command matrix)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS order_update_log (
  id BIGSERIAL PRIMARY KEY,
  rekod_pesanan_id BIGINT NOT NULL,
  kedai_id TEXT NOT NULL,
  merchant_telegram_id TEXT NOT NULL,
  status_lama TEXT,
  status_baharu TEXT,
  tindakan TEXT NOT NULL DEFAULT 'UNKNOWN',
  dicipta_pada TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index selaras untuk query arkib pantas (free-tier friendly).
CREATE INDEX IF NOT EXISTS idx_order_update_log_kedai
  ON order_update_log (kedai_id, dicipta_pada DESC);
CREATE INDEX IF NOT EXISTS idx_order_update_log_merchant
  ON order_update_log (merchant_telegram_id, dicipta_pada DESC);

-- ---------------------------------------------------------------------------
-- 2. Fungsi trigger: catat setiap PATCH status ke order_update_log
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION log_order_update()
RETURNS TRIGGER AS $$
DECLARE
  v_merchant TEXT;
BEGIN
  -- Dapatkan merchant_telegram_id ikat kedai_id (Fasal 7 Strategy 1 RLS bind).
  SELECT merchant_telegram_id INTO v_merchant
  FROM senarai_kedai
  WHERE id = NEW.kedai_id
  LIMIT 1;

  INSERT INTO order_update_log (
    rekod_pesanan_id,
    kedai_id,
    merchant_telegram_id,
    status_lama,
    status_baharu,
    tindakan
  ) VALUES (
    NEW.id,
    NEW.kedai_id,
    COALESCE(v_merchant, '0'),
    OLD.status_penghantaran,
    NEW.status_penghantaran,
    CASE
      WHEN TG_OP = 'UPDATE' THEN 'ORDER_STATE_TRANSITION'
      ELSE TG_OP
    END
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ---------------------------------------------------------------------------
-- 3. Trigger pada rekod_pesanan (patch status -> log)
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_log_order_update ON rekod_pesanan;
CREATE TRIGGER trg_log_order_update
  AFTER UPDATE ON rekod_pesanan
  FOR EACH ROW
  WHEN (OLD.status_penghantaran IS DISTINCT FROM NEW.status_penghantaran)
  EXECUTE FUNCTION log_order_update();

-- ---------------------------------------------------------------------------
-- 4. Enable RLS + policy pengasingan multi-tenant ke order_update_log
-- ---------------------------------------------------------------------------
ALTER TABLE order_update_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_order_update_log_merchant_isolation
  ON order_update_log;
CREATE POLICY p_order_update_log_merchant_isolation
  ON order_update_log
  FOR ALL
  USING (merchant_telegram_id = current_setting('request.jwt.claims.merchant_telegram_id', true)::TEXT)
  WITH CHECK (merchant_telegram_id = current_setting('request.jwt.claims.merchant_telegram_id', true)::TEXT);

-- ---------------------------------------------------------------------------
-- 5. Keistimewaan service_role (worker cron + admin broadcast)
-- ---------------------------------------------------------------------------
GRANT ALL ON order_update_log TO service_role;
GRANT USAGE, SELECT ON SEQUENCE order_update_log_id_seq TO service_role;

-- ---------------------------------------------------------------------------
-- 6. Confirm table registered for 22-command conformance matrix
-- ---------------------------------------------------------------------------
COMMENT ON TABLE order_update_log IS
  'Phase 37: Arkib audit kemas kini pesanan untuk 22-command routing matrix (Fasal 7 Strategy 1 RLS).';

-- End: Phase 37 - Conformance Migration 011