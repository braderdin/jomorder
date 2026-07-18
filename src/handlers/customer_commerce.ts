// Start: Phase 32 - Customer Commerce Extension (Fasa 24/25 navigation upgrade)
// Fasal 4 (SOA) + Fasal 6 (BM UI) + Fasal 7 S3 (cart buffer). Deep-link ?startapp=kedai_id.
import { Env, TelegramUser } from '../types';
import { sendMessage, escapeMarkdownV2, inlineKeyboard } from '../telegram';
import { handleCustomerNearby, handleAddToCart, handleViewShopMenu } from './customer';
import { handleViewCart } from './customer_cart';

const SUPABASE_REST = (env: Env) => `${env.SUPABASE_URL}/rest/v1`;

function anonHeaders(env: Env): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    apikey: env.SUPABASE_ANON_KEY,
    Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
  };
}

/**
 * Naiktaraf /start untuk parse deep-link token (?startapp=kedai_id).
 * Jika payload ada kedai_id, terus buka web-app menu kedai tersebut.
 */
export async function handleStartDeepLink(
  env: Env,
  chatId: number,
  user: TelegramUser,
  payload?: string
): Promise<void> {
  try {
    if (payload && payload.startsWith('kedai_id=')) {
      const kedaiId = payload.slice('kedai_id='.length).trim();
      if (kedaiId) {
        await handleViewShopMenu(env, chatId, user.id, kedaiId);
        return;
      }
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

/** /troli - papar cart buffer pelanggan (delegate ke customer_cart). */
export async function handleTroliAlias(env: Env, chatId: number, tgId: number): Promise<void> {
  try {
    await handleViewCart(env, chatId, tgId);
  } catch {
    await sendMessage(env, chatId, escapeMarkdownV2('⚠️ Ralat sistem. Cuba sebentar lagi.'));
  }
}

/** /pesanan_saya - senarai pesanan aktif pelanggan (RLS bind tgId). */
export async function handlePesananSaya(env: Env, chatId: number, tgId: number): Promise<void> {
  try {
    const url = `${SUPABASE_REST(env)}/rekod_pesanan?pelanggan_telegram_id=eq.${tgId}&select=id,status_pesanan,total_rm,kedai_id&order=created_at.desc&limit=10`;
    const res = await fetch(url, { method: 'GET', headers: anonHeaders(env) });
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