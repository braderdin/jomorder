// Start: JomOrder Fasa 13 - SaaS Analytics Data Layer (File 2)
// Fasal 13 (Super-Admin Analytics Portal) + Fasal 4 (SOA) + Fasal 7 Strategy 1 (service_role RLS bypass)
// Native fetch-based PostgREST client untuk jalankan RPC get_saas_metrics().
// Tiada dependency luaran = free-tier footprint.

import { Env } from '../types';

// Start: Phase 28 - Public Redis Caching Grid (Upstash 60s TTL)
// Cache agregat awam di Upstash Redis untuk elak database hammering.
// Start: Phase 36 Analytics 60s Cache
// Key global: analytics:public:stats (prefix selaras grid). Fail-safe: fallback ke live DB fetch jika Redis timeout.
const PUBLIC_STATS_KEY = 'analytics:public:stats';
const PUBLIC_STATS_TTL = 60; // saat (strictly 60s Upstash grid - Phase 36 hardening)
// End: Phase 36 Analytics 60s Cache

/** Executor REST ke Upstash Redis (selari pattern redis.ts). */
async function redisCacheGet(env: Env, key: string): Promise<string | null> {
  try {
    const res = await fetch(env.UPSTASH_REDIS_REST_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`,
      },
      body: JSON.stringify([['GET', key]]),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{ result: unknown }>;
    const r = data?.[0]?.result;
    return typeof r === 'string' ? r : null;
  } catch {
    return null; // Redis timeout -> fallback
  }
}

/** Tulis cache dengan EX TTL (fail-safe swallow error). */
async function redisCacheSet(env: Env, key: string, value: string, ttl: number): Promise<void> {
  try {
    await fetch(env.UPSTASH_REDIS_REST_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`,
      },
      body: JSON.stringify([['SET', key, value, 'EX', ttl]]),
    });
  } catch {
    // swallow - caching bukan kritikal
  }
}
// End: Phase 28 - Public Redis Caching Grid

/** Struktur metrik SaaS terkumpul (selari dengan get_saas_metrics() RPC). */
export interface SaasMetrics {
  total_active_merchants: number;
  total_premium_stores: number;
  total_revenue_rm: number;
  total_orders: number;
  mrr_projection_rm: number;
}

/** Standard Supabase auth headers menggunakan service_role (server-side only). */
function supabaseHeaders(env: Env): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  };
}

/**
 * Fetch metrik SaaS platform dari view analitik.
 * Dipanggil oleh admin handler untuk papar dashboard Chip Besar.
 * Soft-fail: return null jika DB/network gagal (Fasal 7 Strategy 4).
 */
export async function fetchSaasMetrics(env: Env): Promise<SaasMetrics | null> {
  const url = `${env.SUPABASE_URL}/rest/v1/rpc/get_saas_metrics`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: supabaseHeaders(env),
      body: JSON.stringify({}),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Partial<SaasMetrics>;
    const premium = Number(data.total_premium_stores ?? 0);
    let mrr = Number(data.mrr_projection_rm ?? 0);
    // Phase 34: Active MRR recalculation fallback (RM49.90/sebulan per stor premium).
    if (!mrr || mrr <= 0) {
      mrr = Math.round(premium * 49.9 * 100) / 100;
    }
    return {
      total_active_merchants: Number(data.total_active_merchants ?? 0),
      total_premium_stores: premium,
      total_revenue_rm: Number(data.total_revenue_rm ?? 0),
      total_orders: Number(data.total_orders ?? 0),
      mrr_projection_rm: mrr,
    };
  } catch {
    return null; // Soft-fail (Fasal 7 Strategy 4)
  }
}
/** Struktur stats awam (selamat, tiada data sensitif). */
export interface PublicStats {
  total_shops: number;
  total_orders: number;
  total_gmv_rm: number;
  status: string;
  cached_at?: string; // ISO timestamp semasa di-cache (Phase 29 observability)
}

/**
 * Fetch agregat awam SELAMAT untuk frontend hydration (ganti N/A).
 * Hanya COUNT aggregate dari senarai_kedai & rekod_pesanan.
 * Guna anon key (bukan service_role) -> RLS kekal aktif (Fasal 7 Strategy 1).
 * Soft-fail: return zero payload jika DB/network gagal (Fasal 7 Strategy 4).
 */
