// Start: JomOrder Fasa 6 - Subscription Alert Scheduler (Cron Utility)
// Fasal 4 (SOA) + Fasal 7 Strategy 1 (RLS via service_role, ikat merchant_telegram_id)
// Fasal 6 (BM alert + escape) + Fasal 13 (DDL sync ke tamat_langganan_pada)
// Modul kendiri: scan DB, flag HAMPIR_TAMAT / TAMAT, dispatch amaran Telegram.
// Cache invalidation diasingkan ke redis.invalidateSubscriptionCache (File 4)
// supaya modul ini tak coupling terus ke Redis implementation.

import { Env } from '../types';
import { sendExpiryAlert } from '../subscription';
import { AMARAN_HARI, LanggananStatus } from '../subscription';
import { fetchSaasMetrics } from './analytics';
import { sendMessage, escapeMarkdownV2 } from '../telegram';

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
 * Dispatch amaran "7 hari lagi" terus ke node Telegram peniaga yang
 * status_langganan == AKTIF dan baki tamat == AMARAN_HARI (7 hari).
 * Bypas node admin sepenuhnya (chat id == merchant_telegram_id).
 * IPv4 Direct Pooler Mandate (Fasal 11): REST API menembak pooler
 * aws-0-ap-southeast-1.pooler.supabase.com dengan Bearer service_role.
 */
async function dispatchAktifSevenDayAlerts(env: Env): Promise<void> {
  // Ambil tetingkap 8 hari akan datang supaya selamat floating-point.
  const ambang = new Date(Date.now() + (AMARAN_HARI + 1) * 86_400_000).toISOString();
  const url =
    `${env.SUPABASE_URL}/rest/v1/senarai_kedai` +
    `?status_langganan=eq.AKTIF` +
    `&tamat_langganan_pada=lte.${encodeURIComponent(ambang)}` +
    `&select=merchant_telegram_id,tamat_langganan_pada`;

  try {
    const res = await fetch(url, { method: 'GET', headers: supabaseHeaders(env) });
    if (!res.ok) return;
    const rows = (await res.json()) as Array<{
      merchant_telegram_id?: string;
      tamat_langganan_pada?: string;
    }>;
    if (!Array.isArray(rows)) return;

    for (const row of rows) {
      const tgId = Number(row.merchant_telegram_id);
      if (!row.tamat_langganan_pada || !tgId) continue;
      const baki = kiraBakiHari(row.tamat_langganan_pada);
      // Hanya dispatch jika TEPAT 7 hari lagi (AMARAN_HARI).
      if (baki !== AMARAN_HARI) continue;
      // Bypass admin: terus ke chat peniaga (private bot chat).
      await sendExpiryAlert(env, tgId, 'AKTIF', 'Kedai Anda', baki);
    }
  } catch {
    // Soft-fail: scheduler silent (Fasal 7 Strategy 4)
  }
}

/**
 * Jalankan pusingan penuh scheduler:
 * 1) Dispatch amaran "7 hari lagi" ke peniaga AKTIF (bypass admin).
 * 2) Scan + flag peniaga HAMPIR_TAMAT / TAMAT untuk cache invalidation.
 * @returns ScanResult[] supaya caller boleh invalidate cache serentak.
 */
export async function dispatchSubscriptionAlerts(env: Env): Promise<ScanResult[]> {
  // Step 1: amaran 7-hari ke node peniaga (tiada sentuh admin).
  await dispatchAktifSevenDayAlerts(env);

  // Step 2: flag + amaran tamat (logik sedia ada).
  const scanned = await scanAndFlagSubscriptions(env);
  for (const r of scanned) {
    if (r.status === 'AKTIF') continue;
    // chat id == telegram id (private bot chat)
    await sendExpiryAlert(env, r.telegramId, r.status, 'Kedai Anda', Math.max(r.bakiHari, 0));
  }
  return scanned;
}

// Start: Phase 37 - SaaS Pulse Report Engine (Cron dispatcher ke ADMIN)
/**
 * triggerSaasPulseReport
 * Tarik metrik serverless (fetchSaasMetrics) dan compile payload MarkdownV2
 * bertemakan "cyber" untuk dihantar ke ADMIN_TELEGRAM_ID.
 * Digunakan oleh index.ts POST /cron/saas-pulse (Fasal 10 secret guard).
 * @returns true jika berjaya dihantar ke admin.
 */
