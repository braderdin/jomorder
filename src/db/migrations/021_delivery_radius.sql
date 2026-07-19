// Start: Phase 53 - Delivery Radius Column (zon_operasi)
// Tambah radius_operasi_km ke senarai_kedai. Idempotent (IF NOT EXISTS).
// Manual: run di Supabase SQL Editor bersama 019 + 020.
// End: Phase 53 - Delivery Radius Column
ALTER TABLE senarai_kedai
  ADD COLUMN IF NOT EXISTS radius_operasi_km numeric DEFAULT 10;

COMMENT ON COLUMN senarai_kedai.radius_operasi_km IS
  'Radius penghantaran operasi kedai dalam kilometer (default 10km).';