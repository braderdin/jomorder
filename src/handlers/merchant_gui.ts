// Start: Phase 55 - Merchant GUI Menu (Fasal 6 mobile grid + BACK)
// Papar papan pemerintah peniaga tanpa /command. Setiap sub-menu ada BACK.
import { Env } from '../types';
import { sendMessage, escapeMarkdownV2, merchantReplyKeyboard } from '../telegram';
import { setNav } from './navigation';

/** Papar papan pemerintah peniaga (GUI). */
export async function handleMerchantGui(env: Env, chatId: number, tgId: number): Promise<void> {
  if (typeof tgId === 'number') await setNav(env, tgId, 'merchant_main');
  const text =
    escapeMarkdownV2('🏪 *PAPAN PENIAGA JomOrder*\\n\\n') +
    escapeMarkdownV2('Urus kedai anda dengan pantas:\\n') +
    escapeMarkdownV2('🟢 Buka/Tutup kedai\\n') +
    escapeMarkdownV2('📋 Menu kedai\\n') +
    escapeMarkdownV2('📦 Pesanan masuk\\n') +
    escapeMarkdownV2('📊 Laporan jualan\\n') +
    escapeMarkdownV2('🎟️ Cipta kupon\\n') +
    escapeMarkdownV2('⚙️ Tetapan & QR\\n') +
    escapeMarkdownV2('📍 Zon operasi');
  const kb = {
    inline_keyboard: [
      [{ text: '🟢 Buka/Tutup', callback_data: 'toggle_status' }, { text: '📋 Menu', callback_data: 'merchant_menu' }],
      [{ text: '📦 Pesanan', callback_data: 'merchant_orders' }, { text: '📊 Laporan', callback_data: 'merchant_report' }],
      [{ text: '🎟️ Kupon', callback_data: 'open_promo' }, { text: '⚙️ Tetapan', callback_data: 'merchant_settings' }],
      [{ text: '📍 Zon', callback_data: 'merchant_zon' }],
      [{ text: '⬅️ Kembali', callback_data: 'nav:main' }],
    ],
  };
  await sendMessage(env, chatId, text, kb, merchantReplyKeyboard());
}
// End: Phase 55 - Merchant GUI Menu
