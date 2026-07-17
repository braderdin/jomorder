-- ============================================================
-- JomOrder Phase 25 - Idempotent Live Demo Menu Seed
-- Fasal 13 (DDL sync log) + Fasal 4 (SOA)
-- Populate sample dishes linked to a fixed demo shop UUID.
-- Safe to re-run: ON CONFLICT DO NOTHING guards duplicates.
-- ============================================================

-- Start: Phase 25 - Fixed Demo Shop UUID (idempotent anchor)
-- Guna UUID literal supaya seed boleh di-link secara stabil merentas run.
DO $$
DECLARE
  v_shop UUID := '00000000-0000-0000-0000-000000000001';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.senarai_kedai WHERE id = v_shop) THEN
    INSERT INTO public.senarai_kedai (
      id,
      nama_pemilik,
      emel_pemilik,
      no_telefon_sim,
      nama_kedai,
      latitude_kedai,
      longitude_kedai,
      status_kedai,
      status_langganan
    ) VALUES (
      v_shop,
      'Demo Owner',
      'demo@jomorder.my',
      'demo_0001',
      'Kedai Demo Siber',
      3.1390,
      101.6869,
      'AKTIF',
      'AKTIF'
    );
  END IF;
END $$;
-- End: Phase 25 - Fixed Demo Shop UUID

-- Start: Phase 25 - Unique anchor untuk idempotent menu insert
CREATE UNIQUE INDEX IF NOT EXISTS idx_menu_kedai_nama
  ON public.menu_makanan (kedai_id, nama_hidangan);
-- End: Phase 25 - Unique anchor

-- Start: Phase 25 - Sample dish inserts (ON CONFLICT DO NOTHING)
INSERT INTO public.menu_makanan (kedai_id, nama_hidangan, harga, status_tersedia)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'Nasi Lemak Siber Hologram', 12.90, true),
  ('00000000-0000-0000-0000-000000000001', 'Burger Gergasi Data-Mesh', 18.50, true),
  ('00000000-0000-0000-0000-000000000001', 'Teh Tarik Quantum Latte', 6.00, true),
  ('00000000-0000-0000-0000-000000000001', 'Ayam Percik Neural-Net', 15.20, true),
  ('00000000-0000-0000-0000-000000000001', 'Cendol Cloud Edge', 8.80, true)
ON CONFLICT (kedai_id, nama_hidangan) DO NOTHING;
-- End: Phase 25 - Sample dish inserts