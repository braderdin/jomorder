-- Start: Fasa 12 - Database Operational Seeding (Live Validation)
-- Jadual sasaran: kawasan_operasi (lihat src/db/schema.sql Jadual 1)
-- Idempoten: ON CONFLICT (nama_kawasan) DO NOTHING elak duplicate push.
-- Idempoten: ON CONFLICT (nama_kawasan) DO NOTHING mengelakkan penambahan duplikat.

-- ============================================================
-- Seed: Zon Operasi Default (instant live validation)
-- ============================================================
INSERT INTO kawasan_operasi (nama_kawasan) VALUES
    ('Kuala Lumpur'),
    ('Puncak Alam'),
    ('Petaling Jaya'),
    ('Shah Alam'),
    ('Klang')
ON CONFLICT (nama_kawasan) DO NOTHING;

-- ============================================================
-- Verification Query (untuk semakan pantas selepas seed)
-- ============================================================
-- SELECT id, nama_kawasan, created_at
-- FROM kawasan_operasi
-- ORDER BY nama_kawasan ASC;

-- End: Fasa 12 - Database Operational Seeding