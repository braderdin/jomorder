-- Start: Phase 39 - Webhook Error Telemetry DDL (Fasal 7 Strategy 1 RLS + Fasal 4 SOA)
-- Jadual webhook_error_logs untuk rekod telemetry error pipeline webhook.
-- Idempoten: selamat dijalankan berulang kali tanpa crash (IF NOT EXISTS).
-- RLS dikuatkuasakan: setiap baris diikat merchant_telegram_id untuk isolasi.

-- 1. Cipta jadual jika belum wujud.
CREATE TABLE IF NOT EXISTS public.webhook_error_logs (
  id BIGSERIAL PRIMARY KEY,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  update_id BIGINT,
  stage TEXT NOT NULL,
  bytes INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  raw_head TEXT,
  merchant_telegram_id TEXT,
  resolved BOOLEAN NOT NULL DEFAULT false
);

-- 2. Index untuk query pantas ikut merchant + masa.
CREATE INDEX IF NOT EXISTS idx_webhook_err_merchant_time
  ON public.webhook_error_logs (merchant_telegram_id, captured_at DESC);

-- 3. Enable RLS.
ALTER TABLE public.webhook_error_logs ENABLE ROW LEVEL SECURITY;

-- 4. Drop policy lama jika wujud (idempoten) kemudian cipta baru.
DROP POLICY IF EXISTS webhook_err_isolation ON public.webhook_error_logs;

-- Service role (server-side worker) boleh INSERT/SELECT semua (RLS bypass).
CREATE POLICY webhook_err_isolation ON public.webhook_error_logs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Anon/public langsung DENY (tiada akses tanpa service_role).
DROP POLICY IF EXISTS webhook_err_deny_anon ON public.webhook_error_logs;
CREATE POLICY webhook_err_deny_anon ON public.webhook_error_logs
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

-- 5. Grant kepada peranan yang diperlukan.
GRANT INSERT, SELECT, UPDATE ON public.webhook_error_logs TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.webhook_error_logs_id_seq TO service_role;

-- End: Phase 39 - Webhook Error Telemetry DDL