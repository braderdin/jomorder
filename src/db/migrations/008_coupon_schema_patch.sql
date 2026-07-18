-- Start: Phase 33 - Migration 008 Coupon Schema Patch (Idempotent Scalpel)
-- Fasal 4 (SOA) + Fasal 7 Strategy 1 (RLS multi-tenant isolation).
-- Cipta jadual kupon_kedai jika belum wujud. Selamat dijalankan berulang kali.
-- Rujukan: src/handlers/marketing_coupon.ts (kod, diskaun_peratus, min_pesanan_rm,
--          merchant_telegram_id, aktif). CHAT BESAR: apply manual di Supabase SQL editor.

-- 1) Jadual kupon (idempoten).
CREATE TABLE IF NOT EXISTS public.kupon_kedai (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kod TEXT NOT NULL,
  diskaun_peratus NUMERIC(5, 2) NOT NULL DEFAULT 0,
  min_pesanan_rm NUMERIC(10, 2) NOT NULL DEFAULT 0,
  merchant_telegram_id BIGINT NOT NULL,
  aktif BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2) Kekalkan pasangan (kod, merchant) unik supaya tiada duplikasi per peniaga.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uniq_kupon_merchant'
  ) THEN
    ALTER TABLE public.kupon_kedai
      ADD CONSTRAINT uniq_kupon_merchant
      UNIQUE (kod, merchant_telegram_id);
  END IF;
END $$;

-- 3) Indeks pantas untuk carian mengikut peniaga (Fasal 7 S1).
CREATE INDEX IF NOT EXISTS idx_kupon_merchant
  ON public.kupon_kedai (merchant_telegram_id);

-- 4) Pengasingan baris: hanya service_role (server) boleh tulis/baca.
ALTER TABLE public.kupon_kedai ENABLE ROW LEVEL SECURITY;

-- 5) Polisi idempoten (drop dulu jika wujud, kemudian create semula).
DROP POLICY IF EXISTS kupon_service_write ON public.kupon_kedai;
CREATE POLICY kupon_service_write
  ON public.kupon_kedai
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 6) Peniaga hanya nampak kupon milik sendiri melalui view selamat (anon dihalang tulis).
DROP POLICY IF EXISTS kupon_merchant_isolated ON public.kupon_kedai;
CREATE POLICY kupon_merchant_isolated
  ON public.kupon_kedai
  FOR SELECT
  TO authenticated
  USING (merchant_telegram_id = (auth.jwt() ->> 'sub')::bigint);

-- 7) Berikan hak penuh kepada peranan service_role (Fasal 7 S1 bypass RLS).
GRANT ALL PRIVILEGES ON TABLE public.kupon_kedai TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.kupon_kedai_id_seq TO service_role;

-- End: Phase 33 - Migration 008 Coupon Schema Patch