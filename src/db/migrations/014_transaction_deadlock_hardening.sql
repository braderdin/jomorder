-- Start: Phase 40 - Transaction Deadlock Hardening (Migration 014)
-- Fasal 13 (log DDL ke schema.sql) + Fasal 7 Strategy 1 (RLS + merchant_telegram_id).
-- Idempoten: guna DO block + CREATE INDEX IF NOT EXISTS supaya selamat dijalankan
-- berulang kali di Supabase live tanpa duplicate error.
-- Target: kekang race condition / deadlock pada rekod_pesanan (update serentak)
-- melalui statement_timeout, lock babi dibatasi, dan indeks cover untuk
-- penapis berat (merchant_telegram_id, status_pesanan, created_at).

-- 1) Set statement timeout per-session untuk koneksi aplikasi (elak long-lock hang).
--    Diambil pakai pada pooler tanpa ubah default cluster.
ALTER ROLE postgres SET statement_timeout = '8s';
ALTER ROLE anon SET statement_timeout = '8s';
ALTER ROLE authenticated SET statement_timeout = '8s';
ALTER ROLE service_role SET statement_timeout = '8s';

-- 2) Indeks cover untuk penapis merchant + status + tarikh (cegah seq-scan deadlock).
CREATE INDEX IF NOT EXISTS idx_rekod_pesanan_merchant_status_created
  ON rekod_pesanan (merchant_telegram_id, status_pesanan, created_at DESC);

-- 3) Indeks partial: pesanan "aktif" sahaja (belum selesai) untuk update panas.
CREATE INDEX IF NOT EXISTS idx_rekod_pesanan_active_lock
  ON rekod_pesanan (merchant_telegram_id, id)
  WHERE status_pesanan IN ('MENUNGGU_BAYAR', 'SEDANG_DISEDIA', 'SEDANG_DIHANTAR');

-- 4) Indeks pada cart_buffer (JSONB) untuk carian laju ikut customer id.
CREATE INDEX IF NOT EXISTS idx_senarai_kedai_status_langganan
  ON senarai_kedai (status_langganan, tamat_langganan_pada)
  WHERE status_langganan <> 'TAMAT';

-- 5) Function selamat: update status pesanan secara atomik dengan guard versi.
--    Elak dua update serentak tindih (optimistic concurrency via updated_at).
CREATE OR REPLACE FUNCTION fn_update_pesanan_atomic(
  p_id uuid,
  p_merchant_telegram_id text,
  p_new_status text,
  p_expected_updated_at timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows int;
BEGIN
  UPDATE rekod_pesanan
  SET status_pesanan = p_new_status,
      updated_at = now()
  WHERE id = p_id
    AND merchant_telegram_id = p_merchant_telegram_id
    AND updated_at = p_expected_updated_at;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$;

-- 6) Pastikan updated_at ada default now() dan NOT NULL (jika tiada).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'rekod_pesanan'
      AND column_name = 'updated_at'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE rekod_pesanan
      ALTER COLUMN updated_at SET DEFAULT now(),
      ALTER COLUMN updated_at SET NOT NULL;
  END IF;
END $$;

-- End: Phase 40 - Transaction Deadlock Hardening (Migration 014)