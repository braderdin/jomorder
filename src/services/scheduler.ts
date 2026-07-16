// Start: JomOrder Fasa 6 - Subscription Alert Scheduler (Cron Utility)
// Fasal 4 (SOA) + Fasal 7 Strategy 1 (RLS via service_role, ikat merchant_telegram_id)
// Fasal 6 (BM alert + escape) + Fasal 13 (DDL sync ke tamat_langganan_pada)
// Modul kendiri: scan DB, flag HAMPIR_TAMAT / TAMAT, dispatch amaran Telegram.
// Cache invalidation diasingkan ke redis.invalidateSubscriptionCache (File 4)
// supaya modul ini tak coupling terus ke Redis implementation.

import { Env } from '../types';
import { sendExpiryAlert } from '../subscription';
import { AMARAN_HARI, LanggananStatus } from '../subscription';

/** Hasil scan untuk satu peniaga (digunakan caller bagi invalidate cache). */
export interface ScanResult {
  telegramId: number;
  status: LanggananStatus;
  bakiHari: number; // negatif = telah tamat
}

/** Header Supabase service_role standard. */
function supabaseHeaders(env: Env): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  };
}

/**
 * Kira baki hari sebelum tamat dari timestamp ISO.
 * @returns baki hari (positif = masih ada, negatif = telah tamat).
 */
function kiraBakiHari(tamatIso: string): number {
  const tamat = new Date(tamatIso).getTime();
  const diffMs = tamat - Date.now();
  return Math.ceil(diffMs / 86_400_000);
}

/**
 * Tentukan status flag dari baki hari.
 * <= 0 -> TAMAT, <= AMARAN_HARI -> HAMPIR_TAMAT, else AKTIF.
 */
function flagDariBaki(baki: number): LanggananStatus {
  if (baki <= 0) return 'TAMAT';
  if (baki <= AMARAN_HARI) return 'HAMPIR_TAMAT';
  return 'AKTIF';
}

/**
 * Scan & flag semua peniaga yang langganan hampir tamat atau telah tamat.
 * Query hanya baris relevan (tamat_langganan_pada <= NOW + AMARAN_HARI hari)
 * dan status belum TAMAT, bagi elak traffic penuh (free-tier friendly).
 * Kembalikan ScanResult[] untuk caller jalankan cache invalidation.
 */
export async function scanAndFlagSubscriptions(env: Env): Promise<ScanResult[]> {
  const ambang = new Date(Date.now() + AMARAN_HARI * 86_400_000).toISOString();
  const url =
    `${env.SUPABASE_URL}/rest/v1/senarai_kedai` +
    `?tamat_langganan_pada=lte.${encodeURIComponent(ambang)}` +
    `&status_langganan=neq.TAMAT` +
    `&select=merchant_telegram_id,tamat_langganan_pada`;

  const results: ScanResult[] = [];
  try {
    const res = await fetch(url, { method: 'GET', headers: supabaseHeaders(env) });
    if (!res.ok) return results;
    const rows = (await res.json()) as Array<{
      merchant_telegram_id?: string;
      tamat_langganan_pada?: string;
    }>;
    if (!Array.isArray(rows)) return results;

    for (const row of rows) {
      const tgId = Number(row.merchant_telegram_id);
      if (!row.tamat_langganan_pada || !tgId) continue;
      const baki = kiraBakiHari(row.tamat_langganan_pada);
      const status = flagDariBaki(baki);
      // Persist flag ke DB (RLS bypass service_role)
      const patchUrl = `${env.SUPABASE_URL}/rest/v1/senarai_kedai?merchant_telegram_id=eq.${tgId}`;
      await fetch(patchUrl, {
        method: 'PATCH',
        headers: { ...supabaseHeaders(env), Prefer: 'return=minimal' },
        body: JSON.stringify({ status_langganan: status }),
      });
      results.push({ telegramId: tgId, status, bakiHari: baki });
    }
  } catch {
    // Soft-fail: scheduler silent (Fasal 7 Strategy 4)
  }
  return results;
}

/**
 * Jalankan pusingan penuh scheduler: scan + dispatch amaran Telegram
 * kepada peniaga yang HAMPIR_TAMAT / TAMAT.
 * @returns ScanResult[] supaya caller boleh invalidate cache serentak.
 */
export async function dispatchSubscriptionAlerts(env: Env): Promise<ScanResult[]> {
  const scanned = await scanAndFlagSubscriptions(env);
  for (const r of scanned) {
    if (r.status === 'AKTIF') continue;
    // chat id == telegram id (private bot chat)
    await sendExpiryAlert(env, r.telegramId, r.status, 'Kedai Anda', Math.max(r.bakiHari, 0));
  }
  return scanned;
}

// End: JomOrder Fasa 6 - Subscription Alert Scheduler (Cron Utility)