// Start: JomOrder Fasa 13 - SaaS Analytics Data Layer (File 2)
// Fasal 13 (Super-Admin Analytics Portal) + Fasal 4 (SOA) + Fasal 7 Strategy 1 (service_role RLS bypass)
// Native fetch-based PostgREST client untuk jalankan RPC get_saas_metrics().
// Tiada dependency luaran = free-tier footprint.

import { Env } from '../types';

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
    return {
      total_active_merchants: Number(data.total_active_merchants ?? 0),
      total_premium_stores: Number(data.total_premium_stores ?? 0),
      total_revenue_rm: Number(data.total_revenue_rm ?? 0),
      total_orders: Number(data.total_orders ?? 0),
      mrr_projection_rm: Number(data.mrr_projection_rm ?? 0),
    };
  } catch {
    return null; // Soft-fail (Fasal 7 Strategy 4)
  }
}
// End: JomOrder Fasa 13 - SaaS Analytics Data Layer (File 2)