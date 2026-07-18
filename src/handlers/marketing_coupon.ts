// Start: Phase 32 - Marketing Coupon Handlers (Merchant Kupon Engine)
// Fasal 4 (SOA) + Fasal 6 (BM UI, escape MarkdownV2) + Fasal 7 S1 (RLS bind merchant_telegram_id).
// Setiap fungsi self-contained, soft-fail (Fasal 7 Strategy 4), tidak throw ke caller.
import { Env } from '../types';
import { sendMessage, escapeMarkdownV2, inlineKeyboard } from '../telegram';

const SUPABASE_REST = (env: Env) => `${env.SUPABASE_URL}/rest/v1`;

/** Header Supabase guna service role (server-side merchant write). */
function svcHeaders(env: Env): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  };
}

/**
 * /cipta_kupon <KOD> <DISKAUN%> <MIN_RM>
 * Cipta rekod kupon diskaun terikat ke merchant semasa.
 */
export async function handleCreateCoupon(
  env: Env,
  chatId: number,
  tgId: number,
  text: string
): Promise<void> {
  try {
    const parts = text.trim().split(/\s+/);
    if (parts.length < 4) {
      await sendMessage(
        env,
        chatId,
        escapeMarkdownV2('⚠️ Format: /cipta_kupon <KOD> <DISKAUN%> <MIN_RM>\nContoh: /cipta_kupon JOM10 10 20')
      );
      return;
    }
    const kod = parts[1].toUpperCase();
    const diskaun = Number(parts[2]);
    const minRm = Number(parts[3]);
    if (!kod || Number.isNaN(diskaun) || Number.isNaN(minRm) || diskaun <= 0 || diskaun > 100) {
      await sendMessage(env, chatId, escapeMarkdownV2('⚠️ Diskaun mesti nombor 1-100. Sila cuba lagi.'));
      return;
    }
    const res = await fetch(`${SUPABASE_REST(env)}/kupon_kedai`, {
      method: 'POST',
      headers: { ...svcHeaders(env), Prefer: 'return=minimal' },
      body: JSON.stringify({
        kod,
        diskaun_peratus: diskaun,
        min_pesanan_rm: minRm,
        merchant_telegram_id: tgId,
        aktif: true,
      }),
    });
    if (!res.ok) {
      await sendMessage(env, chatId, escapeMarkdownV2('⚠️ Gagal cipta kupon. Kod mungkin wujud.'));
      return;
    }
    await sendMessage(
      env,
      chatId,
      escapeMarkdownV2(`✅ Kupon ${kod} dicipta!\\nDiskaun: ${diskaun}%\\nMin: RM${minRm}`)
    );
  } catch {
    await sendMessage(env, chatId, escapeMarkdownV2('⚠️ Ralat sistem. Cuba sebentar lagi.'));
  }
}

/** /senarai_kupon - papar kupon aktif milik merchant (inline grid max 2/row). */
export async function handleListCoupons(env: Env, chatId: number, tgId: number): Promise<void> {
  try {
    const url = `${SUPABASE_REST(env)}/kupon_kedai?merchant_telegram_id=eq.${tgId}&select=kod,diskaun_peratus,min_pesanan_rm,aktif`;
    const res = await fetch(url, { method: 'GET', headers: svcHeaders(env) });
    if (!res.ok) {
      await sendMessage(env, chatId, escapeMarkdownV2('⚠️ Gagal ambil senarai kupon.'));
      return;
    }
    const rows = (await res.json()) as Array<{
      kod: string;
      diskaun_peratus: number;
      min_pesanan_rm: number;
      aktif: boolean;
    }>;
    if (!Array.isArray(rows) || rows.length === 0) {
      await sendMessage(env, chatId, escapeMarkdownV2('📭 Tiada kupon aktif. Taip /cipta_kupon untuk mula.'));
      return;
    }
    const lines = rows
      .map((r) => `🎟️ ${escapeMarkdownV2(r.kod)} \\- ${r.diskaun_peratus}% \\(min RM${r.min_pesanan_rm}\\)`)
      .join('\\n');
    const buttons = rows.map((r) => [{ text: `🗑️ ${r.kod}`, callback_data: `del_coupon:${r.kod}` }]);
    await sendMessage(
      env,
      chatId,
      escapeMarkdownV2('🎟️ KUPON AKTIF:\\n') + lines,
      inlineKeyboard(buttons)
    );
  } catch {
    await sendMessage(env, chatId, escapeMarkdownV2('⚠️ Ralat sistem. Cuba sebentar lagi.'));
  }
}

/** /padam_kupon <KOD> - padam kupon terikat ke merchant (RLS isolation manual). */
export async function handleDeleteCoupon(
  env: Env,
  chatId: number,
  tgId: number,
  text: string
): Promise<void> {
  try {
    const kod = (text.trim().split(/\s+/)[1] || '').toUpperCase();
    if (!kod) {
      await sendMessage(env, chatId, escapeMarkdownV2('⚠️ Format: /padam_kupon <KOD>'));
      return;
    }
    const url = `${SUPABASE_REST(env)}/kupon_kedai?kod=eq.${encodeURIComponent(kod)}&merchant_telegram_id=eq.${tgId}`;
    const res = await fetch(url, { method: 'DELETE', headers: svcHeaders(env) });
    if (!res.ok) {
      await sendMessage(env, chatId, escapeMarkdownV2('⚠️ Gagal padam kupon.'));
      return;
    }
    await sendMessage(env, chatId, escapeMarkdownV2(`🗑️ Kupon ${kod} dipadam.`));
  } catch {
    await sendMessage(env, chatId, escapeMarkdownV2('⚠️ Ralat sistem. Cuba sebentar lagi.'));
  }
}
// End: Phase 32 - Marketing Coupon Handlers