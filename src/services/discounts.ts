// Start: JomOrder Fasa 14 - Dynamic Discount Engine (File 2)
// Fasal 4 (SOA) + Fasal 7 Strategy 1 (RLS kedai_id binding) + Fasal 13 (DDL sync)
// Native fetch-based PostgREST client untuk jadual kempen_diskaun.
// Tiada dependency luaran = free-tier footprint.

import { Env } from '../types';

/** Rekod kempen diskaun (selari dengan jadual kempen_diskaun). */
export interface CampaignDiscount {
  id: number;
  kedai_id: string;
  kod_kupon: string;
  jenis_diskaun: 'PERCENT' | 'AMOUNT';
  nilai_diskaun: number;
  status_aktif: boolean;
  tamat_pada: string | null;
  created_at: string;
}

/** Standard Supabase auth headers menggunakan service_role (server-side only). */
function supabaseHeaders(env: Env): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  };
}

/** Phase 34: Generate transactional tracking reference untuk audit trail. */
function genTxRef(prefix: string, merchantTgId: number): string {
  return `${prefix}_${Date.now()}_${merchantTgId}_${Math.floor(Math.random() * 1e6)}`;
}

/**
 * Dapatkan kedai_id (UUID) daripada merchant_telegram_id.
 * Diikat untuk pengasingan multi-tenant (Fasal 7 Strategy 1).
 * Soft-fail: return null jika gagal.
 */
export async function getKedaiIdByTgId(env: Env, tgId: number): Promise<string | null> {
  const url = `${env.SUPABASE_URL}/rest/v1/senarai_kedai?merchant_telegram_id=eq.${tgId}&select=id&limit=1`;
  try {
    const res = await fetch(url, { method: 'GET', headers: supabaseHeaders(env) });
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{ id: string }>;
    return Array.isArray(rows) && rows.length > 0 ? rows[0].id : null;
  } catch {
    return null; // Soft-fail (Fasal 7 Strategy 4)
  }
}

/**
 * Cipta kupon baharu untuk kedai peniaga.
 * @returns true jika INSERT berjaya
 */
export async function createCoupon(
  env: Env,
  merchantTgId: number,
  kodKupon: string,
  jenis: 'PERCENT' | 'AMOUNT',
  nilai: number
): Promise<boolean> {
  const kedaiId = await getKedaiIdByTgId(env, merchantTgId);
  if (!kedaiId) return false;
  const url = `${env.SUPABASE_URL}/rest/v1/kempen_diskaun`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { ...supabaseHeaders(env), Prefer: 'return=minimal' },
      body: JSON.stringify({
        kedai_id: kedaiId,
        kod_kupon: kodKupon.toUpperCase(),
        jenis_diskaun: jenis,
        nilai_diskaun: nilai,
        status_aktif: true,
      }),
    });
    return res.ok;
  } catch {
    return false; // Soft-fail (Fasal 7 Strategy 4)
  }
}

/**
 * Senarai semua kupon milik kedai peniaga.
 * Soft-fail: return [] jika gagal.
 */
export async function listCoupons(env: Env, merchantTgId: number): Promise<CampaignDiscount[]> {
  const kedaiId = await getKedaiIdByTgId(env, merchantTgId);
  if (!kedaiId) return [];
  const url = `${env.SUPABASE_URL}/rest/v1/kempen_diskaun?kedai_id=eq.${kedaiId}&order=created_at.desc`;
  try {
    const res = await fetch(url, { method: 'GET', headers: supabaseHeaders(env) });
    if (!res.ok) return [];
    const rows = (await res.json()) as CampaignDiscount[];
    return Array.isArray(rows) ? rows : [];
  } catch {
    return []; // Soft-fail (Fasal 7 Strategy 4)
  }
}

/**
 * Validasi kod kupon terhadap status aktif + tarikh luput.
 * Jika kedaiId diberi, kupon mesti sepadan dengan kedai tersebut (pengasingan multi-tenant).
 * @returns CampaignDiscount jika sah, atau null jika tidak sah/tamat.
 */
export async function validateCoupon(
  env: Env,
  kodKupon: string,
  kedaiId?: string
): Promise<CampaignDiscount | null> {
  let url = `${env.SUPABASE_URL}/rest/v1/kempen_diskaun?kod_kupon=eq.${encodeURIComponent(kodKupon.toUpperCase())}&status_aktif=eq.true&limit=1`;
  if (kedaiId) url += `&kedai_id=eq.${kedaiId}`;
  try {
    const res = await fetch(url, { method: 'GET', headers: supabaseHeaders(env) });
    if (!res.ok) return null;
    const rows = (await res.json()) as CampaignDiscount[];
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const kupon = rows[0];
    // Semak tarikh luput (jika di-set)
    if (kupon.tamat_pada) {
      const tamat = new Date(kupon.tamat_pada).getTime();
      if (!isNaN(tamat) && Date.now() > tamat) return null; // Tamat tempoh
    }
    return kupon;
  } catch {
    return null; // Soft-fail (Fasal 7 Strategy 4)
  }
}

/**
 * Kira jumlah akhir selepas diskaun diaplikasikan ke subtotal cart.
 * PERCENT: tolak (nilai% daripada subtotal). AMOUNT: tolak nilai tetap (RM).
 * Jaminan: jumlah tidak pernah negatif (minimum 0).
 */
export function applyDiscount(coupon: CampaignDiscount, subtotal: number): number {
  if (!coupon || subtotal <= 0) return subtotal;
  let final = subtotal;
  if (coupon.jenis_diskaun === 'PERCENT') {
    final = subtotal * (1 - coupon.nilai_diskaun / 100);
  } else if (coupon.jenis_diskaun === 'AMOUNT') {
    final = subtotal - coupon.nilai_diskaun;
  }
  // Jangan benar harga negatif
  if (final < 0) final = 0;
  return Math.round(final * 100) / 100;
}

// End: JomOrder Fasa 14 - Dynamic Discount Engine (File 2)