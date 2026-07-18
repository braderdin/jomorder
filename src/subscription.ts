// Start: JomOrder Fasa 5 - SaaS Subscription Control Module (Fail 1)
// Fasal 4 (SOA) + Fasal 6 (escape + BM alert) + Fasal 7 Strategy 1 (RLS via service_role)
// Fasa 5: Kawalan Langganan & Grace Period untuk halang carian pelanggan apabila 'TAMAT'.

import { Env } from './types';
import { sendMessage, escapeMarkdownV2 } from './telegram';
import { getSubscriptionCache, setSubscriptionCache } from './redis';

/** Status langganan peniaga (selaras schema senarai_kedai.status_langganan). */
// Start: Fasa 16 Premium Tier Core Hardening - tambah 'PREMIUM' ke union
export type LanggananStatus = 'AKTIF' | 'HAMPIR_TAMAT' | 'TAMAT' | 'PREMIUM';
// End: Fasa 16 Premium Tier Core Hardening

/** Ambang amaran: bilangan hari sebelum tamat untuk flag HAMPIR_TAMAT. */
export const AMARAN_HARI = 7;

/**
 * Tukar string DB ke enum LanggananStatus selamat.
 * Jika kosong/asing, anggap 'AKTIF' (fail-open supaya tiada false-block).
 */
// Start: Fasa 16 Premium Tier Core Hardening - handle 'PREMIUM' natively (no AKTIF fallback)
export function normalizeLangganan(raw: string | null | undefined): LanggananStatus {
  if (raw === 'TAMAT') return 'TAMAT';
  if (raw === 'HAMPIR_TAMAT') return 'HAMPIR_TAMAT';
  if (raw === 'PREMIUM') return 'PREMIUM';
  return 'AKTIF';
}
// End: Fasa 16 Premium Tier Core Hardening

/**
 * Dapatkan status langganan peniaga dengan Redis cache-first pattern.
 * Setiap mesej masuk periksa Redis (sub:{id}) dulu sebelum tembak Supabase
 * untuk lindungi free-tier quota dari traffic spike (Fasal 7 Strategy 2).
 * RLS bypass via service_role; query diikat ke merchant_telegram_id (Fasal 7 S1).
 * Soft-fail: jika gagal, return 'AKTIF' (fail-open, Fasal 7 S4).
 */
export async function getSubscriptionStatus(
  env: Env,
  telegramId: number
): Promise<LanggananStatus> {
  // Fast-path: Redis cache (Fasal 7 Strategy 2)
  const cached = await getSubscriptionCache(env, telegramId);
  if (cached) return normalizeLangganan(cached);

  const url = `${env.SUPABASE_URL}/rest/v1/senarai_kedai?merchant_telegram_id=eq.${telegramId}&select=status_langganan&limit=1`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });
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

/** True jika akaun telah tamat langganan. */
export function isExpired(status: LanggananStatus): boolean {
  return status === 'TAMAT';
}

/** True jika akaun perlu amaran (hampir tamat). */
export function needsWarning(status: LanggananStatus): boolean {
  return status === 'HAMPIR_TAMAT';
}

/**
 * Format amaran langganan ke layout Telegram (Bahasa Malaysia formal).
 * Semua nilai berubah di-escape untuk elak parsing crash (Fasal 6).
 */
export function formatExpiryAlert(
  status: LanggananStatus,
  shopName: string,
  bakiHari?: number
): string {
  const nama = escapeMarkdownV2(shopName || 'Kedai Anda');
  if (status === 'TAMAT') {
    return (
      '⛔ *Langganan Tamat*\\n\\n' +
      `Hey *${nama}*, akaun JomOrder anda telah *TAMAT*\\. ` +
      'Carian pelanggan baharu telah disekat\\. ' +
      'Pesanan sedang berjalan masih dibenarkan sehingga siap\\. ' +
      'Sila perbaharui langganan untuk sambung operasi 🤝'
    );
  }
  if (status === 'HAMPIR_TAMAT') {
    const baki = bakiHari != null ? ` (baki ${bakiHari} hari)` : '';
    return (
      '⚠️ *Amaran Langganan*\\n\\n' +
      `Hey *${nama}*, langganan anda *HAMPIR TAMAT*${baki}\\. ` +
      'Cepat perbaharui sebelum pelanggan baharu tidak dapat menjumpai kedai anda 🔔'
    );
  }
  return (
    '✅ *Langganan Aktif*\\n\\n' +
    `Hey *${nama}*, langganan anda masih *AKTIF*\\. Terima kasih! 🚀`
  );
}

/**
 * Hantar amaran langganan ke peniaga.
 * Guard: hanya hantar jika TAMAT atau HAMPIR_TAMAT (elak spam AKTIF).
 */
export async function sendExpiryAlert(
  env: Env,
  chatId: number,
  status: LanggananStatus,
  shopName: string,
  bakiHari?: number
): Promise<void> {
  if (status === 'AKTIF') return;
  await sendMessage(env, chatId, formatExpiryAlert(status, shopName, bakiHari));
}

/**
 * verifyPremiumRealtime - semakan premium masa nyata TANPA cache Redis.
 * Digunakan oleh hook naiktaraf & aliran SaaS kritikal untuk elak stale cache
 * (Fasal 7 Strategy 1: query diikat ke merchant_telegram_id). Soft-fail -> false.
 */
export async function verifyPremiumRealtime(
  env: Env,
  telegramId: number
): Promise<boolean> {
  const url = `${env.SUPABASE_URL}/rest/v1/senarai_kedai?merchant_telegram_id=eq.${telegramId}&select=status_langganan&limit=1`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });
    if (!res.ok) return false;
    const rows = (await res.json()) as Array<{ status_langganan?: string }>;
    if (!Array.isArray(rows) || rows.length === 0) return false;
    return rows[0].status_langganan === 'PREMIUM';
  } catch {
    return false;
  }
}

// End: JomOrder Fasa 5 - SaaS Subscription Control Module (Fail 1)
