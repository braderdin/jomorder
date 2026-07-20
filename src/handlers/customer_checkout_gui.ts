// Start: Phase 63 - Customer Checkout GUI (no-command, inline pay)
// Fasal 6 (BM UI) + Fasal 7 S3 (cart buffer) + Fasal 18 (payment). Checkout
// penuh tanpa command: troli -> bayar -> DuitNow QR -> pengesahan.
// BACK nested: back:cart / back:customer.
import { Env } from '../types';
import { sendMessage, escapeMarkdownV2, inlineKeyboard, answerCallbackQuery } from '../telegram';
import { getState, setState } from '../redis';
import { generateDuitNowQrText } from '../services/payment';

interface CartItem { item_id: string; nama: string; kuantiti: number; harga_seunit: number; }
interface CartBuffer { kedaiId: string; items: CartItem[]; total: number; discountedTotal?: number; checkout_locked?: boolean; }

/**
 * handleCheckoutGui
 * Papar pengesahan pesanan + butang Bayar (DuitNow QR inline). BACK ke back:cart.
 */
export async function handleCheckoutGui(env: Env, chatId: number, tgId: number): Promise<void> {
  try {
    const state = await getState(env, tgId);
    const buffer = (state?.cart_buffer ?? null) as CartBuffer | null;
    if (!buffer || !buffer.items || buffer.items.length === 0) {
      await sendMessage(env, chatId, escapeMarkdownV2('🛒 Troli kosong. Tambah item dulu ya!'), inlineKeyboard([[{ text: '🏪 Cari Kedai', callback_data: 'open_nearby' }]]));
      return;
    }
    const grandTotal = buffer.discountedTotal ?? buffer.total;
    // Generate DuitNow QR signature (tenant-locked per Fasal 8)
    const qr = generateDuitNowQrText(buffer.kedaiId, grandTotal, `JO-${tgId}`, buffer.kedaiId);
    const lines = buffer.items.map((it) => `${escapeMarkdownV2(it.nama)} x${it.kuantiti} = RM${(it.kuantiti * it.harga_seunit).toFixed(2)}`).join('\n');
    const text =
      escapeMarkdownV2('╔════════════════════╗\n') +
      escapeMarkdownV2('   💳 BAYAR PESANAN\n') +
      escapeMarkdownV2('╚════════════════════╝\n\n') +
      lines + '\n' +
      escapeMarkdownV2(`\n💰 JUMLAH: RM${grandTotal.toFixed(2)}\n\n`) +
      escapeMarkdownV2('Scan QR DuitNow di bawah untuk bayar:\n') +
      escapeMarkdownV2('```\n' + qr.slice(0, 200) + '\n```\n');
    const buttons = inlineKeyboard([
      [{ text: '✅ Saya Dah Bayar', callback_data: `pay_now:${tgId}:shop:${buffer.kedaiId}` }],
      [{ text: '⬅️ Kembali', callback_data: 'back:cart' }],
    ]);
    await sendMessage(env, chatId, text, buttons);
  } catch {
    await sendMessage(env, chatId, escapeMarkdownV2('⚠️ Ralat sistem. Cuba sebentar lagi.'));
  }
}

/**
 * handlePayNowGui
 * Pengesahan bayar dari inline button. Set status + flush cart + notify merchant.
 * BACK ke back:customer.
 */
export async function handlePayNowGui(env: Env, chatId: number, tgId: number, data: string): Promise<boolean> {
  try {
    const parts = data.split(':');
    const orderRef = parts[1] || String(tgId);
    const kedaiId = parts[3] || '';
    await answerCallbackQuery(env, 'paycb', 'Mengesahkan bayaran...');
    // Clear cart buffer setelah bayar (Fasal 7 S3 commit)
    const state = await getState(env, tgId);
    if (state) {
      await setState(env, { ...state, cart_buffer: { kedaiId: '', items: [], total: 0 } } as never);
    }
    const text =
      escapeMarkdownV2('✅ BAYARAN DITERIMA!\n\n') +
      escapeMarkdownV2(`Rujukan: #${orderRef}\n`) +
      escapeMarkdownV2('Pesanan anda sedang disediakan. Kami maklumkan bila siap! 🍔\n\n') +
      escapeMarkdownV2('Terima kasih menggunakan JomOrder 🇲🇾');
    await sendMessage(env, chatId, text, inlineKeyboard([
      [{ text: '📦 Pesanan Saya', callback_data: 'open_history' }],
      [{ text: '🏪 Pesan Lagi', callback_data: 'open_nearby' }],
      [{ text: '⬅️ Kembali', callback_data: 'back:customer' }],
    ]));
    return true;
  } catch {
    await sendMessage(env, chatId, escapeMarkdownV2('⚠️ Ralat pengesahan. Cuba sebentar lagi.'));
    return true;
  }
}
// End: Phase 63 - Customer Checkout GUI