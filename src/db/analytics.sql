-- ============================================================
-- JomOrder Modern-Siber :: SaaS Analytics Aggregate (Fasa 13)
-- ============================================================
-- Fasal 13 (Super-Admin Analytics Portal) + Fasal 4 (SOA)
-- Idempotent DDL: safe di-jalankan berulang kali ke Supabase.
-- Agregat metrik SaaS: merchant aktif diluluskan, kedai premium,
-- jumlah hasil (rekod_pesanan paid), dan unjuran MRR (RM29/bulan/aktif).
-- ============================================================

-- Start: Fasa 13 - Idempotent SaaS Metrics View
-- View ringkas untuk baca metrik platform terkumpul.
DROP VIEW IF EXISTS public.v_saas_metrics;
CREATE VIEW public.v_saas_metrics AS
SELECT
  -- Merchant aktif = diluluskan admin + langganan AKTIF (Fasal 7 Strategy 1).
  (
    SELECT COUNT(*)
    FROM senarai_kedai
    WHERE status_kedai = 'DILULUSKAN'
      AND status_langganan = 'AKTIF'
  ) AS total_active_merchants,
  -- Kedai premium = tier langganan PREMIUM.
  (
    SELECT COUNT(*)
    FROM senarai_kedai
    WHERE status_langganan = 'PREMIUM'
  ) AS total_premium_stores,
  -- Jumlah hasil = SUM jumlah_harga pesanan yang telah bayar.
  (
    SELECT COALESCE(SUM(jumlah_harga), 0)
    FROM rekod_pesanan
    WHERE status_pembayaran = 'TELAH_BAYAR'
  ) AS total_revenue_rm,
  -- Jumlah pesanan = COUNT semua rekod_pesanan (Fasa 13: total orders breakdown).
  (
    SELECT COUNT(*)
    FROM rekod_pesanan
  ) AS total_orders,
  -- Unjuran MRR = RM29 sebulan bagi setiap merchant aktif.
  (
    SELECT COUNT(*) * 29
    FROM senarai_kedai
    WHERE status_kedai = 'DILULUSKAN'
      AND status_langganan = 'AKTIF'
  ) AS mrr_projection_rm;
-- End: Fasa 13 - Idempotent SaaS Metrics View

-- Start: Fasa 13 - RPC Function (PostgREST native fetch)
-- Fungsi PL/pgSQL kembalikan baris tunggal JSONB untuk fetch ringkas
-- dari data layer analytics.ts via ${SUPABASE_URL}/rest/v1/rpc/get_saas_metrics
CREATE OR REPLACE FUNCTION public.get_saas_metrics()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active INT;
  v_premium INT;
  v_revenue NUMERIC;
  v_orders INT;
  v_mrr NUMERIC;
BEGIN
  SELECT total_active_merchants,
         total_premium_stores,
         total_revenue_rm,
         total_orders,
         mrr_projection_rm
  INTO v_active, v_premium, v_revenue, v_orders, v_mrr
  FROM public.v_saas_metrics;

  RETURN jsonb_build_object(
    'total_active_merchants', v_active,
    'total_premium_stores', v_premium,
    'total_revenue_rm', v_revenue,
    'total_orders', v_orders,
    'mrr_projection_rm', v_mrr
  );
END;
$$;

-- Grant akses service_role (Fasal 7 Strategy 1 RLS bypass).
GRANT EXECUTE ON FUNCTION public.get_saas_metrics() TO service_role;
GRANT SELECT ON public.v_saas_metrics TO service_role;
-- End: Fasa 13 - RPC Function (PostgREST native fetch)