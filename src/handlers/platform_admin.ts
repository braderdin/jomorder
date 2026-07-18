// Start: Phase 32 - Platform Admin Controller (Protected Super-Admin Ports)
// Fasal 4 (SOA) + Fasal 6 (BM UI) + Fasa 13 (ADMIN_TELEGRAM_ID guard). Soft-fail.
import { Env } from '../types';
import { sendMessage, escapeMarkdownV2 } from '../telegram';
import { fetchSaasMetrics } from '../services/analytics';
import { getSubscriptionStatus } from '../subscription';

const SUPABASE_REST = (env: Env) => `${env.SUPABASE_URL}/rest/v1`;

function svcHeaders(env: Env): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  };
}

/** Phase 34: Dual-token protection guard matriks pentadbir.
 *  Lapisan 1: tgId mesti dalam senarai ADMIN_TELEGRAM_ID.
 *  Lapisan 2: X_TELEGRAM_BOT_API_SECRET_TOKEN mesti wujud (bot secret pin).
 *  Kedua-dua mesti lulus sebelum grid pentadbir dibuka. */
function isAdmin(env: Env, tgId: number): boolean {
  const allowed = (env.ADMIN_TELEGRAM_ID || '').split(',').map((s) => s.trim());
  const layer1 = allowed.includes(String(tgId));
  const layer2 = Boolean(env.X_TELEGRAM_BOT_API_SECRET_TOKEN);
  return layer1 && layer2;
}

/** /admin_stats - agregat metrik SaaS platform untuk pentadbir. */
export async function handleAdminStats(env: Env, chatId: number, tgId: number): Promise<void> {
  if (!isAdmin(env, tgId)) {
    await sendMessage(env, chatId, escapeMarkdownV2('⛔ Akses ditolak.'));
    return;
  }
  try {
    const m = await fetchSaasMetrics(env);
    if (!m) {
      await sendMessage(env, chatId, escapeMarkdownV2('⚠️ Gagal ambil statistik.'));
      return;
    }
    const report =
      escapeMarkdownV2('🛡️ ADMIN STATS:\\n\\n') +
      escapeMarkdownV2(`Peniaga Aktif: ${m.total_active_merchants}\\n`) +
      escapeMarkdownV2(`Stor Premium: ${m.total_premium_stores}\\n`) +
      escapeMarkdownV2(`Jumlah Pesanan: ${m.total_orders}\\n`) +
      escapeMarkdownV2(`Hasil: RM${m.total_revenue_rm.toFixed(2)}\\n`) +
      escapeMarkdownV2(`MRR: RM${m.mrr_projection_rm.toFixed(2)}`);
    await sendMessage(env, chatId, report);
  } catch {
    await sendMessage(env, chatId, escapeMarkdownV2('⚠️ Ralat sistem. Cuba sebentar lagi.'));
  }
}

/** /senarai_pendaftaran - senarai peniaga berdaftar (RLS service role). */
export async function handleSenaraiPendaftaran(env: Env, chatId: number, tgId: number): Promise<void> {
  if (!isAdmin(env, tgId)) {
    await sendMessage(env, chatId, escapeMarkdownV2('⛔ Akses ditolak.'));
    return;
  }
  try {
    const url = `${SUPABASE_REST(env)}/senarai_kedai?select=id,nama_kedai,merchant_telegram_id,status_kedai&order=created_at.desc&limit=20`;
    const res = await fetch(url, { method: 'GET', headers: svcHeaders(env) });
    if (!res.ok) {
      await sendMessage(env, chatId, escapeMarkdownV2('⚠️ Gagal ambil senarai.'));
      return;
    }
    const rows = (await res.json()) as Array<{
      id: string;
      nama_kedai: string;
      merchant_telegram_id: number;
      status_kedai: string;
    }>;
    if (!Array.isArray(rows) || rows.length === 0) {
      await sendMessage(env, chatId, escapeMarkdownV2('📭 Tiada pendaftaran lagi.'));
      return;
    }
    const lines = rows
      .map((r) => `🏪 ${escapeMarkdownV2(r.nama_kedai)} \\- ${escapeMarkdownV2(r.status_kedai)} \\(ID:${r.merchant_telegram_id}\\)`)
      .join('\\n');
    await sendMessage(env, chatId, escapeMarkdownV2('📋 PENDAFTARAN:\\n') + lines);
  } catch {
    await sendMessage(env, chatId, escapeMarkdownV2('⚠️ Ralat sistem. Cuba sebentar lagi.'));
  }
}

/** /naiktaraf - bantu peniaga naik taraf pelan premium (verify hook + trigger pautan). */
export async function handleNaikTaraf(env: Env, chatId: number, tgId: number): Promise<void> {
  try {
    // Wire terus ke premium subscription verification hook (Fasal 7 S1 isolate).
    const status = await getSubscriptionStatus(env, tgId);
    if (status === 'PREMIUM') {
      await sendMessage(
        env,
        chatId,
        escapeMarkdownV2('⭐ Anda sudah PREMIUM! Nikmati semua ciri tanpa had 🚀')
      );
      return;
    }
    const msg =
      escapeMarkdownV2('⭐ NAIKTARAF PREMIUM\\n\\n') +
      escapeMarkdownV2(`Status semasa: ${status}\\n\\n`) +
      escapeMarkdownV2('Dapatkan stor tanpa had, analitik lanjutan & sokongan prioritas.\\n') +
      escapeMarkdownV2('Sila lawati portal JomOrder untuk pilih pelan.');
    await sendMessage(env, chatId, msg);
  } catch {
    await sendMessage(env, chatId, escapeMarkdownV2('⚠️ Ralat sistem. Cuba sebentar lagi.'));
  }
}
// End: Phase 32 - Platform Admin Controller