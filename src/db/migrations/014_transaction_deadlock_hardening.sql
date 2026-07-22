-- Start: Phase 40 - Transaction Deadlock Hardening (Migration 014)
-- Fasal 13 (log DDL ke schema.sql) + Fasal 7 Strategy 1 (RLS + merchant_telegram_id).
-- Idempoten: guna DO block + CREATE INDEX IF NOT EXISTS supaya selamat dijalankan
-- berulang kali di Supabase live tanpa duplicate error.
-- Target: kekang race condition / deadlock pada rekod_pesanan (update serentak)
-- Idempoten: menggunakan DO block + CREATE INDEX IF NOT EXISTS supaya selamat dijalankan
-- berulang kali di Supabase secara langsung tanpa ralat duplikat.
-- Target: mengekang race condition / deadlock pada rekod_pesanan (kemas kini serentak)
-- melalui statement_timeout, kunci yang berlebihan dibatasi, dan indeks meliputi untuk
-- penapis berat (merchant_telegram_id, status_pesanan, created_at).

-- 1) Set statement timeout per-session untuk koneksi aplikasi (elak long-lock hang).
--    Diambil pakai pada pooler tanpa ubah default cluster.
ALTER ROLE postgres SET statement_timeout = '8s';
ALTER ROLE anon SET statement_timeout = '8s';
ALTER ROLE authenticated SET statement_timeout = '8s';
ALTER ROLE service_role SET statement_timeout = '8s';
 
-- 2) Indeks meliputi untuk penapis pedagang + status + tarikh (mencegah deadlock imbasan berurutan).
CREATE INDEX IF NOT EXISTS idx_rekod_pesanan_merchant_status_created
  ON rekod_pesanan (merchant_telegram_id, status_pesanan, created_at DESC);

-- 3) Indeks separa: pesanan "aktif" sahaja (belum selesai) untuk kemas kini yang kerap.
CREATE INDEX IF NOT EXISTS idx_rekod_pesanan_active_lock
  ON rekod_pesanan (merchant_telegram_id, id)
  WHERE status_pesanan IN ('MENUNGGU_BAYAR', 'SEDANG_DISEDIA', 'SEDANG_DIHANTAR');

-- 4) Indeks pada cart_buffer (JSONB) untuk carian pantas mengikut ID pelanggan.
CREATE INDEX IF NOT EXISTS idx_senarai_kedai_status_langganan
  ON senarai_kedai (status_langganan, tamat_langganan_pada)
  WHERE status_langganan <> 'TAMAT';

-- 5) Fungsi selamat: mengemas kini status pesanan secara atomik dengan pelindung versi.
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
 
-- 6) Pastikan updated_at mempunyai nilai lalai now() dan NOT NULL (jika tidak ada).
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