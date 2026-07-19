// Start: Phase 55 - Merchant Onboarding GUI (Fasal 6 mobile grid + BACK)
// Pandu peniaga daftar kedai tanpa /command. Setiap step ada BACK.
import { Env } from '../types';
import { sendMessage, escapeMarkdownV2 } from '../telegram';
import { setNav } from './navigation';

/** Papar langkah pendaftaran kedai (GUI). */
export async function handleMerchantOnboardGui(
  env: Env,
  chatId: number,
  tgId: number
): Promise<void> {
  await setNav(env, tgId, 'merchant_main');
  const text =
    escapeMarkdownV2('🏪 *DAFTAR KEDAI BARU*\\n\\n') +
    escapeMarkdownV2('Langkah pendaftaran:\\n') +
    escapeMarkdownV2('1️⃣ Nama kedai\\n') +
    escapeMarkdownV2('2️⃣ Kongsi lokasi 📍\\n') +
    escapeMarkdownV2('3️⃣ Muat naik QR DuitNow\\n\\n') +
    escapeMarkdownV2('Tekan butang untuk mula.');
  const kb = {
    inline_keyboard: [
      [{ text: '✏️ Isi Nama Kedai', callback_data: 'onboard_name' }],
      [{ text: '📍 Kongsi Lokasi', callback_data: 'share_loc' }],
      [{ text: '📤 Muat Naik QR', callback_data: 'upload_qr' }],
      [{ text: '⬅️ Kembali', callback_data: 'nav:main' }],
    ],
  };
  await sendMessage(env, chatId, text, kb);
}
// End: Phase 55 - Merchant Onboarding GUI