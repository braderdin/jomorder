// Start: JomOrder Fasa 4 - Supabase Data Layer (Fail 1)
// Fasal 7 Strategy 1 (RLS isolation via service_role) + Fasal 4 (SOA) + Fasal 11 (env binding)
// Pure TypeScript fetch-based PostgREST client (no external dep = free tier footprint)
import { Env } from './types';

/** Standard Supabase auth headers menggunakan service_role (server-side only) */
function supabaseHeaders(env: Env): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  };
}

export interface KedaiBerhampiran {
  id: string;
  nama_kedai: string;
  latitude_kedai: number;
  longitude_kedai: number;
  jarak_km: number;
}

/**
 * Trigger Fasa 2 RPC: ambil_kedai_berhampiran (Haversine geo-query).
 * Selamat: dibalut try/catch, return [] jika gagal (Fasal 7 Strategy 4 soft-fail).
 */
export async function ambilKedaiBerhampiran(
  env: Env,
  pelangganLat: number,
  pelangganLong: number,
  radiusKm = 10
): Promise<KedaiBerhampiran[]> {
  const url = `${env.SUPABASE_URL}/rest/v1/rpc/ambil_kedai_berhampiran`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: supabaseHeaders(env),
      body: JSON.stringify({
        pelanggan_lat: pelangganLat,
        pelanggan_long: pelangganLong,
        radius_km: radiusKm,
      }),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as KedaiBerhampiran[];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/**
 * Semak sama ada Telegram ID peniaga wujud dalam senarai_kedai.
 * RLS di bypass melalui service_role; query diikat ke merchant_telegram_id (Fasal 7 Strategy 1).
 * NOTE: Kolum merchant_telegram_id ditambah ke schema.sql (migration Fasa 4).
 */
export async function checkMerchantExists(
  env: Env,
  telegramId: number
): Promise<boolean> {
  const url = `${env.SUPABASE_URL}/rest/v1/senarai_kedai?merchant_telegram_id=eq.${telegramId}&select=id&limit=1`;
  try {
    const res = await fetch(url, { method: 'GET', headers: supabaseHeaders(env) });
    if (!res.ok) return false;
    const rows = (await res.json()) as Array<{ id: string }>;
    return Array.isArray(rows) && rows.length > 0;
  } catch {
    return false;
  }
}

/** Rekod permulaan peniaga baharu ke senarai_kedai (onboarding Langkah A). */
export async function daftarKedaiPermulaan(
  env: Env,
  telegramId: number,
  namaKedai: string
): Promise<boolean> {
  const url = `${env.SUPABASE_URL}/rest/v1/senarai_kedai`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { ...supabaseHeaders(env), Prefer: 'return=minimal' },
      body: JSON.stringify({
        merchant_telegram_id: String(telegramId),
        nama_kedai: namaKedai,
        nama_pemilik: 'PEMILIK_BAHARU',
        emel_pemilik: `${telegramId}@jomorder.local`,
        no_telefon_sim: String(telegramId),
        latitude_kedai: 0,
        longitude_kedai: 0,
        status_kedai: 'MENUNGGU_PENGESAHAN',
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// End: JomOrder Fasa 4 - Supabase Data Layer (Fail 1)