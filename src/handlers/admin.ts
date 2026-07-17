// Start: JomOrder Fasa 13 - Super-Admin Handlers (File 3)
// Fasal 6 (escape MarkdownV2 + mobile emoji) + Fasal 7 Strategy 1 (isolation)
// Modul arahan pentadbir untuk Chip Besar. Cap <150 baris (Fasal 4 SOA).
import { Env } from '../types';
import { escapeMarkdownV2, sendMessage } from '../telegram';
import { fetchSaasMetrics } from '../services/analytics';

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
// End: JomOrder Fasa 13 - Super-Admin Handlers (File 3)