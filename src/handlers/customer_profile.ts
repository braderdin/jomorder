// Start: Phase 55 - Customer Profile GUI (Fasal 6 mobile grid + BACK)
// Papar profil pelanggan + langganan tanpa /command. Setiap sub-menu ada BACK.
import { Env } from '../types';
import { sendMessage, escapeMarkdownV2, customerReplyKeyboard } from '../telegram';
import { getSubscriptionStatus } from '../subscription';
import { setNav } from './navigation';

/** Papar profil pelanggan (nama, lokasi, langganan). */
export async function handleCustomerProfileGui(
  env: Env,
  chatId: number,
  tgId: number
): Promise<void> {
  await setNav(env, tgId, 'customer_main');
  const sub = await getSubscriptionStatus(env, tgId);
  const subTier = (sub as string) || 'PERCUMA';
  const text =
    escapeMarkdownV2('👤 *PROFIL PELANGGAN*\\n\\n') +
    escapeMarkdownV2(`🆔 ID: ${tgId}\\n`) +
    escapeMarkdownV2(`📶 Langganan: ${subTier}\\n\\n`) +
    escapeMarkdownV2('Guna butang di bawah untuk urus akaun.');
  const kb = {
    inline_keyboard: [
      [{ text: '📍 Kongsi Lokasi', callback_data: 'share_loc' }, { text: '🎟️ Promo', callback_data: 'open_promo' }],
      [{ text: '📖 Sejarah', callback_data: 'open_history' }],
      [{ text: '⬅️ Kembali', callback_data: 'nav:main' }],
    ],
  };
  await sendMessage(env, chatId, text, kb, customerReplyKeyboard());
}
// End: Phase 55 - Customer Profile GUI
