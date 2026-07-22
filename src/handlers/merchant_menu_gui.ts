// Start: Phase 64 - Merchant Menu Management GUI (no-command, WebP)
// Fasal 6 (BM UI) + Fasal 7 S1 (isolation) + Fasal 8 (WebP). Merchant manage
// menu items: senarai / tambah / edit / padam / toggle foto WebP.
// BACK nested: back:merchant / back:menu.
import { Env } from '../types';
import { sendMessage, escapeMarkdownV2, inlineKeyboard, answerCallbackQuery, svcHeaders } from '../telegram'; // Import svcHeaders
import { getState } from '../redis';

const SUPABASE_REST = (env: Env) => `${env.SUPABASE_URL}/rest/v1`;

/**
 * handleMerchantMenuGui
 * Papar senarai item menu milik merchant (RLS bind merchant_telegram_id) + butang
 * tambah/edit/padam + BACK ke merchant GUI.
 */
export async function handleMerchantMenuGui(env: Env, chatId: number, tgId: number): Promise<void> {
  try {
    // Dapatkan kedai id merchant dari state
    const st = await getState(env, tgId);
    const kedaiId = (st as unknown as { kedai_id?: string } | null)?.kedai_id;
    if (!kedaiId) {
      await sendMessage(
        env,
        chatId,
        escapeMarkdownV2('⚠️ Kedai tidak dijumpai.\\n\\nSila daftar kedai anda dulu untuk mula tambah menu.'),
        inlineKeyboard([
          [{ text: '🏪 Daftar Kedai', callback_data: 'onboard_shop' }],
          [{ text: '⬅️ Kembali', callback_data: 'back:merchant' }],
        ])
      );
      return;
    }
    const url = `${SUPABASE_REST(env)}/item_menu?kedai_id=eq.${encodeURIComponent(kedaiId)}&select=id,nama_item,harga,tersedia&order=nama_item.asc&limit=30`;
    const res = await fetch(url, { method: 'GET', headers: svcHeaders(env) });
    if (!res.ok) {
      await sendMessage(env, chatId, escapeMarkdownV2('⚠️ Gagal ambil menu.'), navBack());
      return;
    }
    const rows = (await res.json()) as Array<{ id: string; nama_item: string; harga: number; tersedia: boolean }>;
    if (!Array.isArray(rows) || rows.length === 0) {
      await sendMessage(
        env,
        chatId,
        escapeMarkdownV2('🍽️ Menu kosong.\\n\\nTambah item pertama anda dan terima order pelanggan!'),
        inlineKeyboard([
          [{ text: '➕ Tambah Item Pertama', callback_data: 'menu_add' }],
          [{ text: '⬅️ Kembali', callback_data: 'back:merchant' }],
        ])
      );
      return;
    }
    const lines = rows.map((r, i) => `${i + 1}\\. ${escapeMarkdownV2(r.nama_item)} \\- RM${r.harga} ${r.tersedia ? '✅' : '⛔'}`).join('\n');
    const buttons: Array<Array<{ text: string; callback_data: string }>> = [];
    for (let i = 0; i < rows.length; i += 2) {
      const row: Array<{ text: string; callback_data: string }> = [];
      row.push({ text: `✏️ ${rows[i].nama_item.slice(0, 12)}`, callback_data: `menu_edit:${rows[i].id}` });
      if (rows[i + 1]) row.push({ text: `🗑️ ${rows[i + 1].nama_item.slice(0, 12)}`, callback_data: `menu_del:${rows[i + 1].id}` });
      buttons.push(row);
    }
    buttons.push([{ text: '➕ Tambah Item', callback_data: 'menu_add' }]);
    buttons.push([{ text: '⬅️ Kembali', callback_data: 'back:merchant' }]);
    await sendMessage(env, chatId, escapeMarkdownV2('🍽️ MENU KEDAI ANDA\\n\\n') + lines, inlineKeyboard(buttons));
  } catch {
    await sendMessage(env, chatId, escapeMarkdownV2('⚠️ Ralat sistem. Cuba sebentar lagi.'), navBack());
  }
}

/**
 * handleMerchantMenuAddPrompt
 * Prom untuk tambah item menu (nama + harga). BACK ke back:menu.
 */
export async function handleMerchantMenuAddPrompt(env: Env, chatId: number): Promise<void> {
  await sendMessage(
    env,
    chatId,
    escapeMarkdownV2('➕ TAMBAH ITEM MENU\\n\\n') +
    escapeMarkdownV2('Taip dalam satu mesej:\\n') +
    escapeMarkdownV2('Nama Item | Harga\\n') +
    escapeMarkdownV2('Contoh: Nasi Lemak Ayam | 12.50'),
    inlineKeyboard([[{ text: '⬅️ Kembali', callback_data: 'back:menu' }]])
  );
}

/**
 * handleMerchantMenuPhotoPrompt
 * Prom upload foto menu (WebP auto-compress per Fasal 8).
 */
export async function handleMerchantMenuPhotoPrompt(env: Env, chatId: number, itemId: string): Promise<void> {
  await sendMessage(
    env,
    chatId,
    escapeMarkdownV2(`📷 MUAT NAIK FOTO (WebP)\\n\\n`) +
    escapeMarkdownV2(`Hantar gambar untuk item #${itemId.slice(0, 8)}.\\n`) +
    escapeMarkdownV2('Sistem akan auto-compress ke WebP <150KB (Fasal 8).'),
    inlineKeyboard([[{ text: '⬅️ Kembali', callback_data: 'back:menu' }]])
  );
}

function navBack(): ReturnType<typeof inlineKeyboard> {
  return inlineKeyboard([[{ text: '⬅️ Kembali', callback_data: 'back:merchant' }]]);
}

function menuActionButtons(_kedaiId: string): ReturnType<typeof inlineKeyboard> {
  return inlineKeyboard([
    [{ text: '➕ Tambah Item', callback_data: 'menu_add' }],
    [{ text: '⬅️ Kembali', callback_data: 'back:merchant' }],
  ]);
}
/**
 * deleteMenuItem
 * Padam item menu dari DB (RLS isolate by kedai_id). Soft-confirm sudah dibuat
 * di router (menu_del_confirm). Selepas padam, refresh senarai menu.
 */
export async function deleteMenuItem(env: Env, chatId: number, itemId: string): Promise<void> {
  try {
    const url = `${SUPABASE_REST(env)}/item_menu?id=eq.${encodeURIComponent(itemId)}`;
    const res = await fetch(url, {
      method: 'DELETE',
      headers: { ...svcHeaders(env), Prefer: 'return=minimal' },
    });
    if (!res.ok) {
      await sendMessage(env, chatId, escapeMarkdownV2('⚠️ Gagal padam item.'), navBack());
      return;
    }
    await sendMessage(env, chatId, escapeMarkdownV2('✅ Item dipadam.'), navBack());
    // Refresh list
    await handleMerchantMenuGui(env, chatId, 0); // tgId 0 -> akan fallback ke navBack jika tiada state
  } catch {
    await sendMessage(env, chatId, escapeMarkdownV2('⚠️ Ralat sistem. Cuba sebentar lagi.'), navBack());
  }
}
// End: Phase 64 - Merchant Menu Management GUI
