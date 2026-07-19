-- Start: Phase 60 - Founder Demo Shop DDL (Migration 025)
-- Idempotent seed untuk kedai contoh pengasas + 8 menu dummy.
-- Auto-apply via postgres MCP (pgbouncer=false).
-- Fixed UUID kedai: 00000000-0000-0000-0000-000000000001.

-- Kedai pengasas.
INSERT INTO senarai_kedai (
  id,
  merchant_telegram_id,
  nama_kedai,
  nama_pemilik,
  emel_pemilik,
  no_telefon_sim,
  latitude_kedai,
  longitude_kedai,
  status_kedai,
  status_langganan,
  tamat_langganan_pada
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  '0',
  'JomOrder HQ (Demo)',
  'JomOrder Founder',
  'founder@jomorder.local',
  '0',
  3.1390,
  101.6869,
  'DILULUSKAN',
  'PREMIUM',
  (now() + interval '365 days')
)
ON CONFLICT (id) DO UPDATE SET
  nama_kedai = EXCLUDED.nama_kedai,
  status_kedai = 'DILULUSKAN',
  status_langganan = 'PREMIUM';

-- Menu dummy (8 hidangan).
INSERT INTO menu_makanan (kedai_id, nama_hidangan, harga, status_tersedia, gambar_url) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Nasi Lemak', 8.90, true, ''),
  ('00000000-0000-0000-0000-000000000001', 'Teh Tarik', 3.50, true, ''),
  ('00000000-0000-0000-0000-000000000001', 'Roti Canai', 2.50, true, ''),
  ('00000000-0000-0000-0000-000000000001', 'Ayam Goreng', 12.00, true, ''),
  ('00000000-0000-0000-0000-000000000001', 'Mee Goreng', 9.50, true, ''),
  ('00000000-0000-0000-0000-000000000001', 'Cendol', 5.00, true, ''),
  ('00000000-0000-0000-0000-000000000001', 'Nasi Ayam', 11.00, true, ''),
  ('00000000-0000-0000-0000-000000000001', 'Kopi O', 3.00, true, '')
ON CONFLICT DO NOTHING;
-- End: Phase 60 - Founder Demo Shop DDL (Migration 025)