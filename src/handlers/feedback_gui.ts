// Start: Phase 55 - Customer Feedback GUI (Fasal 6 star rating + BACK)
// Papar borang rating pesanan + komen. Setiap sub-menu ada BACK.
import { Env } from '../types';
import { sendMessage, escapeMarkdownV2, customerReplyKeyboard } from '../telegram';
import { setNav } from './navigation';

/** Papar borang rating untuk pesanan (GUI). */
export async function handleFeedbackGui(
  env: Env,
  chatId: number,
  tgId: number,
  orderId: number
): Promise<void> {
  await setNav(env, tgId, 'customer_main');
  const text =
    escapeMarkdownV2(`⭐ *BERI PENILAIAN*\\n\\n`) +
    escapeMarkdownV2(`Pesanan #${orderId}\\n`) +
    escapeMarkdownV2('Pilih bintang untuk kedai:');
  const kb = {
    inline_keyboard: [
      [
        { text: '⭐', callback_data: `rate:${orderId}:1` },
        { text: '⭐⭐', callback_data: `rate:${orderId}:2` },
      ],
      [
        { text: '⭐⭐⭐', callback_data: `rate:${orderId}:3` },
        { text: '⭐⭐⭐⭐', callback_data: `rate:${orderId}:4` },
      ],
      [{ text: '⭐⭐⭐⭐⭐', callback_data: `rate:${orderId}:5` }],
      [{ text: '⬅️ Kembali', callback_data: 'back:customer' }],
    ],
  };
  await sendMessage(env, chatId, text, kb, customerReplyKeyboard());
}
// End: Phase 55 - Customer Feedback GUI