export async function triggerSaasPulseReport(env: Env): Promise<boolean> {
  const adminId = Number(env.ADMIN_TELEGRAM_ID);
  if (!env.ADMIN_TELEGRAM_ID || Number.isNaN(adminId)) return false;
  try {
    const m = await fetchSaasMetrics(env);
    if (!m) return false;
    const ts = new Date().toLocaleString('ms-MY', { timeZone: 'Asia/Kuala_Lumpur' });
    const pulse =
      escapeMarkdownV2('**JOMORDER :: SaaS PULSE**\n') +
      escapeMarkdownV2('```\n') +
      escapeMarkdownV2(`[PULSE] ${ts}\n`) +
      escapeMarkdownV2(`> Merchant Aktif : ${m.total_active_merchants}\n`) +
      escapeMarkdownV2(`> Kedai Premium  : ${m.total_premium_stores}\n`) +
      escapeMarkdownV2(`> Jumlah Pesanan : ${m.total_orders}\n`) +
      escapeMarkdownV2(`> Hasil Kumulatif: RM${m.total_revenue_rm.toFixed(2)}\n`) +
      escapeMarkdownV2(`> Unjuran MRR    : RM${m.mrr_projection_rm.toFixed(2)}\n`) +
      escapeMarkdownV2('```\n') +
      escapeMarkdownV2('_Sistem stabil \\- MDEC GLOW Phase 37_');
    await sendMessage(env, adminId, pulse);
    return true;
  } catch {
    // Soft-fail: scheduler silent (Fasal 7 Strategy 4)
    return false;
  }
}
// Start: Phase 40 - Webhook Heartbeat Cron Validation (telemetry drift guard)
/**
 * runWebhookHeartbeatCheck
 * Siasat kesihatan endpoint worker secara berkala (cron). Tarik /health dan
 * /smoke; jika /health jatuh (DRIFT_DETECTED), rekam telemetry audit. Fail-open:
 * ralat fetch tidak throw (Fasal 7 Strategy 4).
 * @returns true jika pulse sihat, false jika drift kesan.
 */
export async function runWebhookHeartbeatCheck(env: Env, baseUrl = 'http://localhost:8787'): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/health`, { method: 'GET' });
    const body = res.ok ? await res.text() : '';
    const healthy = body === 'OK';
    await auditTelemetryHealth(env, {
      component: 'webhook_heartbeat',
      status: healthy ? 'OK' : 'DRIFT_DETECTED',
      detail_json: { health_body: body.slice(0, 60) },
    });
    return healthy;
  } catch {
    // Network drop -> anggap drift tapi jangan crash scheduler.
    try {
      await auditTelemetryHealth(env, {
        component: 'webhook_heartbeat',
        status: 'DRIFT_DETECTED',
        detail_json: { note: 'fetch_failed' },
      });
    } catch {
      // swallow
    }
    return false;
  }
}

/** Helper audit telemetry dalam scheduler tanpa import cycle (local copy). */
async function auditTelemetryHealth(env: Env, rec: { component: string; status: string; detail_json: Record<string, unknown> }): Promise<void> {
  try {
    await fetch(`${env.SUPABASE_URL}/rest/v1/audit_telemetry_health`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        component: rec.component,
        status: rec.status,
        detail_json: rec.detail_json,
      }),
    });
  } catch {
    // swallow - telemetry bukan kritikal
  }
}
// End: Phase 40 - Webhook Heartbeat Cron Validation

// Start: Phase 49 - Daily Coupon Expiry Sweep Dispatcher
/**
 * runDailyCouponSweep
 * Jalankan sweepExpiredCoupons (discounts.ts) bagi matikan kupon tamat
 * secara automatik + notify peniaga. Dipanggil dari cron /cron/coupon-sweep.
 * Soft-fail: return 0 jika gagal (Fasal 7 Strategy 4).
 * @returns bilangan kupon yang ditutup
 */
export async function runDailyCouponSweep(env: Env): Promise<number> {
  try {
    const { sweepExpiredCoupons } = await import('./discounts');
    return await sweepExpiredCoupons(env);
  } catch {
    return 0; // Soft-fail (Fasal 7 Strategy 4)
  }
}
// End: Phase 49 - Daily Coupon Expiry Sweep Dispatcher

// End: Phase 37 - SaaS Pulse Report Engine

// End: JomOrder Fasa 6 - Subscription Alert Scheduler (Cron Utility)
