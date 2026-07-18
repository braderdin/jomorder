// Start: Phase 32 - Customer Commerce Extension (Fasa 24/25 navigation upgrade)
// Fasal 4 (SOA) + Fasal 6 (BM UI) + Fasal 7 S3 (cart buffer). Deep-link ?startapp=kedai_id.
import { Env, TelegramUser } from '../types';
import { sendMessage, escapeMarkdownV2, inlineKeyboard } from '../telegram';
import { handleCustomerNearby, handleAddToCart, handleViewShopMenu } from './customer';

const SUPABASE_REST = (env: Env) => `${env.SUPABASE_URL}/rest/v1`;

/** Header service-role untuk sinkron schema tracking pelanggan (Fasal 7 S1). */
function svcHeaders(env: Env): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  };
}

/**
 * Naiktaraf /start untuk parse deep-link token (?startapp=kedai_id).
 * Jika payload ada kedai_id, terus buka web-app menu kedai tersebut.
 */
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** Phase 34: Sahkan kedai wujud & aktif sebelum redirect deep-link. */
async function kedaiWujud(env: Env, kedaiId: string): Promise<boolean> {
  try {
    const url = `${SUPABASE_REST(env)}/senarai_kedai?id=eq.${encodeURIComponent(kedaiId)}&status_kedai=neq.MENUNGGU_PENGESAHAN&select=id&limit=1`;
    const res = await fetch(url, { method: 'GET', headers: svcHeaders(env) });
    if (!res.ok) return false;
    const rows = (await res.json()) as Array<{ id: string }>;
    return Array.isArray(rows) && rows.length > 0;
  } catch {
    return false;
  }
}

export async function handleStartDeepLink(
  env: Env,
  chatId: number,
  user: TelegramUser,
  payload?: string
): Promise<void> {
  try {
    if (payload && payload.startsWith('kedai_id=')) {
      const kedaiId = payload.slice('kedai_id='.length).trim();
      // Phase 34: Reject non-UUID / malformed deep-link tokens.
      if (!kedaiId || !UUID_RE.test(kedaiId)) {
        await sendMessage(env, chatId, escapeMarkdownV2('⚠️ Pautan kedai tidak sah.'));
        return;
      }
      // Phase 34: Sahkan kedai wujud sebelum redirect (anti-orphan redirect).
      if (!(await kedaiWujud(env, kedaiId))) {
        await sendMessage(env, chatId, escapeMarkdownV2('⚠️ Kedai tidak dijumpai atau belum aktif.'));
        return;
      }
      await handleViewShopMenu(env, chatId, user.id, kedaiId);
      return;
    }
    // Fallback: greeting default dengan keyboard nav pelanggan.
    await sendMessage(
      env,
      chatId,
      escapeMarkdownV2('👋 Selamat datang ke JomOrder!\\nGuna butang di bawah untuk mula memesan.')
    );
  } catch {
    await sendMessage(env, chatId, escapeMarkdownV2('⚠️ Ralat sistem. Cuba sebentar lagi.'));
  }
}

/** /cari_makan - cari kedai makan berdekatan (haversine via customer handler). */
export async function handleCariMakan(env: Env, chatId: number, tgId: number): Promise<void> {
  try {
    await handleCustomerNearby(env, chatId, tgId);
  } catch {
    await sendMessage(env, chatId, escapeMarkdownV2('⚠️ Ralat sistem. Cuba sebentar lagi.'));
  }
}

/** /pesanan_saya - senarai pesanan aktif pelanggan (RLS bind tgId). */
export async function handlePesananSaya(env: Env, chatId: number, tgId: number): Promise<void> {
  try {
    const url = `${SUPABASE_REST(env)}/rekod_pesanan?pelanggan_telegram_id=eq.${tgId}&select=id,status_pesanan,total_rm,kedai_id,created_at&order=created_at.desc&limit=10`;
    const res = await fetch(url, { method: 'GET', headers: svcHeaders(env) });
    if (!res.ok) {
      await sendMessage(env, chatId, escapeMarkdownV2('⚠️ Gagal ambil pesanan.'));
      return;
    }
    const rows = (await res.json()) as Array<{
      id: string;
      status_pesanan: string;
      total_rm: number;
      kedai_id: string;
    }>;
    if (!Array.isArray(rows) || rows.length === 0) {
      await sendMessage(env, chatId, escapeMarkdownV2('📭 Tiada pesanan aktif. Taip /cari_makan untuk mula.'));
      return;
    }
    const lines = rows
      .map((r) => `🧾 #${escapeMarkdownV2(r.id.slice(0, 8))} \\- ${escapeMarkdownV2(r.status_pesanan)} \\(RM${r.total_rm}\\)`)
      .join('\\n');
    const buttons = rows.slice(0, 2).map((r) => [
      { text: `🏪 Lihat Kedai`, callback_data: `view_shop:${r.kedai_id}` },
    ]);
    await sendMessage(
      env,
      chatId,
      escapeMarkdownV2('📦 PESANAN SAYA:\\n') + lines,
      inlineKeyboard(buttons)
    );
  } catch {
    await sendMessage(env, chatId, escapeMarkdownV2('⚠️ Ralat sistem. Cuba sebentar lagi.'));
  }
}
// End: Phase 32 - Customer Commerce Extension