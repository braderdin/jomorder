-- Start: Phase 38 - Order Queue Telemetry Indexes & RLS Hardening (Migration 012)
-- Fasal 7 Strategy 1 (RLS isolation) + Phase 36 (telemetry perf).
-- Idempoten: setiap objek dijaga dengan IF NOT EXISTS / guard EXISTS.
-- Jalankan terus ke Supabase (port 5432, ?pgbouncer=false) via postgres MCP.

-- 1. Indeks prestasi untuk lajukan query queue status pesanan.
CREATE INDEX IF NOT EXISTS idx_rekod_pesanan_status_penghantaran
  ON public.rekod_pesanan (status_penghantaran);

CREATE INDEX IF NOT EXISTS idx_rekod_pesanan_status_pesanan
  ON public.rekod_pesanan (status_pesanan);

-- Indeks gabungan kedai_id + status untuk pengasingan multi-tenant laju.
CREATE INDEX IF NOT EXISTS idx_rekod_pesanan_kedai_status
  ON public.rekod_pesanan (kedai_id, status_penghantaran);

-- Indeks merchant scrape untuk lajukan carian kedai berdekatan + status.
CREATE INDEX IF NOT EXISTS idx_senarai_kedai_merchant_status
  ON public.senarai_kedai (merchant_telegram_id, status_kedai);

-- 2. RLS: pastikan Row Level Security aktif pada jadual kritikal.
ALTER TABLE public.rekod_pesanan ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.senarai_kedai ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_makanan ENABLE ROW LEVEL SECURITY;

-- 3. Polisi selamat: benarkan service_role (worker) akses penuh.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'rekod_pesanan'
      AND policyname = 'svc_rekod_pesanan_full'
  ) THEN
    CREATE POLICY svc_rekod_pesanan_full ON public.rekod_pesanan
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'senarai_kedai'
      AND policyname = 'svc_senarai_kedai_full'
  ) THEN
    CREATE POLICY svc_senarai_kedai_full ON public.senarai_kedai
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'menu_makanan'
      AND policyname = 'svc_menu_makanan_full'
  ) THEN
    CREATE POLICY svc_menu_makanan_full ON public.menu_makanan
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- 4. Log RLS audit: catat kematian baca (null returns) sebagai jadual helper.
-- (tdk mengubah skema produksi; sekadar view telemetry).
CREATE OR REPLACE VIEW public.v_order_queue_telemetry AS
SELECT
  status_penghantaran,
  COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '1 hour') AS last_hour_count,
  COUNT(*) AS total_count
FROM public.rekod_pesanan
GROUP BY status_penghantaran;

-- End: Phase 38 - Order Queue Telemetry Indexes & RLS Hardening