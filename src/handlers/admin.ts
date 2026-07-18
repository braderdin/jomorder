// Start: JomOrder Fasa 13 - Super-Admin Handlers (File 3)
// Fasal 6 (escape MarkdownV2 + mobile emoji) + Fasal 7 Strategy 1 (isolation)
// Modul arahan pentadbir untuk Chip Besar. Cap <150 baris (Fasal 4 SOA).
import { Env } from '../types';
import { escapeMarkdownV2, sendMessage } from '../telegram';
import { fetchSaasMetrics } from '../services/analytics';
import { broadcastAnnouncementSlots } from '../services/admin';

/** Format angka RM dengan 2 titik perpuluhan + pemisah ribu. */
function fmtRm(value: number): string {
  const s = value.toLocaleString('ms-MY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return escapeMarkdownV2(s);
}

/**
 * Terima mesej teks admin. Kembalikan true jika diproses (router stop).
 * Hanya Telegram ID pemilik (ADMIN_TELEGRAM_ID) dibenarkan.
 */
export async function handleAdminMessage(
  env: Env,
  chatId: number,
  tgId: number,
  text: string
): Promise<boolean> {
  const adminId = Number(env.ADMIN_TELEGRAM_ID);
  if (!env.ADMIN_TELEGRAM_ID || Number.isNaN(adminId)) return false;
  if (tgId !== adminId) return false;

  const cmd = text.trim();
  if (cmd === '/admin' || cmd === '/admin_stats') {
    await sendAdminStats(env, chatId);
    return true;
  }
  return false; // bukan arahan admin, router teruskan ke laluan lain
}

/** Bina + hantar laporan metrik SaaS terformat ke admin. */
async function sendAdminStats(env: Env, chatId: number): Promise<void> {
  const m = await fetchSaasMetrics(env);
  if (!m) {
    const err = escapeMarkdownV2('Sila cuba sebentar lagi');
    await sendMessage(env, chatId, `⚠️ *JomOrder SaaS Dashboard*\n\n${err}\\.`);
    return;
  }
  const text =
    `📊 *JomOrder SaaS Dashboard*\n\n` +
    `👑 *Chip Besar Analytics*\n\n` +
    `🏪 *Merchant Aktif:* ${m.total_active_merchants}\n` +
    `⭐ *Kedai Premium:* ${m.total_premium_stores}\n` +
    `💰 *Jumlah Hasil:* RM${fmtRm(m.total_revenue_rm)}\n` +
    `🧾 *Jumlah Pesanan:* ${m.total_orders}\n` +
    `📈 *Unjuran MRR:* RM${fmtRm(m.mrr_projection_rm)}\n\n` +
    `🔒 _Diasing via service\\_role \\(Fasal 7\\)_`;
  await sendMessage(env, chatId, text);
}
// Start: Phase 37 - Administrative Broadcast (pengumuman platform)
/**
 * handlePengumumanBroadcast
 * Hantar pengumuman platform ke semua peniaga berdaftar (Fasal 7 Strategy 1).
 * Hanya ADMIN_TELEGRAM_ID dibenarkan (guard dalam handleAdminMessage).
 * Loop secure: dispatch ke merchant_telegram_id setiap baris.
 */
export async function handlePengumumanBroadcast(
  env: Env,
  chatId: number,
  tgId: number
): Promise<boolean> {
  const adminId = Number(env.ADMIN_TELEGRAM_ID);
  if (!env.ADMIN_TELEGRAM_ID || Number.isNaN(adminId)) return false;
  if (tgId !== adminId) return false;

  try {
    const url = `${env.SUPABASE_URL}/rest/v1/senarai_kedai?select=merchant_telegram_id&status_langganan=neq.TAMAT`;
    const res = await fetch(url, { method: 'GET', headers: supabaseHeaders(env) });
    if (!res.ok) {
      await sendMessage(env, chatId, escapeMarkdownV2('⚠️ Gagal ambil senarai peniaga.'));
      return true;
    }
    const rows = (await res.json()) as Array<{ merchant_telegram_id?: string }>;
    if (!Array.isArray(rows) || rows.length === 0) {
      await sendMessage(env, chatId, escapeMarkdownV2('📭 Tiada peniaga aktif untuk dihantar pengumuman.'));
      return true;
    }
    const ids = rows.map((r) => Number(r.merchant_telegram_id)).filter((id) => id > 0);
    // Phase 38: guna batch rate-limiter slot engine dari services/admin.ts
    const result = await broadcastAnnouncementSlots(
      env,
      ids,
      '📢 PENGUMUMAN JOMORDER:\\nSistem dalam penyelenggaraan berkala. Terima kasih atas sokongan anda!'
    );
    await sendMessage(env, chatId, escapeMarkdownV2(`✅ Pengumuman dihantar ke ${result.sent}/${result.total} peniaga.`));
  } catch {
    await sendMessage(env, chatId, escapeMarkdownV2('⚠️ Ralat menghantar pengumuman.'));
  }
  return true;
}

/** Header Supabase service_role standard (admin module). */
function supabaseHeaders(env: Env): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  };
}
// End: Phase 37 - Administrative Broadcast

// End: JomOrder Fasa 13 - Super-Admin Handlers (File 3)
