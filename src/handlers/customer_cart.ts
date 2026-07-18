// Start: Phase 25 - Modular Cart Inspection Engine (File 5)
// Fasal 4 (SOA) + Fasal 7 Strategy 3 (cart buffer Redis) + Fasal 6 (escape/keyboard).
// handleViewCart: parse JSONB cart buffer dari Upstash, kira total, papar breakdown mobile.
import { Env } from '../types';
import { sendMessage, escapeMarkdownV2, customerMenuKeyboard, inlineKeyboard, answerCallbackQuery } from '../telegram';
import { getState, setState } from '../redis';

/** Struktur cart buffer pelanggan (selari dengan customer.ts CartBuffer). */
interface CartItem {
  item_id: string;
  nama: string;
  kuantiti: number;
  harga_seunit: number;
}
interface CartBuffer {
  kedaiId: string;
  items: CartItem[];
  total: number;
  discountedTotal?: number;
  checkout_locked?: boolean;
}

/**
 * handleViewCart
 * Ekstrak cart buffer aktif pelanggan dari Redis, kira item + jumlah keseluruhan,
 * format teks breakdown MarkdownV2 (escape), attach inline button checkout gateway.
 */
export async function handleViewCart(
  env: Env,
  chatId: number,
  tgId: number,
  queryId?: string
): Promise<boolean> {
  const state = await getState(env, tgId);
  const buffer = (state?.cart_buffer ?? null) as CartBuffer | null;

  // Start: Phase 25 - Dismiss spinner segera bila callback view_cart ditekan
  if (queryId) {
    await answerCallbackQuery(env, queryId, undefined, false);
  }
  // End: Phase 25 - Dismiss spinner

  if (!buffer || !buffer.items || buffer.items.length === 0) {
    await sendMessage(
      env,
      chatId,
      escapeMarkdownV2('🛒 Troli anda kosong. Sila pilih menu kedai dulu.'),
      customerMenuKeyboard()
    );
    return true;
  }

  const lines = buffer.items
    .map(
      (it) =>
        `${escapeMarkdownV2(it.nama)} x${it.kuantiti} = RM${(it.kuantiti * it.harga_seunit).toFixed(2)}`
    )
    .join('\n');

  const itemTotal = buffer.items.reduce((s, it) => s + it.kuantiti * it.harga_seunit, 0);
  const grandTotal = buffer.discountedTotal ?? buffer.total ?? itemTotal;

  const header =
    escapeMarkdownV2('🛒 TROLI ANDA:\\n') +
    lines +
    escapeMarkdownV2(`\\n\\nJUMLAH: RM${grandTotal.toFixed(2)}`);

  // Start: Phase 38 - Cart Checkout Lock (elak duplicate checkout concurrent)
  // Jika flag checkout_locked aktif, halang double-submit dengan button berbeza.
  let keyboard;
  if (buffer.checkout_locked === true) {
    keyboard = inlineKeyboard([
      [{ text: '⏳ Sedang Diproses', callback_data: 'checkout_blocked' }],
      [{ text: '🍔 Tambah Lagi', callback_data: 'browse_more' }],
    ]);
  } else {
    // Kunci segera supaya request concurrent tidak spawn checkout berganda.
    const nextBuffer: CartBuffer = { ...buffer, checkout_locked: true };
    if (state) {
      await setState(env, { ...state, cart_buffer: nextBuffer } as never);
    }
    keyboard = inlineKeyboard([
      [{ text: '💳 Bayar Sekarang', callback_data: 'checkout_now' }],
      [{ text: '🍔 Tambah Lagi', callback_data: 'browse_more' }],
    ]);
  }
  // End: Phase 38 - Cart Checkout Lock

  await sendMessage(env, chatId, header, keyboard);
  return true;
}
// End: Phase 25 - Modular Cart Inspection Engine (File 5)
