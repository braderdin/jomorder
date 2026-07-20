// Start: Phase 63 - Customer Commerce Full GUI (no-command)
// Fasal 6 (BM UI) + Fasal 7 S3 (cart buffer). GUI penuh pelanggan:
// cari kedai -> lihat menu -> tambah troli -> checkout -> bayar.
// Semua butang inline + BACK nested (back:customer / back:cart / back:shop).
import { Env } from '../types';
import { sendMessage, escapeMarkdownV2, inlineKeyboard, customerReplyKeyboard, navGrid } from '../telegram';
import { handleCustomerNearby, handleViewShopMenu, handleAddToCart } from './customer';
import { handleViewCart } from './customer_cart';
import { getState } from '../redis';

const SUPABASE_REST = (env: Env) => `${env.SUPABASE_URL}/rest/v1`;

function svcHeaders(env: Env): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  };
}

/**
 * handleCustomerCommerceGui
 * Pintu masuk GUI komersial pelanggan. Papar grid: Cari Kedai / Troli / Pesanan.
 * BACK ke nav:main.
 */
export async function handleCustomerCommerceGui(env: Env, chatId: number, tgId: number): Promise<void> {
  const text = escapeMarkdownV2('🛒 PUSAT PESANAN\\n\\nPilih untuk mula:');
  const buttons = inlineKeyboard([
    [{ text: '🏪 Cari Kedai', callback_data: 'open_nearby' }, { text: '🛍️ Troli', callback_data: 'open_cart' }],
    [{ text: '📦 Pesanan Saya', callback_data: 'open_history' }],
    [{ text: '⬅️ Kembali', callback_data: 'nav:main' }],
  ]);
  await sendMessage(env, chatId, text, buttons, customerReplyKeyboard());
}

/**
 * handleNearbyShopGui
 * Cari kedai berdekatan + papar senarai sebagai inline buttons (no-command).
 * Jika tiada lokasi, prom share location.
 */
export async function handleNearbyShopGui(env: Env, chatId: number, tgId: number): Promise<void> {
  try {
    const st = await getState(env, tgId);
    const hasLoc = !!(st && (st as unknown as { lat?: number; lng?: number }).lat);
    if (!hasLoc) {
      await sendMessage(
        env,
        chatId,
        escapeMarkdownV2('📍 Kongsi lokasi anda untuk cari kedai berdekatan:'),
        {
          keyboard: [[{ text: '📍 Kongsi Lokasi Saya', request_location: true }]],
          resize_keyboard: true,
          one_time_keyboard: false,
        }
      );
      return;
    }
    const found = await handleCustomerNearby(env, chatId, tgId);
    if (!found) {
      await sendMessage(
        env,
        chatId,
        escapeMarkdownV2('🔍 Tiada kedai berdekatan dijumpai dalam radius 10km.\\n\\nKongsi lokasi lain atau kembali.'),
        inlineKeyboard([[{ text: '⬅️ Kembali', callback_data: 'back:customer' }]]),
        { keyboard: [[{ text: '📍 Kongsi Lokasi Saya', request_location: true }]], resize_keyboard: true }
      );
      return;
    }
    // handleCustomerNearby sudah hantar senarai; append BACK sahaja.
    await sendMessage(env, chatId, escapeMarkdownV2('⬅️ Pilihan lain?'), inlineKeyboard([[{ text: '⬅️ Kembali', callback_data: 'back:customer' }]]));
  } catch {
    await sendMessage(env, chatId, escapeMarkdownV2('⚠️ Ralat sistem. Cuba sebentar lagi.'));
  }
}

/**
 * handleShopMenuGui
 * Lihat menu kedai sebagai inline buttons tambah ke troli (no-command).
 * BACK ke nearby shops.
 */
export async function handleShopMenuGui(env: Env, chatId: number, tgId: number, kedaiId: string): Promise<void> {
  try {
    const ok = await handleViewShopMenu(env, chatId, tgId, kedaiId);
    if (!ok) {
      await sendMessage(env, chatId, escapeMarkdownV2('⚠️ Kedai tidak dijumpai.'), navGrid());
      return;
    }
    await sendMessage(env, chatId, escapeMarkdownV2('🛒 Tambah item ke troli di atas, atau:'), inlineKeyboard([
      [{ text: '🛍️ Lihat Troli', callback_data: 'open_cart' }],
      [{ text: '⬅️ Kembali', callback_data: 'back:shop' }],
    ]));
  } catch {
    await sendMessage(env, chatId, escapeMarkdownV2('⚠️ Ralat sistem. Cuba sebentar lagi.'));
  }
}

/**
 * handleAddToCartGui
 * Tambah item ke troli dari GUI, kemudian papar troli + BACK cart.
 */
export async function handleAddToCartGui(env: Env, chatId: number, tgId: number, itemId: string, kedaiId: string, cbId: string): Promise<void> {
  try {
    const ok = await handleAddToCart(env, chatId, tgId, itemId, kedaiId, cbId);
    if (!ok) {
      await sendMessage(env, chatId, escapeMarkdownV2('⚠️ Gagal tambah ke troli.'), navGrid());
      return;
    }
    await handleViewCart(env, chatId, tgId);
  } catch {
    await sendMessage(env, chatId, escapeMarkdownV2('⚠️ Ralat sistem. Cuba sebentar lagi.'));
  }
}
// End: Phase 63 - Customer Commerce Full GUI