export async function fetchPublicStats(env: Env): Promise<PublicStats> {
  // Start: Phase 28 - Cache read path (Redis 60s grid)
  try {
    const cached = await redisCacheGet(env, PUBLIC_STATS_KEY);
    if (cached) {
      const parsed = JSON.parse(cached) as PublicStats;
      return { ...parsed, status: 'CACHED' };
    }
  } catch {
    // parse error -> biar jatuh ke live fetch
  }
  // End: Phase 28 - Cache read path

  const base = `${env.SUPABASE_URL}/rest/v1`;
  const headers = {
    apikey: env.SUPABASE_ANON_KEY,
    Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
  };
  try {
    const [shopsRes, ordersRes] = await Promise.all([
      fetch(`${base}/senarai_kedai?select=count`, { headers }),
      fetch(`${base}/rekod_pesanan?select=total_amount`, { headers }),
    ]);
    let totalShops = 0;
    if (shopsRes.ok) {
      const sd = await shopsRes.json();
      totalShops = Array.isArray(sd) && sd[0]?.count ? Number(sd[0].count) : 0;
    }
    let totalOrders = 0;
    let totalGmv = 0;
    if (ordersRes.ok) {
      const od = await ordersRes.json();
      if (Array.isArray(od)) {
        totalOrders = od.length;
        totalGmv = od.reduce((s, r) => s + (parseFloat(r.total_amount) || 0), 0);
      }
    }
    const payload: PublicStats = {
      total_shops: totalShops,
      total_orders: totalOrders,
      total_gmv_rm: Math.round(totalGmv * 100) / 100,
      status: 'OK',
      cached_at: new Date().toISOString(), // Phase 29: inject ISO timestamp write
    };
    // Start: Phase 28 - Cache write path (background, fail-safe)
    try {
      await redisCacheSet(env, PUBLIC_STATS_KEY, JSON.stringify(payload), PUBLIC_STATS_TTL);
    } catch {
      // swallow - cache write bukan kritikal
    }
    // End: Phase 28 - Cache write path
    return payload;
  } catch {
    // Soft-fail (Fasal 7 Strategy 4) - return zeroed safe payload
    return { total_shops: 0, total_orders: 0, total_gmv_rm: 0, status: 'DEGRADED' };
  }
}

// Start: Phase 37 - Merchant-Scoped Sales Summary (22-command matrix)
/**
 * fetchMerchantSalesSummary
 * Kira agregat pendapatan kedai ini dari rekod_pesanan yang TELAH_BAYAR
 * (confirmed paid). Diikat ke merchant_telegram_id -> kedai_id (RLS isolation).
 * Soft-fail: return zero payload jika gagal.
 */
export interface MerchantSalesSummary {
  kedai_id: string;
  total_orders: number;
  paid_orders: number;
  total_earnings_rm: number;
}

export async function fetchMerchantSalesSummary(
  env: Env,
  tgId: number
): Promise<MerchantSalesSummary | null> {
  try {
    // Dapatkan kedai_id dari merchant_telegram_id (RLS bind Fasal 7 S1).
    const shopRes = await fetch(
      `${env.SUPABASE_URL}/rest/v1/senarai_kedai?merchant_telegram_id=eq.${tgId}&select=id&limit=1`,
      { method: 'GET', headers: supabaseHeaders(env) }
    );
    if (!shopRes.ok) return null;
    const shopRows = (await shopRes.json()) as Array<{ id: string }>;
    if (!Array.isArray(shopRows) || shopRows.length === 0) return null;
    const kedaiId = shopRows[0].id;

    const ordRes = await fetch(
      `${env.SUPABASE_URL}/rest/v1/rekod_pesanan?kedai_id=eq.${encodeURIComponent(kedaiId)}&select=status_pembayaran,jumlah_harga`,
      { method: 'GET', headers: supabaseHeaders(env) }
    );
    if (!ordRes.ok) return null;
    const orders = (await ordRes.json()) as Array<{ status_pembayaran?: string; jumlah_harga?: number }>;
    if (!Array.isArray(orders)) return null;

    let paid = 0;
    let earnings = 0;
    for (const o of orders) {
      if (o.status_pembayaran === 'TELAH_BAYAR') {
        paid++;
        earnings += Number(o.jumlah_harga || 0);
      }
    }
    return {
      kedai_id: kedaiId,
      total_orders: orders.length,
      paid_orders: paid,
      total_earnings_rm: Math.round(earnings * 100) / 100,
    };
  } catch {
    return null; // Soft-fail (Fasal 7 Strategy 4)
  }
}
// End: Phase 37 - Merchant-Scoped Sales Summary

// End: JomOrder Fasa 13 - SaaS Analytics Data Layer (File 2)
