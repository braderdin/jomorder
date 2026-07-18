// Start: Phase 30 - Customer Push Notification Utility (LOOP 1 File 2)
// Fasal 6 (MarkdownV2 escape) + Fasal 4 (SOA notification module)
// Fasal 7 Strategy 4 (soft-fail safe) - jangan biarkan push gagal keras.
import { Env } from '../types';
import { sendMessage, escapeMarkdownV2 } from '../telegram';

/**
 * Hantar alert status pesanan kepada pelanggan secara real-time.
 * customerTgId: string Telegram ID pelanggan (daripada rekod_pesanan).
 * statusText: teks status mesra pengguna (sudah dalam BM).
 * Kembalian: boolean (true = hantar berjaya).
 */
export async function sendCustomerStatusAlert(
  env: Env,
  customerTgId: string,
  statusText: string
): Promise<boolean> {
  try {
    const header = escapeMarkdownV2('🔔 KEMASKINI PESANAN JomOrder');
    const body = escapeMarkdownV2(statusText);
    const payload = `${header}\\n\\n${body}`;
    const chatId = Number(customerTgId);
    if (Number.isNaN(chatId)) return false;
    const res = await sendMessage(env, chatId, payload, undefined);
    return res.ok;
  } catch {
    // Soft-fail (Fasal 7 Strategy 4): jangan crash webhook bila push gagal.
    return false;
  }
}
// End: Phase 30 - Customer Push Notification Utility