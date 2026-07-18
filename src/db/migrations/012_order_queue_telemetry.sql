-- Start: Phase 38 - Order Queue Telemetry Indexes & RLS Hardening (Migration 012)
-- Idempoten: semua DROP/INDEX guna IF NOT EXISTS / DROP ... IF EXISTS.
-- Sasaran: pecutan read matrix untuk queue status + RLS multi-tenant isolation.
-- Fasal 7 Strategy 1 (RLS) + Fasal 4 (SOA separation of concerns).

-- 1. Index untuk lajukan query queue aktif (status_penghantaran + kedai_id)
CREATE INDEX IF NOT EXISTS idx_rekod_pesanan_queue_active
  ON public.rekod_pesanan (kedai_id, status_penghantaran)
  WHERE status_penghantaran IN ('PENDING', 'PREPARING');

-- 2. Index untuk archive customer (pelanggan_telegram_id + updated_at)
CREATE INDEX IF NOT EXISTS idx_rekod_pesanan_cust_archive
  ON public.rekod_pesanan (pelanggan_telegram_id, updated_at DESC);

-- 3. Index compound untuk telemetry audit health (component + recorded_at)
CREATE INDEX IF NOT EXISTS idx_audit_telemetry_component_time
  ON public.audit_telemetry_health (component, recorded_at DESC);

-- 4. Pastikan RLS aktif pada jadual kritikal (idempoten)
ALTER TABLE public.rekod_pesanan ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.senarai_kedai ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_makanan ENABLE ROW LEVEL SECURITY;

-- 5. RLS policy: peniaga hanya lihat pesanan kedai sendiri (multi-tenant isolation)
DROP POLICY IF EXISTS rls_rekod_pesanan_merchant_isolation ON public.rekod_pesanan;
CREATE POLICY rls_rekod_pesanan_merchant_isolation
  ON public.rekod_pesanan
  FOR ALL
  USING (kedai_id = current_setting('request.merchant_kedai_id', true)::uuid)
  WITH CHECK (kedai_id = current_setting('request.merchant_kedai_id', true)::uuid);

-- 6. RLS policy: customer hanya lihat pesanan sendiri
DROP POLICY IF EXISTS rls_rekod_pesanan_customer_isolation ON public.rekod_pesanan;
CREATE POLICY rls_rekod_pesanan_customer_isolation
  ON public.rekod_pesanan
  FOR SELECT
  USING (pelanggan_telegram_id = current_setting('request.customer_tg_id', true)::text);
-- Note: pelanggan_telegram_id disimpan sebagai text di schema, tiada cast perlu.

-- End: Phase 38 - Order Queue Telemetry Indexes & RLS Hardening (Migration 012)