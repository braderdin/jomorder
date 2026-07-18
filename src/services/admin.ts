// Start: JomOrder Fasa 8 - Admin Approval Gateway Controller
// Fasal 6 (escape MarkdownV2 + mobile inline 2-btn/row) + Fasal 7 Strategy 1.

import { Env } from '../types';
import { escapeMarkdownV2, inlineKeyboard, sendMessage } from '../telegram';

export interface PendingApplication {
  shopId: string;
  shopName: string;
  merchantTgId: number;
  daerah?: string;
}

// Bina inline keyboard gatekeeper dengan nod payload approve/reject (Fasal 6).
export function buildApprovalInlineKeyboard(shopId: string, merchantTgId: number) {
  return inlineKeyboard([
    [
      { text: '🟢 LULUSKAN', callback_data: `approve_shop:${shopId}:${merchantTgId}` },
      { text: '🔴 TOLAK', callback_data: `reject_shop:${shopId}:${merchantTgId}` },
    ],
  ]);
}

// Hantar kad permohonan baharu ke admin dengan butang kelulusan.
// Fasa 10: consume env.ADMIN_TELEGRAM_ID secara native (buang argumen manual adminChatId).
export async function notifyAdminNewApplication(
  env: Env,
  app: PendingApplication
): Promise<void> {
  const adminChatId = Number(env.ADMIN_TELEGRAM_ID);
  if (!env.ADMIN_TELEGRAM_ID || Number.isNaN(adminChatId)) {
    throw new Error('ADMIN_TELEGRAM_ID tiada/config rosak dalam env');
  }
  const name = escapeMarkdownV2(app.shopName);
  const daerah = app.daerah ? escapeMarkdownV2(app.daerah) : '\\-';
  const text =
    `📋 *Permohonan Kedai Baharu*\n\n` +
    `🏪 *Nama:* ${name}\n` +
    `🆔 *ID:* \`${app.shopId}\`\n` +
    `👤 *Peniaga:* \`${app.merchantTgId}\`\n` +
    `📍 *Daerah:* ${daerah}\n\n` +
    `Sila semak dan buat keputusan\\.`;
  await sendMessage(
    env,
    adminChatId,
    text,
    buildApprovalInlineKeyboard(app.shopId, app.merchantTgId)
  );
}

// Kapsyen pengesahan selepas admin klik (dipanggil dari handler).
export function buildDecisionCaption(approved: boolean, shopName: string): string {
  const name = escapeMarkdownV2(shopName);
  return approved
    ? `✅ Kedai *${name}* telah *DILULUSKAN*\\.`
    : `⛔ Kedai *${name}* telah *DITOLAK*\\.`;
}

// Start: Phase 38 - Batch Rate-Limiter Slot Engine for Bulk Announcements
/**
 * Hasil satu pusingan broadcast pukal.
 */
export interface BroadcastResult {
  sent: number;
  total: number;
  failed: number;
}

/**
 * broadcastAnnouncementSlots
 * Bahagikan senarai ID penerima kepada slot berperingkat supaya tidak melanggar
 * had 30-request/syarat Telegram API. Setiap slot = 20 mesej, diikuti rehat
 * 1000ms sebelum slot seterusnya. Soft-fail: kegagalan per-mesej tidak hentikan
 * keseluruhan loop (Fasal 7 Strategy 4).
 *
 * @param env bindings Worker
 * @param recipientIds senarai merchant_telegram_id (sudah ditapis >0)
 * @param message teks pengumuman (sudah escape oleh pemanggil)
 * @param slotSize saiz slot (default 20, selamat di bawah 30/sec)
 * @param slotDelayMs rehat antara slot (default 1000ms)
 */
export async function broadcastAnnouncementSlots(
  env: Env,
  recipientIds: number[],
  message: string,
  slotSize = 20,
  slotDelayMs = 1000
): Promise<BroadcastResult> {
  let sent = 0;
  let failed = 0;
  const total = recipientIds.length;

  for (let i = 0; i < total; i += slotSize) {
    const slot = recipientIds.slice(i, i + slotSize);
    await Promise.all(
      slot.map(async (id) => {
        try {
          await sendMessage(env, id, message);
          sent++;
        } catch {
          failed++; // swallow per-recipient failure
        }
      })
    );
    // Rehat antara slot untuk patuh had 30 req/sec Telegram.
    if (i + slotSize < total) {
      await new Promise((resolve) => setTimeout(resolve, slotDelayMs));
    }
  }

  return { sent, total, failed };
}
// End: Phase 38 - Batch Rate-Limiter Slot Engine for Bulk Announcements
// End: JomOrder Fasa 8
