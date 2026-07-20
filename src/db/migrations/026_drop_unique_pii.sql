-- Phase 71 - Fix Daftar Kedai UNIQUE Collision (Fasal 13 DDL sync)
-- emel_pemilik + no_telefon_sim ada UNIQUE NOT NULL, menyebabkan
-- daftar kedua (atau retry) gagal senyap. Kedai dikenal pasti via
-- merchant_telegram_id (UNIQUE), jadi emel/telefon jadi OPTIONAL.
-- Start: Phase 71 - Drop UNIQUE on emel_pemilik
ALTER TABLE senarai_kedai
  DROP CONSTRAINT IF EXISTS senarai_kedai_emel_pemilik_key;
-- End: Phase 71 - Drop UNIQUE on emel_pemilik

-- Start: Phase 71 - Drop UNIQUE on no_telefon_sim
ALTER TABLE senarai_kedai
  DROP CONSTRAINT IF EXISTS senarai_kedai_no_telefon_sim_key;
-- End: Phase 71 - Drop UNIQUE on no_telefon_sim

-- Start: Phase 71 - Relax NOT NULL (izinkan null semasa onboarding)
ALTER TABLE senarai_kedai ALTER COLUMN emel_pemilik DROP NOT NULL;
ALTER TABLE senarai_kedai ALTER COLUMN no_telefon_sim DROP NOT NULL;
-- End: Phase 71 - Relax NOT NULL