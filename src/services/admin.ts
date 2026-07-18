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
 * had 30-request/syarat Telegram API. Setiap slot = 25 mesej, diikuti rehat
 * 700ms sebelum slot seterusnya. Soft-fail: kegagalan per-mesej tidak hentikan
 * keseluruhan loop (Fasal 7 Strategy 4).
 *
 * @param env bindings Worker
 * @param recipientIds senarai merchant_telegram_id (sudah ditapis >0)
 * @param message teks pengumuman (sudah escape oleh pemanggil)
 * @param slotSize saiz slot (default 25, selamat di bawah 30/sec)
 * @param slotDelayMs rehat antara slot (default 700ms)
 */
export async function broadcastAnnouncementSlots(
  env: Env,
  recipientIds: number[],
  message: string,
  slotSize = 25,
  slotDelayMs = 700
): Promise<BroadcastResult> {
  let sent = 0;
  let failed = 0;
  const total = recipientIds.length;

  for (let i = 0; i < total; i += slotSize) {
    const slot = recipientIds.slice(i, i + slotSize);
    // Phase 40: Telemetry logging cycle - rekod progres slot ke audit trail.
    await auditBroadcastProgress(env, i / slotSize + 1, total, slot.length);
    // Hantar serentak dalam slot (25) - di bawah had 30/sec Telegram.
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
    // Rehat antara slot untuk patuh had 30 req/sec Telegram dengan margin.
    if (i + slotSize < total) {
      await new Promise((resolve) => setTimeout(resolve, slotDelayMs));
    }
  }

  // Phase 40: Telemetry logging cycle - rekod kesimpulan broadcast pukal.
  await auditBroadcastProgress(env, 0, total, 0, { sent, failed, finished: true });
  return { sent, total, failed };
}

/**
 * auditBroadcastProgress
 * Tulis log telemetry ke audit_telemetry_health (migration 010) untuk jejak
 * kitaran broadcast pukal Super-Admin. Soft-fail: sebarang ralat ditelan.
 * @param slotNo nombor slot semasa (0 = ringkasan akhir)
 * @param total jumlah penerima keseluruhan
 * @param slotSize saiz slot dihantar
 * @param summary ringkasan akhir (sent/failed) bila slotNo=0
 */
async function auditBroadcastProgress(
  env: Env,
  slotNo: number,
  total: number,
  slotSize: number,
  summary?: { sent: number; failed: number; finished: boolean }
): Promise<void> {
  try {
    await fetch(`${env.SUPABASE_URL}/rest/v1/audit_telemetry_health`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        component: 'admin_broadcast',
        status: summary?.finished ? 'DONE' : 'IN_PROGRESS',
        detail_json: summary?.finished
          ? { sent: summary.sent, failed: summary.failed, total }
          : { slot_no: slotNo, slot_size: slotSize, total },
      }),
    });
  } catch {
    // swallow - telemetry bukan kritikal (Fasal 7 S4)
  }
}
// End: Phase 38 - Batch Rate-Limiter Slot Engine for Bulk Announcements
// End: JomOrder Fasa 8
