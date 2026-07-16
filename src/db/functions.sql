-- ============================================================
-- JomOrder Modern-Siber :: Database Functions (RPC Source of Truth)
-- Fasa 2: Geolocation Engine (Haversine Formula)
-- Fasal 7: Schema & Multi-Tenant Isolation (SECURITY DEFINER + search_path)
-- Fasal 12: Sequential Task Isolation (single module per task)
-- ============================================================

-- ------------------------------------------------------------
-- Function: ambil_kedai_berhampiran
-- Returns merchants within radius_km, sorted nearest -> farthest.
-- Filters: status_kedai = 'DILULUSKAN' AND status_langganan = 'AKTIF'
--          (auto-excludes 'TAMAT' and any non-approved states)
--          (auto-excludes NULL coordinate merchants)
-- Math: Haversine d = 2 * 6371 * asin(sqrt(...))
-- NOTE: Haversine produces double precision; explicitly cast ::numeric
--       to match RETURNS TABLE jarak_km numeric (fixes type mismatch).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION ambil_kedai_berhampiran(
    pelanggan_lat numeric,
    pelanggan_long numeric,
    radius_km numeric DEFAULT 10
)
RETURNS TABLE (
    id uuid,
    nama_kedai text,
    latitude_kedai numeric,
    longitude_kedai numeric,
    jarak_km numeric
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        q.q_id,
        q.q_nama,
        q.q_lat,
        q.q_long,
        q.q_jarak
    FROM (
        SELECT
            s.id AS q_id,
            s.nama_kedai AS q_nama,
            s.latitude_kedai AS q_lat,
            s.longitude_kedai AS q_long,
            (
                (
                    2 * 6371 * asin(
                        sqrt(
                            power(sin(radians(s.latitude_kedai - pelanggan_lat) / 2), 2)
                            + cos(radians(pelanggan_lat))
                              * cos(radians(s.latitude_kedai))
                              * power(sin(radians(s.longitude_kedai - pelanggan_long) / 2), 2)
                        )
                    )
                )::numeric
            ) AS q_jarak
        FROM senarai_kedai s
        WHERE s.status_kedai = 'DILULUSKAN'
          AND s.status_langganan = 'AKTIF'
          AND s.latitude_kedai IS NOT NULL
          AND s.longitude_kedai IS NOT NULL
    ) q
    WHERE q.q_jarak <= radius_km
    ORDER BY q.q_jarak ASC;
END;
$$ LANGUAGE plpgsql
   SECURITY DEFINER
   SET search_path = public;