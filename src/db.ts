// Start: JomOrder Fasa 4 - Supabase Data Layer (Fail 1)
// Fasal 7 Strategy 1 (RLS isolation via service_role) + Fasal 4 (SOA) + Fasal 11 (env binding)
// Pure TypeScript fetch-based PostgREST client (no external dep = free tier footprint)
import { Env } from './types';
import {
  getSubscriptionCache,
  setSubscriptionCache,
} from './redis';
import { normalizeLangganan, LanggananStatus } from './subscription';

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

// Start: Fasa 5 - Subscription Cache + Order Lifecycle Persistence
// Fasal 7 Strategy 1 (RLS) + Strategy 2 (Redis fast-path shield).

/**
 * Dapatkan status langganan dengan Redis cache-first pattern.
 * Setiap mesej masuk periksa Redis dulu (sub:{id}) sebelum tembak Supabase
 * untuk lindungi free-tier quota dari traffic spike (Fasal 7 Strategy 2).
 * Soft-fail: cache miss / DB fail -> 'AKTIF' (fail-open).
 */
export async function getLanggananStatusCached(
  env: Env,
  telegramId: number
): Promise<LanggananStatus> {
  const cached = await getSubscriptionCache(env, telegramId);
  if (cached) return normalizeLangganan(cached);

  const url = `${env.SUPABASE_URL}/rest/v1/senarai_kedai?merchant_telegram_id=eq.${telegramId}&select=status_langganan&limit=1`;
  try {
    const res = await fetch(url, { method: 'GET', headers: supabaseHeaders(env) });
    if (!res.ok) return 'AKTIF';
    const rows = (await res.json()) as Array<{ status_langganan?: string }>;
    if (!Array.isArray(rows) || rows.length === 0) return 'AKTIF';
    const status = normalizeLangganan(rows[0].status_langganan);
    await setSubscriptionCache(env, telegramId, status);
    return status;
  } catch {
    return 'AKTIF';
  }
}

/**
 * Kemaskini status_penghantaran pesanan ke DB (PENDING->MEMASAK->DELIVERY->COMPLETED).
 * Diikat ke kedai_id untuk pengasingan multi-tenant (Fasal 7 Strategy 1).
 * @returns true jika PATCH berjaya
 */
export async function updateStatusPenghantaran(
  env: Env,
  orderId: number,
  kedaiId: string,
  status: string
): Promise<boolean> {
  const url = `${env.SUPABASE_URL}/rest/v1/rekod_pesanan?id=eq.${orderId}&kedai_id=eq.${kedaiId}`;
  try {
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { ...supabaseHeaders(env), Prefer: 'return=minimal' },
      body: JSON.stringify({ status_penghantaran: status }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// End: Fasa 5 - Subscription Cache + Order Lifecycle Persistence

// End: JomOrder Fasa 4 - Supabase Data Layer (Fail 1)
