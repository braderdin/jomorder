-- Start: Phase 51 - Menu Item Photo Column (Fasal 8 storage wiring)
-- Tambah kolum gambar_url ke menu_makanan supaya item menu boleh papar
-- imej (R2 WebP) di storefront pelanggan. Ikut Fasal 13 DDL sync guard.
-- DDL ini dilaksanakan ke Supabase via postgres MCP (unpooled ?pgbouncer=false).
ALTER TABLE public.menu_makanan
  ADD COLUMN IF NOT EXISTS gambar_url TEXT NULL;

-- Indeks carian gambar ada (untuk filter kempen visual masa depan).
CREATE INDEX IF NOT EXISTS idx_menu_gambar
  ON public.menu_makanan (kedai_id, gambar_url)
  WHERE gambar_url IS NOT NULL;
-- End: Phase 51 - Menu Item Photo Column