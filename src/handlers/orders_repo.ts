// Start: Phase 55 - Orders Repository (Fasal 4 SOA + Fasal 7 S1 RLS binding)
// Util repositori pesanan (read-only query) dikongsi customer + merchant GUI.
import { Env } from '../types';

/** Header Supabase service role (RLS-bound queries). */
function svcHeaders(env: Env): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  };
}

/** Ambil pesanan aktif pelanggan (status lifecycle aktif). */
export async function fetchCustomerActiveOrders(
  env: Env,
  customerTgId: number
): Promise<Array<{ id: number; status_penghantaran?: string; jumlah_harga?: number }>> {
  const url =
    `${env.SUPABASE_URL}/rest/v1/rekod_pesanan` +
    `?customer_telegram_id=eq.${customerTgId}` +
    `&status_penghantaran=in.(PENDING,PREPARING,READY,DELIVERED)` +
    `&select=id,status_penghantaran,jumlah_harga&order=created_at.desc&limit=15`;
  try {
    const res = await fetch(url, { method: 'GET', headers: svcHeaders(env) });
    if (!res.ok) return [];
    const rows = (await res.json()) as Array<{ id: number; status_penghantaran?: string; jumlah_harga?: number }>;
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

/** Ambil sejarah pesanan pelanggan (semua status tamat). */
export async function fetchCustomerOrderHistory(
  env: Env,
  customerTgId: number,
  page = 1
): Promise<Array<{ id: number; status_penghantaran?: string; jumlah_harga?: number; created_at?: string }>> {
  const offset = (page - 1) * 10;
  const url =
    `${env.SUPABASE_URL}/rest/v1/rekod_pesanan` +
    `?customer_telegram_id=eq.${customerTgId}` +
    `&select=id,status_penghantaran,jumlah_harga,created_at` +
    `&order=created_at.desc&limit=10&offset=${offset}`;
  try {
    const res = await fetch(url, { method: 'GET', headers: svcHeaders(env) });
    if (!res.ok) return [];
    const rows = (await res.json()) as Array<{ id: number; status_penghantaran?: string; jumlah_harga?: number; created_at?: string }>;
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}
// End: Phase 55 - Orders Repository