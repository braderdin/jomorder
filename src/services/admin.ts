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
export async function notifyAdminNewApplication(
  env: Env,
  adminChatId: number,
  app: PendingApplication
): Promise<void> {
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
// End: JomOrder Fasa 8