// Start: Phase 53 - Zon Operasi Delivery Radius Service (Fasal 7 Strategy 1 isolation)
// Kira jarak haversine + tentukan zon penghantaran kedai (radius 10km default).
// Single source of truth untuk /zon_operasi command dan validasi checkout.
import { Env } from '../types';

const EARTH_RADIUS_KM = 6371;
const DEFAULT_RADIUS_KM = 10;

/** Haversine distance antara dua koordinat (km). */
export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

/** Dapatkan radius operasi kedai (default 10km jika tiada di DB). */
export async function getZonRadius(env: Env, kedaiId: string): Promise<number> {
  try {
    const url = `${env.SUPABASE_URL}/rest/v1/senarai_kedai?id=eq.${encodeURIComponent(kedaiId)}&select=radius_operasi_km`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });
    if (!res.ok) return DEFAULT_RADIUS_KM;
    const rows = (await res.json()) as Array<{ radius_operasi_km?: number }>;
    if (Array.isArray(rows) && rows[0]?.radius_operasi_km && rows[0].radius_operasi_km > 0) {
      return rows[0].radius_operasi_km;
    }
  } catch {
    // soft-fail
  }
  return DEFAULT_RADIUS_KM;
}

/** Semak sama ada lokasi penghantaran dalam zon operasi kedai. */
export async function isDalamZon(
  env: Env,
  kedaiId: string,
  kedaiLat: number,
  kedaiLng: number,
  custLat: number,
  custLng: number
): Promise<{ dalam: boolean; jarakKm: number; radiusKm: number }> {
  const radiusKm = await getZonRadius(env, kedaiId);
  const jarakKm = haversineKm(kedaiLat, kedaiLng, custLat, custLng);
  return { dalam: jarakKm <= radiusKm, jarakKm, radiusKm };
}
// End: Phase 53 - Zon Operasi Delivery Radius Service