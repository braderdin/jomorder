-- Start: Fasa 17 - Premium Subscription CHECK Constraint (Migration 003)
-- Fasal 13 (Schema Integrity Guard): DDL ini WAJIB di-apply ke live Supabase
-- (SQL editor) SELEPAS sprint Fasa 17 siap, bagi elak live runtime drift.
-- Tambah CHECK constraint ke kolum status_langganan supaya nilai 'PREMIUM'
-- (di-set oleh flow /naiktaraf Fasa 15/16) kekal sah di peringkat DB.
-- Idempoten: drop constraint dulu jika wujud (IF EXISTS) sebelum recreate.

ALTER TABLE senarai_kedai
  DROP CONSTRAINT IF EXISTS chk_status_langganan;

ALTER TABLE senarai_kedai
  ADD CONSTRAINT chk_status_langganan
  CHECK (status_langganan IN ('AKTIF', 'HAMPIR_TAMAT', 'TAMAT', 'PREMIUM'));
-- End: Fasa 17 - Premium Subscription CHECK Constraint (Migration 003)