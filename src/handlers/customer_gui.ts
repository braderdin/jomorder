// Start: Phase 55 - Customer GUI Menu (Fasal 6 mobile grid + BACK)
// Papar menu utama pelanggan tanpa perlu taip /command. Setiap sub-menu
// disertakan butang BACK (nav:main). Integrasi dengan navigation.ts state.
import { Env, TelegramUser } from '../types';
import { sendMessage, escapeMarkdownV2, navGrid, customerReplyKeyboard } from '../telegram';
import { setNav, minigameButton } from './navigation';

/** Papar papan pemerintah pelanggan (GUI). */
export async function handleCustomerGui(env: Env, chatId: number, tgId: number): Promise<void> {
  if (typeof tgId === 'number') await setNav(env, tgId, 'customer_main');
  const text =
    escapeMarkdownV2('🛒 *PAPAN PELANGGAN JomOrder*\\n\\n') +
    escapeMarkdownV2('Pilih tindakan di bawah:\\n') +
    escapeMarkdownV2('📍 Cari kedai berdekatan\\n') +
    escapeMarkdownV2('🏪 Lihat menu kedai\\n') +
    escapeMarkdownV2('🛒 Troli & semak pesanan\\n') +
    escapeMarkdownV2('🎟️ Kupon promo aktif\\n') +
    escapeMarkdownV2('📖 Sejarah pesanan\\n') +
    escapeMarkdownV2('👤 Profil & langganan');
  const kb = {
    inline_keyboard: [
      [{ text: '📍 Cari Kedai', callback_data: 'open_nearby' }, { text: '🏪 Menu Kedai', callback_data: 'open_shops' }],
      [{ text: '🛒 Troli', callback_data: 'open_cart' }, { text: '🎟️ Promo', callback_data: 'open_promo' }],
      [{ text: '📖 Sejarah', callback_data: 'open_history' }, { text: '👤 Profil', callback_data: 'open_profile' }],
      [{ text: '💳 Bayar', callback_data: 'open_pay' }, { text: '⭐ Nilai', callback_data: 'open_review' }],
      [{ text: '🏆 Kedai Contoh', callback_data: 'founder_view' }, { text: '⬅️ Kembali', callback_data: 'nav:main' }],
    ],
  };
  await sendMessage(env, chatId, text, kb, customerReplyKeyboard());
}

/** Papar sub-menu kedai berdekatan (stub -> delegate ke customer nearby). */
export async function handleCustomerShopsGui(env: Env, chatId: number, tgId: number): Promise<void> {
  const { handleCustomerNearby } = await import('./customer');
  await handleCustomerNearby(env, chatId, tgId);
}
// End: Phase 55 - Customer GUI Menu